/**
 * app/api/inventory/[id]/route.ts
 * PUT, DELETE for inventory records (by S.No)
 */
import { requireAuth } from '@/lib/auth';
import { readAllRows, updateRow, deleteRow } from '@/lib/google/moduleSheet';
import { validate, InventorySchema } from '@/lib/validation';
import { logActivity } from '@/lib/activityLogger';
import { recordInventoryHistory } from '@/lib/inventoryHistory';

export const dynamic = 'force-dynamic';
const COL = { sno: 0, itemName: 1, size: 2, totalQty: 3, addedBy: 4, updatedAt: 5, updatedBy: 6, createdAt: 7 };

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let admin;
  try { admin = await requireAuth(); } catch (e) { if (e instanceof Response) return e; return Response.json({ error: 'Auth required.' }, { status: 401 }); }
  try {
    const body = await request.json();
    const { valid, data, errors } = validate(InventorySchema, body);
    if (!valid) return Response.json({ error: 'Validation failed', errors }, { status: 400 });

    const rows = await readAllRows('inventory');
    const idx = rows.slice(1).findIndex((r) => r[COL.sno] === id);
    if (idx === -1) return Response.json({ error: 'Inventory record not found.' }, { status: 404 });

    const row = rows[idx + 1];
    const oldQty = parseInt(row[COL.totalQty] ?? '0', 10) || 0;
    const newQty = data!.totalQuantityAvailable;
    const diff = newQty - oldQty;

    const now = new Date().toISOString();
    await updateRow('inventory', idx + 2, [
      row[COL.sno], data!.itemName, data!.size, String(newQty),
      row[COL.addedBy], now, admin.name, row[COL.createdAt],
    ]);

    if (diff !== 0 || data!.itemName !== row[COL.itemName] || data!.size !== row[COL.size]) {
      await recordInventoryHistory({
        itemName: data!.itemName,
        size: data!.size,
        quantityChange: diff,
        affectedSheet: 'Inventory',
        transactionType: 'Manual Adjustment',
        resultingBalance: newQty,
        createdBy: admin.name,
        notes: `Edited inventory row S.No ${id}`,
      });
    }

    await logActivity({ adminName: admin.name, action: 'updated', module: 'Inventory Management', moduleKey: 'inventory', recordId: `${data!.itemName} (${data!.size})` });
    return Response.json({ success: true });
  } catch (err) { return Response.json({ error: 'Failed to update inventory.', detail: (err as Error).message }, { status: 500 }); }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let admin;
  try { admin = await requireAuth(); } catch (e) { if (e instanceof Response) return e; return Response.json({ error: 'Auth required.' }, { status: 401 }); }
  try {
    const rows = await readAllRows('inventory');
    const idx = rows.slice(1).findIndex((r) => r[COL.sno] === id);
    if (idx === -1) return Response.json({ error: 'Inventory record not found.' }, { status: 404 });

    const row = rows[idx + 1];
    const itemName = row[COL.itemName] ?? '';
    const size = row[COL.size] ?? '';
    const qty = parseInt(row[COL.totalQty] ?? '0', 10) || 0;
    const label = `${itemName} (${size})`;

    await deleteRow('inventory', idx + 2);

    if (itemName && size && qty > 0) {
      await recordInventoryHistory({
        itemName,
        size,
        quantityChange: -qty,
        affectedSheet: 'Inventory',
        transactionType: 'Manual Adjustment',
        resultingBalance: 0,
        createdBy: admin.name,
        notes: `Deleted inventory row S.No ${id}`,
      });
    }

    await logActivity({ adminName: admin.name, action: 'deleted', module: 'Inventory Management', moduleKey: 'inventory', recordId: label });
    return Response.json({ success: true });
  } catch (err) { return Response.json({ error: 'Failed to delete inventory record.', detail: (err as Error).message }, { status: 500 }); }
}
