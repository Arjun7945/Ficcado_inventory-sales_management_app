/**
 * app/api/items/[id]/route.ts
 * GET    — get single item
 * PUT    — update item
 * DELETE — delete item
 *
 * Position-independent header mapping. Includes Cost Price (B7).
 */
import { requireAuth } from '@/lib/auth';
import { readAllRows, updateRow, deleteRow } from '@/lib/google/moduleSheet';
import { buildHeaderMap, getCellByHeader, formatRowFromHeaderMap } from '@/lib/google/headerUtils';
import { validate, ItemSchema } from '@/lib/validation';
import { logActivity } from '@/lib/activityLogger';
import { recordSalesLog, formatPrice } from '@/lib/salesLogger';

export const dynamic = 'force-dynamic';

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try { await requireAuth(); } catch (e) { if (e instanceof Response) return e; return Response.json({ error: 'Auth required.' }, { status: 401 }); }
  try {
    const rows = await readAllRows('items');
    if (rows.length === 0) return Response.json({ error: 'Item not found.' }, { status: 404 });
    const headerMap = buildHeaderMap(rows[0]);
    const idx = rows.slice(1).findIndex((r) => getCellByHeader(r, headerMap, 'S.No') === id || getCellByHeader(r, headerMap, 'Item Name').toLowerCase() === id.toLowerCase());
    if (idx === -1) return Response.json({ error: 'Item not found.' }, { status: 404 });
    const r = rows[idx + 1];
    return Response.json({
      item: {
        rowIndex:  idx + 2,
        sno:       getCellByHeader(r, headerMap, 'S.No'),
        itemName:  getCellByHeader(r, headerMap, 'Item Name'),
        itemType:  getCellByHeader(r, headerMap, 'Item Type'),
        price:     getCellByHeader(r, headerMap, 'Price of Item'),
        costPrice: getCellByHeader(r, headerMap, 'Cost Price', '0'),
        sizes:     getCellByHeader(r, headerMap, 'Available Sizes'),
        status:    getCellByHeader(r, headerMap, 'Current Status', 'In Stock'),
        updatedAt: getCellByHeader(r, headerMap, 'Updated At'),
      },
    });
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
    if (rows.length === 0) return Response.json({ error: 'Item not found.' }, { status: 404 });
    const headerMap = buildHeaderMap(rows[0]);
    const idx = rows.slice(1).findIndex((r) => getCellByHeader(r, headerMap, 'S.No') === id || getCellByHeader(r, headerMap, 'Item Name').toLowerCase() === id.toLowerCase());
    if (idx === -1) return Response.json({ error: 'Item not found.' }, { status: 404 });

    const row = rows[idx + 1];
    const now = new Date().toISOString();

    const oldPrice     = getCellByHeader(row, headerMap, 'Price of Item', '0');
    const oldCostPrice = getCellByHeader(row, headerMap, 'Cost Price', '0');
    const oldSizes     = getCellByHeader(row, headerMap, 'Available Sizes', '');
    const oldStatus    = getCellByHeader(row, headerMap, 'Current Status', 'In Stock');
    const newSizesStr  = data!.availableSizes.join(', ');

    const changes: string[] = [];
    if (String(data!.priceOfItem) !== String(oldPrice)) changes.push(`selling price changed from ${formatPrice(oldPrice)} to ${formatPrice(data!.priceOfItem)}`);
    if (String(data!.costPrice ?? 0) !== String(oldCostPrice)) changes.push(`cost price changed from ${formatPrice(oldCostPrice)} to ${formatPrice(data!.costPrice ?? 0)}`);
    if (newSizesStr !== oldSizes) changes.push(`available sizes changed from ${oldSizes} to ${newSizesStr}`);
    if ((data!.currentStatus ?? 'In Stock') !== oldStatus) changes.push(`status changed from ${oldStatus} to ${data!.currentStatus ?? 'In Stock'}`);

    const itemObj = {
      'S.No':            getCellByHeader(row, headerMap, 'S.No'),
      'Item Name':        data!.itemName,
      'Item Type':        data!.itemType,
      'Price of Item':    String(data!.priceOfItem),
      'Cost Price':       String(data!.costPrice ?? 0),
      'Available Sizes':  newSizesStr,
      'Created By':       getCellByHeader(row, headerMap, 'Created By'),
      'Created At':       getCellByHeader(row, headerMap, 'Created At'),
      'Updated By':       admin.name,
      'Updated At':       now,
      'Current Status':   data!.currentStatus ?? 'In Stock',
    };

    const updatedRow = formatRowFromHeaderMap(itemObj, rows[0]);
    await updateRow('items', idx + 2, updatedRow);

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
    if (rows.length === 0) return Response.json({ error: 'Item not found.' }, { status: 404 });
    const headerMap = buildHeaderMap(rows[0]);
    const idx = rows.slice(1).findIndex((r) => getCellByHeader(r, headerMap, 'S.No') === id || getCellByHeader(r, headerMap, 'Item Name').toLowerCase() === id.toLowerCase());
    if (idx === -1) return Response.json({ error: 'Item not found.' }, { status: 404 });

    const row       = rows[idx + 1];
    const name      = getCellByHeader(row, headerMap, 'Item Name');
    const itemType  = getCellByHeader(row, headerMap, 'Item Type');
    const price     = getCellByHeader(row, headerMap, 'Price of Item');
    const createdAt = getCellByHeader(row, headerMap, 'Created At');
    const now       = new Date().toISOString();

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
