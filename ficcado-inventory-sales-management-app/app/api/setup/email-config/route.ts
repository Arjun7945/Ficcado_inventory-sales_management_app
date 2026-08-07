/**
 * app/api/setup/email-config/route.ts
 *
 * POST /api/setup/email-config
 * Setup Wizard Step 3: store Gmail sender + encrypted app password.
 *
 * Body: { senderAddress, appPassword, testSend?: boolean }
 *
 * The app password is encrypted with AES-256-CBC before storage.
 * See lib/google/appMeta.ts for the encryption approach and its documented tradeoff.
 */

import nodemailer from 'nodemailer';
import { requireSuperadmin } from '@/lib/auth';
import { setAppMeta, encryptValue } from '@/lib/google/appMeta';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    await requireSuperadmin();
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

    // If testSend is requested, try sending a test email first
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
              "Couldn't connect to Gmail — the app password may be incorrect. " +
              'Double-check the app password and ensure "Less secure app access" or ' +
              'the correct Gmail App Password is being used.',
          },
          { status: 422 }
        );
      }
    }

    // Encrypt the app password before storing
    const encryptedPassword = encryptValue(appPassword);

    await setAppMeta('gmail_sender', senderAddress);
    await setAppMeta('gmail_password_enc', encryptedPassword);

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
