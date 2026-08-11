/**
 * app/api/items/[id]/route.ts
 * GET    — get single item
 * PUT    — update item
 * DELETE — delete item
 */
import { requireAuth } from '@/lib/auth';
import { readAllRows, updateRow, deleteRow } from '@/lib/google/moduleSheet';
import { validate, ItemSchema } from '@/lib/validation';
import { logActivity } from '@/lib/activityLogger';
import { recordSalesLog, formatPrice } from '@/lib/salesLogger';

export const dynamic = 'force-dynamic';
const COL = { sno: 0, itemName: 1, itemType: 2, price: 3, sizes: 4, createdBy: 5, createdAt: 6, updatedBy: 7, updatedAt: 8, status: 9 };

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try { await requireAuth(); } catch (e) { if (e instanceof Response) return e; return Response.json({ error: 'Auth required.' }, { status: 401 }); }
  try {
    const rows = await readAllRows('items');
    const idx = rows.slice(1).findIndex((r) => r[COL.sno] === id || r[COL.itemName]?.toLowerCase() === id.toLowerCase());
    if (idx === -1) return Response.json({ error: 'Item not found.' }, { status: 404 });
    const r = rows[idx + 1];
    return Response.json({ item: { rowIndex: idx + 2, sno: r[COL.sno], itemName: r[COL.itemName], itemType: r[COL.itemType], price: r[COL.price], sizes: r[COL.sizes], status: r[COL.status], updatedAt: r[COL.updatedAt] } });
  } catch (err) { return Response.json({ error: 'Failed.', detail: (err as Error).message }, { status: 500 }); }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let admin;
  try { admin = await requireAuth(); } catch (e) { if (e instanceof Response) return e; return Response.json({ error: 'Auth required.' }, { status: 401 }); }
  try {
    const body = await request.json();
    const { valid, data, errors } = validate(ItemSchema, body);
    if (!valid) return Response.json({ error: 'Validation failed', errors }, { status: 400 });

    const rows = await readAllRows('items');
    const idx = rows.slice(1).findIndex((r) => r[COL.sno] === id || r[COL.itemName]?.toLowerCase() === id.toLowerCase());
    if (idx === -1) return Response.json({ error: 'Item not found.' }, { status: 404 });

    const row = rows[idx + 1];
    const now = new Date().toISOString();

    const oldPrice = row[COL.price] ?? '0';
    const oldSizes = row[COL.sizes] ?? '';
    const oldStatus = row[COL.status] ?? 'In Stock';
    const newSizesStr = data!.availableSizes.join(', ');

    const changes: string[] = [];
    if (String(data!.priceOfItem) !== String(oldPrice)) changes.push(`price changed from ${formatPrice(oldPrice)} to ${formatPrice(data!.priceOfItem)}`);
    if (newSizesStr !== oldSizes) changes.push(`available sizes changed from ${oldSizes} to ${newSizesStr}`);
    if ((data!.currentStatus ?? 'In Stock') !== oldStatus) changes.push(`status changed from ${oldStatus} to ${data!.currentStatus ?? 'In Stock'}`);

    await updateRow('items', idx + 2, [
      row[COL.sno], data!.itemName, data!.itemType, String(data!.priceOfItem),
      newSizesStr, row[COL.createdBy], row[COL.createdAt],
      admin.name, now, data!.currentStatus,
    ]);

    await logActivity({ adminName: admin.name, action: 'updated', module: 'Items Management', moduleKey: 'items', recordId: data!.itemName });

    const changesText = changes.length > 0 ? changes.join('; ') : 'item details updated';
    const updateLogMsg = `Admin ${admin.name} updated item ${data!.itemName}: ${changesText}. Updated at ${now}.`;

    await recordSalesLog({
      module: 'Items',
      operation: 'Update',
      message: updateLogMsg,
      adminName: admin.name,
    });

    return Response.json({ success: true });
  } catch (err) { return Response.json({ error: 'Failed to update item.', detail: (err as Error).message }, { status: 500 }); }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let admin;
  try { admin = await requireAuth(); } catch (e) { if (e instanceof Response) return e; return Response.json({ error: 'Auth required.' }, { status: 401 }); }
  try {
    const rows = await readAllRows('items');
    const idx = rows.slice(1).findIndex((r) => r[COL.sno] === id || r[COL.itemName]?.toLowerCase() === id.toLowerCase());
    if (idx === -1) return Response.json({ error: 'Item not found.' }, { status: 404 });

    const row = rows[idx + 1];
    const name = row[COL.itemName];
    const itemType = row[COL.itemType];
    const price = row[COL.price];
    const createdAt = row[COL.createdAt];
    const now = new Date().toISOString();

    await deleteRow('items', idx + 2);
    await logActivity({ adminName: admin.name, action: 'deleted', module: 'Items Management', moduleKey: 'items', recordId: name });

    const deleteLogMsg = `Admin ${admin.name} deleted item ${name} (type ${itemType}, price ${formatPrice(price)}), originally created at ${createdAt}. Deleted at ${now}.`;

    await recordSalesLog({
      module: 'Items',
      operation: 'Delete',
      message: deleteLogMsg,
      adminName: admin.name,
    });

    return Response.json({ success: true });
  } catch (err) { return Response.json({ error: 'Failed to delete item.', detail: (err as Error).message }, { status: 500 }); }
}
