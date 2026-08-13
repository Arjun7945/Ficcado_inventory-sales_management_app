/**
 * app/api/setup/run-archival/route.ts
 *
 * POST /api/setup/run-archival
 *
 * Admin-triggered or end-of-month rollover: moves all completed-month rows
 * from the live tabs into dedicated archive tabs for Sales Log, Activity Log,
 * and Inventory History Tracker.
 *
 * Body: { moduleKey?: string } — if provided, archives only that module;
 *                                if omitted, archives all ARCHIVABLE_MODULES.
 */

import { requireAuth } from '@/lib/auth';
import { archiveAllCompletedMonths, ARCHIVABLE_MODULES } from '@/lib/google/archival';

export const dynamic = 'force-dynamic';

/** Known "Created At" column indices per archivable module (0-based) */
const CREATED_AT_COL: Record<string, number> = {
  sales:             14, // 'Created At' is column O (index 14) in sales schema
  sales_log:         5,  // 'Created At' is column F (index 5) in sales_log schema
  activity:          4,  // 'Timestamp' is column E (index 4) in activity schema
  inventory_history: 9,  // 'Created At' is column J (index 9) in inventory_history schema
};

export async function POST(request: Request) {
  try { await requireAuth(); }
  catch (e) { if (e instanceof Response) return e; return Response.json({ error: 'Authentication required.' }, { status: 401 }); }

  try {
    const body = await request.json().catch(() => ({}));
    const targetModule: string | undefined = body.moduleKey;

    const modulesToProcess = targetModule
      ? (ARCHIVABLE_MODULES.includes(targetModule as typeof ARCHIVABLE_MODULES[number])
          ? [targetModule]
          : [])
      : [...ARCHIVABLE_MODULES];

    if (modulesToProcess.length === 0) {
      return Response.json({ error: `Unknown or non-archivable module: ${targetModule}` }, { status: 400 });
    }

    const results: Record<string, Array<{ year: number; month: number; archivedCount: number }>> = {};

    for (const mod of modulesToProcess) {
      const colIndex = CREATED_AT_COL[mod] ?? 0;
      results[mod] = await archiveAllCompletedMonths(mod, colIndex);
    }

    const totalArchived = Object.values(results).flat().reduce((sum, r) => sum + r.archivedCount, 0);

    return Response.json({
      success: true,
      message: `Archival complete. ${totalArchived} rows moved to archive tabs.`,
      results,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return Response.json({ error: "Archival failed.", detail: message }, { status: 500 });
  }
}
