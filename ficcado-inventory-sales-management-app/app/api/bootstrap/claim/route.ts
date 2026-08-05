/**
 * app/api/bootstrap/claim/route.ts
 *
 * POST /api/bootstrap/claim
 * One-time Superadmin claim.
 *
 * Body: { username, password, claimCode? }
 *
 * - Verifies INSTALL_CLAIM_CODE if that env var is set (optional extra security).
 * - Bcrypt-hashes the password before writing.
 * - Writes superadmin_claimed=true and credentials to AppMeta.
 * - Returns a session JWT cookie for the Superadmin.
 */

import bcrypt from 'bcryptjs';
import { setAppMeta, getAppMeta } from '@/lib/google/appMeta';
import { validate, ClaimSchema } from '@/lib/validation';
import { signJwt, buildSessionCookie, SESSION_COOKIE } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { valid, data, errors } = validate(ClaimSchema, body);

    if (!valid) {
      return Response.json({ error: 'Validation failed', errors }, { status: 400 });
    }

    const { username, password, claimCode } = data!;

    // Check if already claimed
    const claimed = await getAppMeta('superadmin_claimed');
    if (claimed === 'true') {
      return Response.json(
        { error: 'This installation has already been claimed. Log in with your Superadmin credentials.' },
        { status: 409 }
      );
    }

    // Verify optional claim code if env var is set
    const requiredCode = process.env.INSTALL_CLAIM_CODE;
    if (requiredCode && claimCode !== requiredCode) {
      return Response.json(
        { error: 'Incorrect installation claim code.' },
        { status: 403 }
      );
    }

    // Hash the password with bcrypt (12 rounds — secure but not prohibitively slow)
    const passwordHash = await bcrypt.hash(password, 12);

    // Write to AppMeta
    await setAppMeta('superadmin_username', username);
    await setAppMeta('superadmin_password_hash', passwordHash);
    await setAppMeta('superadmin_claimed', 'true');

    // Issue session JWT
    const sessionPayload = {
      id:       'superadmin',
      username,
      name:     username,
      email:    '',
      role:     'superadmin' as const,
    };

    const token = signJwt(sessionPayload);
    const cookie = buildSessionCookie(token);

    return new Response(
      JSON.stringify({ success: true, message: 'Superadmin account created. Proceed to setup.' }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Set-Cookie': cookie,
        },
      }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[bootstrap/claim]', message);
    return Response.json(
      { error: "Couldn't complete the claim. Check your connection and try again.", detail: message },
      { status: 500 }
    );
  }
}
