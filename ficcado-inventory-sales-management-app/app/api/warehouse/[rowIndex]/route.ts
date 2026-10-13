/**
 * app/api/warehouse/[rowIndex]/route.ts
 * DELETE /api/warehouse/[rowIndex] — delete a warehouse row by its 1-based sheet row index
 */
import { requireAuth } from '@/lib/auth';
import { readAllRows, deleteRow } from '@/lib/google/moduleSheet';
import { logActivity } from '@/lib/activityLogger';
import { recordInventoryHistory } from '@/lib/inventoryHistory';

export const dynamic = 'force-dynamic';

const COL_W = { sno: 0, location: 1, handler: 2, itemName: 3, size: 4, qty: 5 };

export async function DELETE(_: Request, { params }: { params: Promise<{ rowIndex: string }> }) {
  const { rowIndex: rowIndexStr } = await params;
  let admin;
  try { admin = await requireAuth(); } catch (e) { if (e instanceof Response) return e; return Response.json({ error: 'Auth required.' }, { status: 401 }); }

  try {
    const rowIndex = parseInt(rowIndexStr, 10);
    if (isNaN(rowIndex) || rowIndex < 2) {
      return Response.json({ error: 'Invalid row index.' }, { status: 400 });
    }

    const rows = await readAllRows('warehouse');
    const targetRow = rows[rowIndex - 1];

    let itemName = '';
    let size = '';
    let handler = '';
    let qty = 0;
    let location = '';

    if (targetRow) {
      location = targetRow[COL_W.location] ?? '';
      handler = targetRow[COL_W.handler] ?? '';
      itemName = targetRow[COL_W.itemName] ?? '';
      size = targetRow[COL_W.size] ?? '';
      qty = parseInt(targetRow[COL_W.qty] ?? '0', 10) || 0;
    }

    await deleteRow('warehouse', rowIndex);

    if (itemName && size && qty > 0) {
      // Calculate remaining handler balance for this item+size
      let remainingHandlerQty = 0;
      for (let i = 1; i < rows.length; i++) {
        if (i === rowIndex - 1) continue; // skip deleted row
        const r = rows[i];
        if (r[COL_W.handler] === handler && r[COL_W.itemName] === itemName && r[COL_W.size] === size) {
          remainingHandlerQty += parseInt(r[COL_W.qty] ?? '0', 10) || 0;
        }
      }

      await recordInventoryHistory({
        itemName,
        size,
        quantityChange: -qty,
        affectedSheet: 'Warehouse',
        handler,
        transactionType: 'Warehouse Deallocation',
        resultingBalance: remainingHandlerQty,
        createdBy: admin.name,
        notes: `Deallocated from ${location}`,
      });
    }

    await logActivity({ adminName: admin.name, action: 'deleted', module: 'Warehouse Management', moduleKey: 'warehouse', recordId: location ? `${location} (${itemName} ${size})` : `row ${rowIndex}` });
    return Response.json({ success: true });
  } catch (err) {
    return Response.json({ error: 'Failed to delete warehouse record.', detail: (err as Error).message }, { status: 500 });
  }
}
