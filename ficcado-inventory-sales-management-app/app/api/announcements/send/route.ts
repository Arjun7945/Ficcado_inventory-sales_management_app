/**
 * app/api/announcements/send/route.ts
 *
 * POST /api/announcements/send
 *
 * Ultra-Fast Announcement Email Broadcast Engine:
 *  - Nodemailer SMTP connection pooling (pool: true, maxConnections: 5)
 *  - Parallel batch dispatch (Promise.all in chunks of 10) -> 100+ emails in < 30 seconds
 *  - Real Markdown renderer (lib/emailMarkdown.ts)
 *  - Ficcado DESIGN.md branded email template (#FBF9F5, #2B62C6, #22261E)
 *  - Pre-send admin validations with clear error messages
 */

import { getAuthSession } from '@/lib/auth';
import { readAllRows, appendRows } from '@/lib/google/moduleSheet';
import { buildHeaderMap, getCellByHeader } from '@/lib/google/headerUtils';
import { getAppMeta, decryptValue } from '@/lib/google/appMeta';
import { logActivity } from '@/lib/activityLogger';
import { renderEmailMarkdown } from '@/lib/emailMarkdown';
import nodemailer from 'nodemailer';

export const dynamic = 'force-dynamic';

export interface AttachmentInput {
  filename:    string;
  content:     string;  // base64 encoded string
  contentType: string;
  sizeBytes:   number;
}

async function getEmailConfig() {
  const [sender, encryptedPass] = await Promise.all([
    getAppMeta('gmail_sender'),
    getAppMeta('gmail_password_enc'),
  ]);

  if (!encryptedPass) {
    throw new Error('Gmail sending is not configured. Please enter your Gmail credentials in Setup / Settings.');
  }

  const pass = decryptValue(encryptedPass);
  return { sender: sender || 'ficcado@gmail.com', pass };
}

/** Formats byte size into human readable string */
function formatSize(bytes: number): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export async function POST(request: Request) {
  const auth = await getAuthSession();
  if ('errorResponse' in auth) return auth.errorResponse;
  const admin = auth.admin;

  try {
    const body = await request.json();
    const { audienceType, minOrders, maxOrders, selectedPhones, subject, bodyText, attachments } = body as {
      audienceType:   'all' | 'orders_gte' | 'orders_lt' | 'custom';
      minOrders?:     number;
      maxOrders?:     number;
      selectedPhones?: string[];
      subject:        string;
      bodyText:       string;
      attachments?:   AttachmentInput[];
    };

    // ── 1. Input & Content Validations ───────────────────────────────────────
    if (!subject?.trim()) {
      return Response.json({
        error: 'Validation Failed: Email Subject line cannot be empty. Please enter a subject for the announcement.',
      }, { status: 400 });
    }
    if (!bodyText?.trim()) {
      return Response.json({
        error: 'Validation Failed: Email Message Content cannot be empty. Please type the announcement body.',
      }, { status: 400 });
    }

    // ── 2. Attachment Size & Format Validations ─────────────────────────────
    const parsedAttachments: Array<{ filename: string; content: Buffer; contentType: string; sizeBytes: number }> = [];
    let totalSizeBytes = 0;

    if (attachments && Array.isArray(attachments) && attachments.length > 0) {
      for (const att of attachments) {
        if (!att.filename || !att.content) {
          return Response.json({
            error: `Validation Failed: Invalid attachment '${att.filename || 'Unknown'}'. File content is missing or corrupted.`,
          }, { status: 400 });
        }

        const sizeInBytes = att.sizeBytes || Math.round((att.content.length * 3) / 4);
        totalSizeBytes += sizeInBytes;

        parsedAttachments.push({
          filename:    att.filename,
          content:     Buffer.from(att.content, 'base64'),
          contentType: att.contentType || 'application/octet-stream',
          sizeBytes:   sizeInBytes,
        });
      }

      const totalSizeMB = (totalSizeBytes / (1024 * 1024)).toFixed(2);
      const MAX_ALLOWED_MB = 15;
      if (totalSizeBytes > MAX_ALLOWED_MB * 1024 * 1024) {
        return Response.json({
          error: `Validation Failed: Attachment limit exceeded. Total size of attachments is ${totalSizeMB} MB, which exceeds the maximum allowed ${MAX_ALLOWED_MB} MB limit for Gmail delivery. Please remove or compress some files before sending.`,
        }, { status: 400 });
      }
    }

    // ── 3. Customer Directory & Audience Segmentation Validations ─────────────
    const rows = await readAllRows('customer_info');
    if (rows.length < 2) {
      return Response.json({
        error: 'Validation Failed: No registered customer records were found in Customer Information Management to send emails.',
      }, { status: 400 });
    }

    const ciMap = buildHeaderMap(rows[0]);
    const allCustomers = rows.slice(1).map((r) => ({
      name:        getCellByHeader(r, ciMap, 'Customer Name') || 'Valued Customer',
      phone:       getCellByHeader(r, ciMap, 'Phone Number'),
      email:       getCellByHeader(r, ciMap, 'Email ID').trim(),
      totalOrders: parseInt(getCellByHeader(r, ciMap, 'Total Number of Orders', '0'), 10) || 0,
    })).filter((c) => c.phone || c.email);

    let targetList = allCustomers;
    let audienceLabel = 'All Customers';

    if (audienceType === 'orders_gte') {
      const min = typeof minOrders === 'number' ? minOrders : 1;
      targetList = allCustomers.filter((c) => c.totalOrders >= min);
      audienceLabel = `Customers with total orders >= ${min}`;
    } else if (audienceType === 'orders_lt') {
      const max = typeof maxOrders === 'number' ? maxOrders : 1;
      targetList = allCustomers.filter((c) => c.totalOrders < max);
      audienceLabel = `Customers with total orders < ${max}`;
    } else if (audienceType === 'custom') {
      const phoneSet = new Set(selectedPhones || []);
      targetList = allCustomers.filter((c) => phoneSet.has(c.phone));
      audienceLabel = `Selected ${targetList.length} Customer(s)`;
    }

    const recipientsWithEmail = targetList.filter((c) => c.email && c.email.includes('@'));
    const skippedNoEmailCount = targetList.length - recipientsWithEmail.length;

    if (recipientsWithEmail.length === 0) {
      return Response.json({
        error: `Validation Failed: No targeted customers in segment "${audienceLabel}" have a valid email address configured. (${targetList.length} targeted, ${skippedNoEmailCount} missing email address).`,
      }, { status: 400 });
    }

    // ── 4. Gmail Credentials & Pooled Transporter Setup ─────────────────────
    let emailConfig;
    try {
      emailConfig = await getEmailConfig();
    } catch (configErr: any) {
      return Response.json({
        error: `Validation Failed: ${configErr?.message || 'Gmail app password is not configured in Settings / Setup Wizard.'}`,
      }, { status: 400 });
    }

    // High-performance pooled SMTP transporter
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      pool: true,
      maxConnections: 5,
      maxMessages: 100,
      auth: {
        user: emailConfig.sender,
        pass: emailConfig.pass,
      },
    });

    let sentCount   = 0;
    let failedCount = 0;
    const errors: string[] = [];

    // Attachments payload for Nodemailer
    const mailAttachments = parsedAttachments.map((a) => ({
      filename:    a.filename,
      content:     a.content,
      contentType: a.contentType,
    }));

    // Attachments HTML banner
    const attachmentsHtmlBanner = parsedAttachments.length > 0 ? `
      <div style="margin: 24px 0 12px 0; padding: 14px 16px; background-color: #F4F6F9; border: 1px solid #E2E8F0; border-left: 4px solid #2B62C6; border-radius: 8px;">
        <div style="font-size: 13px; font-weight: 700; color: #2B62C6; margin-bottom: 8px;">
          📎 Attached File(s) (${parsedAttachments.length}):
        </div>
        <div style="display: flex; flex-direction: column; gap: 4px;">
          ${parsedAttachments.map((a) => `
            <div style="font-size: 12.5px; color: #22261E; font-family: monospace;">
              • <strong>${a.filename}</strong> <span style="color: #6B6A5E;">(${formatSize(a.sizeBytes)})</span>
            </div>
          `).join('')}
        </div>
      </div>
    ` : '';

    // ── 5. Parallel Concurrency Dispatch (Batch size: 10) ────────────────────
    const BATCH_SIZE = 10;
    for (let i = 0; i < recipientsWithEmail.length; i += BATCH_SIZE) {
      const batch = recipientsWithEmail.slice(i, i + BATCH_SIZE);

      await Promise.all(
        batch.map(async (recipient) => {
          // Substitute personalization tags
          const personalizedRawBody = bodyText.replace(/\{customerName\}/g, recipient.name);
          // Convert Markdown to clean HTML elements
          const formattedHtmlBody  = renderEmailMarkdown(personalizedRawBody);

          const htmlContent = `
            <!DOCTYPE html>
            <html>
              <head>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>${subject.trim()}</title>
              </head>
              <body style="margin: 0; padding: 0; background-color: #FBF9F5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #22261E; -webkit-font-smoothing: antialiased;">
                <div style="max-width: 620px; margin: 30px auto; background-color: #FFFFFF; border: 1px solid #E5E0D8; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.03);">

                  <!-- Header Banner (docs/DESIGN.md) -->
                  <div style="background-color: #FFFFFF; padding: 28px 32px 20px 32px; text-align: center; border-bottom: 2px solid #2B62C6;">
                    <div style="font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 24px; font-weight: 800; color: #2B62C6; letter-spacing: 4px; margin-bottom: 4px;">
                      F I C C A D O
                    </div>
                    <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 1.5px; color: #6B6A5E; font-weight: 600;">
                      Ficcado Clothing & Apparel
                    </div>
                  </div>

                  <!-- Main Content Area -->
                  <div style="padding: 32px 36px 28px 36px;">
                    ${formattedHtmlBody}
                    ${attachmentsHtmlBanner}
                  </div>

                  <!-- Footer Section -->
                  <div style="background-color: #FBF9F5; padding: 20px 32px; text-align: center; border-top: 1px solid #E5E0D8; font-size: 12px; color: #6B6A5E; line-height: 1.5;">
                    <div style="font-weight: 700; color: #22261E; margin-bottom: 4px;">
                      Ficcado — Wear Your Identity.
                    </div>
                    <div>
                      This official update was sent to <strong>${recipient.name}</strong> (${recipient.email}).
                    </div>
                  </div>

                </div>
              </body>
            </html>
          `;

          try {
            await transporter.sendMail({
              from: `"Ficcado" <${emailConfig.sender}>`,
              to: recipient.email,
              subject: subject.trim(),
              text: personalizedRawBody,
              html: htmlContent,
              attachments: mailAttachments,
            });
            sentCount++;
          } catch (err: any) {
            failedCount++;
            errors.push(`${recipient.name} (${recipient.email}): ${err?.message || 'Failed'}`);
          }
        })
      );
    }

    // Close transport pool
    transporter.close();

    // ── 6. Log Announcement Record & Activity ────────────────────────────────
    const annRows = await readAllRows('announcements').catch(() => []);
    const sno     = String(Math.max(annRows.length - 1, 0) + 1);
    const now     = new Date().toISOString();

    const attachmentSummary = parsedAttachments.length > 0
      ? ` (Attachments: ${parsedAttachments.map((a) => a.filename).join(', ')})`
      : '';

    const newLog = [
      sno,
      subject.trim() + attachmentSummary,
      audienceLabel,
      String(targetList.length),
      String(sentCount),
      String(failedCount),
      now,
      admin.name,
    ];
    await appendRows('announcements', [newLog]).catch(() => {});

    await logActivity({
      adminName: admin.name,
      action: 'created',
      module: 'Announcements',
      moduleKey: 'announcements',
      recordId: sno,
      customMessage: `Admin '${admin.name}' broadcasted announcement email "${subject}" to ${sentCount} recipient(s) (${audienceLabel}). ${failedCount} failed, ${skippedNoEmailCount} skipped.${attachmentSummary}`,
    }).catch(() => {});

    return Response.json({
      success: true,
      summary: {
        totalTargeted: targetList.length,
        recipientsWithEmail: recipientsWithEmail.length,
        sentCount,
        failedCount,
        skippedNoEmailCount,
        attachmentCount: parsedAttachments.length,
        errors: errors.slice(0, 5),
      },
    });
  } catch (err: any) {
    return Response.json({
      error: `Server Error: Unable to broadcast announcement email. ${err?.message || 'Unknown error'}`,
    }, { status: 500 });
  }
}
