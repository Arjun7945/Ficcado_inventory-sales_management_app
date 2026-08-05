/**
 * app/api/activity/route.ts
 * GET /api/activity — list recent activity log entries
 */

import { requireAuth } from '@/lib/auth';
import { readAllRows } from '@/lib/google/moduleSheet';

export const dynamic = 'force-dynamic';

const COL = { sno: 0, adminName: 1, action: 2, module: 3, moduleKey: 4, recordId: 5, timestamp: 6, message: 7 };

export async function GET() {
  try { await requireAuth(); }
  catch (e) { if (e instanceof Response) return e; return Response.json({ error: 'Authentication required.' }, { status: 401 }); }

  try {
    const rows = await readAllRows('activity_log');
    const logs = rows.slice(1).map((row, i) => ({
      rowIndex:  i + 2,
      adminName: row[COL.adminName] ?? '',
      action:    row[COL.action]    ?? '',
      module:    row[COL.module]    ?? '',
      recordId:  row[COL.recordId]  ?? '',
      timestamp: row[COL.timestamp] ?? '',
      message:   row[COL.message]   ?? '',
    })).filter((l) => l.message).reverse(); // Most recent first
    return Response.json({ logs });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return Response.json({ error: "Couldn't load activity logs.", detail: message }, { status: 500 });
  }
}
