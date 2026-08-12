/**
 * app/api/setup/email-config/route.ts
 *
 * GET  /api/setup/email-config
 * Returns current Gmail sender address and whether a password is on file.
 * Does NOT return the password itself.
 *
 * POST /api/setup/email-config
 * Store (or update) Gmail sender + encrypted app password.
 * Body: { senderAddress, appPassword, testSend?: boolean }
 *
 * The app password is encrypted with AES-256-CBC before storage.
 * See lib/google/appMeta.ts for the encryption approach and its documented tradeoff.
 *
 * Part 6 B1: GET added for Admin Control Centre "Update Email Configuration" display.
 *            POST now logs the config change to sales_log.
 */

import nodemailer from 'nodemailer';
import { requireAuth, requireSuperadmin } from '@/lib/auth';
import { getAppMeta, setAppMeta, encryptValue } from '@/lib/google/appMeta';
import { recordSalesLog } from '@/lib/salesLogger';

export const dynamic = 'force-dynamic';

/** GET /api/setup/email-config — return current sender address + presence flag */
export async function GET(_request: Request) {
  try {
    await requireAuth();
  } catch (authErr) {
    if (authErr instanceof Response) return authErr;
    return Response.json({ error: 'Authentication required.' }, { status: 401 });
  }

  try {
    const senderAddress = await getAppMeta('gmail_sender');
    const passwordEnc   = await getAppMeta('gmail_password_enc');

    return Response.json({
      senderAddress: senderAddress || null,
      hasPassword:   Boolean(passwordEnc && passwordEnc.length > 0),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[setup/email-config GET]', message);
    return Response.json({ error: 'Could not read email configuration.' }, { status: 500 });
  }
}

/** POST /api/setup/email-config — save / overwrite Gmail credentials */
export async function POST(request: Request) {
  let admin: Awaited<ReturnType<typeof requireSuperadmin>>;
  try {
    admin = await requireSuperadmin();
  } catch (authErr) {
    if (authErr instanceof Response) return authErr;
    return Response.json({ error: 'Authentication required.' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { senderAddress, appPassword, testSend } = body;

    if (!senderAddress || !appPassword) {
      return Response.json(
        { error: 'Sender email address and app password are required.' },
        { status: 400 }
      );
    }

    // Email format check
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(senderAddress)) {
      return Response.json(
        { error: 'Enter a valid sender email address.' },
        { status: 400 }
      );
    }

    // If testSend is requested, verify SMTP credentials first before committing
    if (testSend) {
      const transporter = nodemailer.createTransport({
        host:   'smtp.gmail.com',
        port:   587,
        secure: false,
        auth: {
          user: senderAddress,
          pass: appPassword,
        },
      });

      try {
        await transporter.verify();
      } catch {
        return Response.json(
          {
            error:
              "Couldn't connect with these credentials — double check the app password was copied correctly. " +
              'Make sure 2-Step Verification is enabled on the Gmail account and a fresh App Password was generated.',
          },
          { status: 422 }
        );
      }
    }

    // Encrypt the app password before storing
    const encryptedPassword = encryptValue(appPassword);

    await setAppMeta('gmail_sender', senderAddress);
    await setAppMeta('gmail_password_enc', encryptedPassword);

    // Part 6 B1: Log the config change — never log the password itself
    await recordSalesLog({
      module:    'Sales',
      operation: 'Update',
      message:   `Admin ${admin.name} updated the email sending configuration. Sender address set to: ${senderAddress}.`,
      adminName: admin.name,
    });

    return Response.json({
      success: true,
      message: testSend
        ? `Email configuration saved. Test connection to ${senderAddress} succeeded.`
        : `Email configuration saved for ${senderAddress}.`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[setup/email-config]', message);
    return Response.json(
      {
        error:
          "Couldn't save email configuration. Check your connection and try again.",
        detail: message,
      },
      { status: 500 }
    );
  }
}
