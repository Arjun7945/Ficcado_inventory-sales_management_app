/**
 * app/api/auth/login/route.ts
 *
 * POST /api/auth/login
 * Body: { username, password }
 *
 * Handles both Superadmin login (credentials in AppMeta) and
 * regular admin login (credentials in Admin Information Sheet).
 *
 * Returns an httpOnly session cookie on success.
 */

import bcrypt from 'bcryptjs';
import { getAppMetaMulti } from '@/lib/google/appMeta';
import { readAllRows } from '@/lib/google/moduleSheet';
import { validate, LoginSchema } from '@/lib/validation';
import { signJwt, buildSessionCookie } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// Admin Info Sheet column indices (0-based, matching spec Section 3.7)
// S.No | Admin Name | Phone | Email | Notifications | Password Hash | Created At | Created By | Updated At | Updated By
const COL = {
  sno:           0,
  adminName:     1,
  phone:         2,
  email:         3,
  notifications: 4,
  passwordHash:  5,
  createdAt:     6,
  createdBy:     7,
  updatedAt:     8,
  updatedBy:     9,
};

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { valid, data, errors } = validate(LoginSchema, body);

    if (!valid) {
      return Response.json({ error: 'Validation failed', errors }, { status: 400 });
    }

    const { username, password } = data!;

    // ── 1. Check Superadmin credentials ──────────────────────────────────────
    const meta = await getAppMetaMulti([
      'superadmin_claimed',
      'superadmin_username',
      'superadmin_password_hash',
    ]);

    if (
      meta.superadmin_claimed === 'true' &&
      meta.superadmin_username &&
      username === meta.superadmin_username
    ) {
      const hash = meta.superadmin_password_hash ?? '';
      const passwordMatch = await bcrypt.compare(password, hash);

      if (passwordMatch) {
        const token = signJwt({
          id:       'superadmin',
          username: meta.superadmin_username,
          name:     meta.superadmin_username,
          email:    '',
          role:     'superadmin',
        });

        return new Response(
          JSON.stringify({ success: true, role: 'superadmin' }),
          {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
              'Set-Cookie': buildSessionCookie(token),
            },
          }
        );
      }

      // Wrong password — fall through to return generic error
      return Response.json(
        { error: 'Incorrect username or password. Try again.' },
        { status: 401 }
      );
    }

    // ── 2. Check regular admin credentials in Admin Information Sheet ─────────
    let rows: string[][];
    try {
      rows = await readAllRows('admin_info');
    } catch {
      return Response.json(
        {
          error:
            "Couldn't reach the Admin Information Sheet. " +
            "Check Sheet Configuration for 'admin_info'.",
        },
        { status: 503 }
      );
    }

    // Skip header row
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const adminEmail = row[COL.email] ?? '';
      const adminName  = row[COL.adminName] ?? '';
      const hash       = row[COL.passwordHash] ?? '';

      // Match by email or name (admins can log in with either)
      const usernameMatch =
        username.toLowerCase() === adminEmail.toLowerCase() ||
        username.toLowerCase() === adminName.toLowerCase();

      if (usernameMatch && hash) {
        const passwordMatch = await bcrypt.compare(password, hash);
        if (passwordMatch) {
          const token = signJwt({
            id:       String(i + 1), // 1-based row index in the sheet
            username: adminEmail,
            name:     adminName,
            email:    adminEmail,
            role:     'admin',
          });

          return new Response(
            JSON.stringify({ success: true, role: 'admin', name: adminName }),
            {
              status: 200,
              headers: {
                'Content-Type': 'application/json',
                'Set-Cookie': buildSessionCookie(token),
              },
            }
          );
        }
      }
    }

    // No match found
    return Response.json(
      { error: 'Incorrect username or password. Try again.' },
      { status: 401 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[auth/login]', message);
    return Response.json(
      {
        error: "Couldn't complete login. Check your connection and try again.",
        detail: message,
      },
      { status: 500 }
    );
  }
}
