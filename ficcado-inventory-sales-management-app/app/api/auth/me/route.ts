/**
 * app/api/auth/me/route.ts
 * GET /api/auth/me — returns the current session admin (without password hash).
 */

import { getSessionAdmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  const admin = await getSessionAdmin();
  if (!admin) {
    return Response.json({ admin: null }, { status: 401 });
  }
  return Response.json({ admin });
}
