/**
 * app/api/notes/[id]/notify-email/route.ts
 *
 * POST /api/notes/[id]/notify-email
 *
 * Triggers an immediate professional email notification to all registered admins
 * (except the note creator / current admin) informing them of a team note.
 *
 * Triggered strictly when an admin clicks the 'Notify All via Email' button on a note.
 */

import { requireAuth } from '@/lib/auth';
import { readAllRows } from '@/lib/google/moduleSheet';
import { getAppMeta, decryptValue } from '@/lib/google/appMeta';
import nodemailer from 'nodemailer';

export const dynamic = 'force-dynamic';

const COL = { sno: 0, content: 1, createdBy: 2, createdAt: 3, updatedBy: 4, updatedAt: 5 };

async function getEmailConfig() {
  const [sender, encryptedPass] = await Promise.all([
    getAppMeta('gmail_sender'),
    getAppMeta('gmail_password_enc'),
  ]);

  if (!encryptedPass) {
    throw new Error('Gmail app password is not configured. Complete Setup Wizard Step 3 or Admin Settings first.');
  }

  const pass = decryptValue(encryptedPass);
  return { sender: sender || 'ficcado@gmail.com', pass };
}

/**
 * Fetch all registered admins with email notifications enabled,
 * excluding the note creator / current triggering admin.
 */
async function getTargetAdminRecipients(creatorName: string, currentAdminName: string): Promise<string[]> {
  const rows = await readAllRows('admin_info');
  const creatorLower = creatorName.trim().toLowerCase();
  const currentLower = currentAdminName.trim().toLowerCase();

  const recipients: string[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const adminName = (row[1] ?? '').trim();
    const email     = (row[3] ?? '').trim();
    const notif     = (row[4] ?? '').trim();

    if (!email || notif === 'Disabled') continue;

    const nameLower = adminName.toLowerCase();
    const emailLower = email.toLowerCase();

    // Exclude the creator of the note and the admin triggering the email
    if (nameLower === creatorLower || nameLower === currentLower) continue;

    if (!recipients.includes(email)) {
      recipients.push(email);
    }
  }

  return recipients;
}

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let admin;
  try {
    admin = await requireAuth();
  } catch (e) {
    if (e instanceof Response) return e;
    return Response.json({ error: 'Authentication required.' }, { status: 401 });
  }

  try {
    // 1. Fetch target note with 2-pass exact lookup to prevent sno vs rowIndex collisions
    const rows = await readAllRows('keep_notes');
    let idx = rows.slice(1).findIndex((r) => r[COL.sno] && String(r[COL.sno]).trim() === id);
    if (idx === -1) {
      idx = rows.slice(1).findIndex((_, i) => String(i + 2) === id || String(i + 1) === id);
    }

    if (idx === -1) {
      return Response.json({ error: 'Note not found.' }, { status: 404 });
    }

    const row = rows[idx + 1];
    const noteContent = row[COL.content] ?? '';
    const creatorName = row[COL.createdBy] ?? admin.name;

    // Permission check: Creator only (case & first-name flexible match)
    const creatorLower = creatorName.trim().toLowerCase();
    const currentLower = admin.name.trim().toLowerCase();
    const isMatch = creatorLower === currentLower ||
      (creatorLower.split(/\s+/)[0] === currentLower.split(/\s+/)[0] && creatorLower.split(/\s+/)[0].length >= 2);

    if (creatorLower && !isMatch) {
      return Response.json(
        { error: `Permission denied — only the creator of this note (${row[COL.createdBy]}) can send email notifications for it.` },
        { status: 403 }
      );
    }

    // 2. Resolve email credentials
    const { sender, pass } = await getEmailConfig();

    // 3. Resolve target admin recipients (excluding creator/current user)
    const recipients = await getTargetAdminRecipients(creatorName, admin.name);

    if (recipients.length === 0) {
      return Response.json({
        success: true,
        message: 'No other admin emails found to notify.',
        recipients: [],
      });
    }

    const rawAppUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://ficcadoinventory-managementportal.netlify.app';
    const appUrl = rawAppUrl.replace(/\/+$/, '');
    const currentYear = new Date().getFullYear();
    const formattedNoteContent = noteContent
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\n/g, '<br>');

    const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Ficcado Team Note Alert</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #F4F0E5; margin: 0; padding: 24px 16px; color: #22261E; }
    .container { max-width: 600px; margin: 0 auto; background: #FFFFFF; border-radius: 12px; overflow: hidden; border: 1px solid #E2DCC9; box-shadow: 0 4px 16px rgba(34,38,30,0.06); }
    .header { background-color: #2B62C6; padding: 24px 32px; text-align: center; }
    .header h1 { color: #FFFFFF; margin: 0; font-size: 20px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; }
    .content { padding: 32px 28px; }
    .sender-badge { display: inline-block; background-color: #B4D1EF; color: #1E3A8A; padding: 4px 12px; border-radius: 9999px; font-size: 12px; font-weight: 700; margin-bottom: 14px; letter-spacing: 0.5px; text-transform: uppercase; }
    .note-box { background-color: #F4F0E5; border-left: 4px solid #2B62C6; border-radius: 0 8px 8px 0; padding: 18px 20px; margin: 20px 0; font-size: 15px; line-height: 1.6; color: #22261E; border-top: 1px solid #E2DCC9; border-right: 1px solid #E2DCC9; border-bottom: 1px solid #E2DCC9; }
    .btn-container { text-align: center; margin-top: 28px; margin-bottom: 12px; }
    .btn { display: inline-block; background-color: #2B62C6; color: #FFFFFF !important; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 700; font-size: 14px; box-shadow: 0 2px 6px rgba(43,98,198,0.3); }
    .footer { text-align: center; padding: 20px; font-size: 12px; color: #6B6A5E; border-top: 1px solid #E2DCC9; background-color: #F4F0E5; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Ficcado — Team Note Alert</h1>
    </div>
    <div class="content">
      <div class="sender-badge">Keep Notes Shared Memo</div>
      <p style="font-size: 15px; margin-top: 0; margin-bottom: 8px; color: #22261E;">Hello Team,</p>
      <p style="font-size: 15px; margin-top: 0; line-height: 1.5; color: #22261E;">
        Admin <strong>${creatorName}</strong> has shared a new note with the team on Ficcado Keep Notes:
      </p>

      <div class="note-box">
        ${formattedNoteContent}
      </div>

      <p style="font-size: 13.5px; color: #6B6A5E; margin-top: 20px;">
        Please log into your admin dashboard to view full details and collaborate with team members.
      </p>

      <div class="btn-container">
        <a href="${appUrl}/dashboard/notes" class="btn" target="_blank">Login & View Keep Notes</a>
      </div>
    </div>
    <div class="footer">
      Sent automatically via Ficcado Management Application<br>
      © ${currentYear} Ficcado. All rights reserved.
    </div>
  </div>
</body>
</html>
    `;

    // 5. Send via Nodemailer
    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      auth: { user: sender, pass },
    });

    await transporter.sendMail({
      from: `"Ficcado App" <${sender}>`,
      to: recipients.join(', '),
      subject: `Ficcado Note Alert: New note from ${creatorName}`,
      html: htmlBody,
    });

    return Response.json({
      success: true,
      message: `Notification email sent to ${recipients.length} admin(s).`,
      recipients,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return Response.json({ error: 'Failed to send note notification email.', detail: message }, { status: 500 });
  }
}
