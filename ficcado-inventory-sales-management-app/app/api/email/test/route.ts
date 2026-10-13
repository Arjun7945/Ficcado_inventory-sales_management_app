/**
 * app/api/email/test/route.ts
 * POST — send a test email to verify Gmail configuration
 * Body: { sender?: string } — if omitted uses stored sender
 */
import { requireAuth } from '@/lib/auth';
import { getAppMeta, decryptValue } from '@/lib/google/appMeta';
import nodemailer from 'nodemailer';

export const dynamic = 'force-dynamic';

export async function POST(_request: Request) {
  let admin;
  try { admin = await requireAuth(); } catch (e) { if (e instanceof Response) return e; return Response.json({ error: 'Auth required.' }, { status: 401 }); }

  try {
    const [sender, encryptedPass] = await Promise.all([
      getAppMeta('gmail_sender'),
      getAppMeta('gmail_password_enc'),
    ]);

    if (!encryptedPass) {
      return Response.json({ error: 'Gmail app password is not configured. Complete the Setup Wizard Step 3 first.' }, { status: 400 });
    }

    const pass = decryptValue(encryptedPass);
    const from = sender || 'ficcado@gmail.com';

    const transporter = nodemailer.createTransport({
      host:   'smtp.gmail.com',
      port:   587,
      secure: false,
      auth:   { user: from, pass },
    });

    await transporter.sendMail({
      from: `"Ficcado App" <${from}>`,
      to:   admin.email || from,
      subject: 'Ficcado — Test Email Confirmation',
      text: `Hello ${admin.name},\n\nThis is a test email from the Ficcado Inventory & Sales Management App.\n\nIf you received this, your email configuration is working correctly.\n\n— Ficcado System`,
    });

    return Response.json({ success: true, message: `Test email sent to ${admin.email || from}` });
  } catch (err) {
    return Response.json({ error: 'Failed to send test email.', detail: (err as Error).message }, { status: 500 });
  }
}
