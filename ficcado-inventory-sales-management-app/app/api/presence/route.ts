/**
 * app/api/presence/route.ts
 *
 * POST /api/presence — record active timestamp for logged-in admin.
 * GET  /api/presence — return list of admins online within the freshness window (3 min).
 *
 * Employs a high-speed in-memory store to prevent continuous background presence
 * heartbeats from locking Google Sheets API network queues.
 */

import { requireAuth } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const FRESHNESS_MS = 3 * 60 * 1000; // 3 minutes

/** In-memory store for admin presence: adminName -> ISO timestamp string */
const _presenceStore = new Map<string, string>();

/** POST /api/presence — record heartbeat in memory instantly */
export async function POST(_request: Request) {
  let admin;
  try {
    admin = await requireAuth();
  } catch (e) {
    if (e instanceof Response) return e;
    return Response.json({ error: 'Auth required.' }, { status: 401 });
  }

  try {
    const isoString = new Date().toISOString();
    _presenceStore.set(admin.name, isoString);
    return Response.json({ success: true, updatedAt: isoString });
  } catch (err) {
    return Response.json({ error: 'Failed to update presence.', detail: (err as Error).message }, { status: 500 });
  }
}

/** GET /api/presence — fetch active admins from in-memory presence store */
export async function GET(_request: Request) {
  try {
    await requireAuth();
  } catch (e) {
    if (e instanceof Response) return e;
    return Response.json({ error: 'Auth required.' }, { status: 401 });
  }

  try {
    const now = Date.now();
    const onlineAdmins: Array<{ name: string; lastActiveAt: string; initial: string }> = [];

    for (const [adminName, isoValue] of _presenceStore.entries()) {
      const lastActive = new Date(isoValue).getTime();
      if (!isNaN(lastActive) && now - lastActive <= FRESHNESS_MS) {
        onlineAdmins.push({
          name:         adminName,
          lastActiveAt: isoValue,
          initial:      adminName.charAt(0).toUpperCase(),
        });
      } else if (now - lastActive > FRESHNESS_MS * 5) {
        // Garbage collect very old presence entries
        _presenceStore.delete(adminName);
      }
    }

    return Response.json({ onlineAdmins, count: onlineAdmins.length });
  } catch (err) {
    return Response.json({ error: 'Failed to fetch presence.', detail: (err as Error).message }, { status: 500 });
  }
}

