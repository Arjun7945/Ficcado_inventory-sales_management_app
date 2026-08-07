/**
 * lib/auth.ts
 *
 * JWT-based session management for admin authentication.
 *
 * The JWT secret is derived from GOOGLE_SERVICE_ACCOUNT_KEY so no separate
 * JWT_SECRET env var is strictly required (though one is provided in .env.local
 * for clarity). Falls back gracefully to the env var if set.
 */

import jwt from 'jsonwebtoken';
import { cookies } from 'next/headers';
import { readAllRows } from './google/moduleSheet';

export const SESSION_COOKIE = 'ficcado_session';
export const SESSION_DURATION = '12h';

export type AdminRole = 'superadmin' | 'admin';

export interface SessionAdmin {
  id:          string; // row index in Admin Info sheet (or 'superadmin')
  username:    string;
  name:        string;
  email:       string;
  role:        AdminRole;
}

/** Get the JWT signing secret. */
function getJwtSecret(): string {
  // Prefer an explicit JWT_SECRET if set
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;

  // Derive from the service account private_key_id as a fallback
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY ?? '';
  const match = raw.match(/"private_key_id"\s*:\s*"([a-f0-9]+)"/);
  if (match) return `ficcado-jwt-${match[1]}`;

  throw new Error('Cannot derive JWT secret — GOOGLE_SERVICE_ACCOUNT_KEY not set.');
}

/** Sign a JWT for an admin session. */
export function signJwt(payload: SessionAdmin): string {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: SESSION_DURATION });
}

/** Verify and decode a JWT. Returns null if invalid or expired. */
export function verifyJwt(token: string): SessionAdmin | null {
  try {
    const decoded = jwt.verify(token, getJwtSecret());
    return decoded as SessionAdmin;
  } catch {
    return null;
  }
}

export async function resolveAdminName(sessionAdmin: SessionAdmin): Promise<SessionAdmin> {
  if (!sessionAdmin) return sessionAdmin;

  // Regular admins logged in with their own account always use their own name directly
  if (sessionAdmin.role === 'admin' || (sessionAdmin.name && sessionAdmin.name.toLowerCase() !== 'superadmin')) {
    return sessionAdmin;
  }

  // If superadmin is logged in, try to match by email in admin_info if an email exists
  if (sessionAdmin.email) {
    try {
      const adminRows = await readAllRows('admin_info');
      if (adminRows.length > 1) {
        const match = adminRows.slice(1).find(
          (r) => (r[3] ?? '').trim().toLowerCase() === sessionAdmin.email.trim().toLowerCase()
        );
        if (match && match[1] && match[1].trim()) {
          return {
            ...sessionAdmin,
            name: match[1].trim(),
          };
        }
      }
    } catch {
      // Fallback to original sessionAdmin
    }
  }

  return sessionAdmin;
}

/**
 * Read the session cookie and return the authenticated admin.
 * Returns null if not authenticated or session is expired/invalid.
 * Must be called from a server component or route handler.
 */
export async function getSessionAdmin(): Promise<SessionAdmin | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifyJwt(token);
}

/**
 * Throws a 401 Response if not authenticated.
 * Use at the top of API route handlers.
 */
export async function requireAuth(): Promise<SessionAdmin> {
  const admin = await getSessionAdmin();
  if (!admin) {
    throw new Response(
      JSON.stringify({ error: 'Not authenticated. Please log in.' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }
  return await resolveAdminName(admin);
}

/**
 * Throws a 403 Response if not a Superadmin.
 */
export async function requireSuperadmin(): Promise<SessionAdmin> {
  const admin = await requireAuth();
  if (admin.role !== 'superadmin') {
    throw new Response(
      JSON.stringify({ error: 'This action requires Superadmin privileges.' }),
      { status: 403, headers: { 'Content-Type': 'application/json' } }
    );
  }
  return admin;
}

/** Build a Set-Cookie header value for the session token. */
export function buildSessionCookie(token: string): string {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${SESSION_COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/${secure}; Max-Age=43200`;
}

/** Build a cookie that clears the session. */
export function buildClearCookie(): string {
  return `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`;
}
