/**
 * app/api/warehouse/[rowIndex]/route.ts
 * DELETE /api/warehouse/[rowIndex] — delete a warehouse row by its 1-based sheet row index
 */
import { requireAuth } from '@/lib/auth';
import { deleteRow } from '@/lib/google/moduleSheet';
import { logActivity } from '@/lib/activityLogger';

export const dynamic = 'force-dynamic';

export async function DELETE(_: Request, { params }: { params: Promise<{ rowIndex: string }> }) {
  const { rowIndex: rowIndexStr } = await params;
  let admin;
  try { admin = await requireAuth(); } catch (e) { if (e instanceof Response) return e; return Response.json({ error: 'Auth required.' }, { status: 401 }); }

  try {
    const rowIndex = parseInt(rowIndexStr, 10);
    if (isNaN(rowIndex) || rowIndex < 2) {
      return Response.json({ error: 'Invalid row index.' }, { status: 400 });
    }
    await deleteRow('warehouse', rowIndex);
    await logActivity({ adminName: admin.name, action: 'deleted', module: 'Warehouse Management', moduleKey: 'warehouse', recordId: `row ${rowIndex}` });
    return Response.json({ success: true });
  } catch (err) {
    return Response.json({ error: 'Failed to delete warehouse record.', detail: (err as Error).message }, { status: 500 });
  }
}
