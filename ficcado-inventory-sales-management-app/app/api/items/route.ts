/**
 * app/api/items/route.ts
 * GET  /api/items — list all items
 * POST /api/items — create a new item
 */

import { getAuthSession } from '@/lib/auth';
import { readAllRows, appendRows } from '@/lib/google/moduleSheet';
import { buildHeaderMap, getCellByHeader, formatRowFromHeaderMap } from '@/lib/google/headerUtils';
import { validate, ItemSchema } from '@/lib/validation';
import { logActivity } from '@/lib/activityLogger';

export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await getAuthSession();
  if ('errorResponse' in auth) return auth.errorResponse;

  try {
    const rows = await readAllRows('items');
    if (rows.length === 0) return Response.json({ items: [] });

    const headerMap = buildHeaderMap(rows[0]);
    const items = rows.slice(1).map((row, i) => ({
      rowIndex:  i + 2,
      sno:       getCellByHeader(row, headerMap, 'S.No'),
      itemName:  getCellByHeader(row, headerMap, 'Item Name'),
      itemType:  getCellByHeader(row, headerMap, 'Item Type'),
      price:     getCellByHeader(row, headerMap, 'Price of Item'),
      sizes:     getCellByHeader(row, headerMap, 'Available Sizes'),
      status:    getCellByHeader(row, headerMap, 'Current Status', 'In Stock'),
      createdAt: getCellByHeader(row, headerMap, 'Created At'),
      createdBy: getCellByHeader(row, headerMap, 'Created By'),
      updatedAt: getCellByHeader(row, headerMap, 'Updated At'),
      updatedBy: getCellByHeader(row, headerMap, 'Updated By'),
    })).filter((it) => it.itemName);

    return Response.json({ items });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return Response.json({ error: "Couldn't load items.", detail: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await getAuthSession();
  if ('errorResponse' in auth) return auth.errorResponse;
  const admin = auth.admin;

  try {
    const body = await request.json();
    const validation = validate(ItemSchema, body);
    if (!validation.valid) return Response.json({ error: validation.errorMessage, errors: validation.errors }, { status: 400 });

    const { itemName, itemType, priceOfItem, availableSizes, currentStatus } = validation.data!;
    const rows = await readAllRows('items');

    if (rows.length > 0) {
      const headerMap = buildHeaderMap(rows[0]);
      const dup = rows.slice(1).find((r) => getCellByHeader(r, headerMap, 'Item Name').toLowerCase() === itemName.toLowerCase());
      if (dup) return Response.json({ error: `An item named '${itemName}' already exists.` }, { status: 409 });
    }

    const now = new Date().toISOString();
    const sno = String(rows.length);
    const sizesStr = Array.isArray(availableSizes) ? availableSizes.join(', ') : availableSizes;

    const itemObj = {
      'S.No':            sno,
      'Item Name':        itemName,
      'Item Type':        itemType,
      'Price of Item':    String(priceOfItem),
      'Available Sizes':  sizesStr,
      'Created By':       admin.name,
      'Created At':       now,
      'Updated By':       admin.name,
      'Updated At':       now,
      'Current Status':   currentStatus ?? 'In Stock',
    };

    const headerRow = rows[0] || ['S.No', 'Item Name', 'Item Type', 'Price of Item', 'Available Sizes', 'Created By', 'Created At', 'Updated By', 'Updated At', 'Current Status'];
    await appendRows('items', [formatRowFromHeaderMap(itemObj, headerRow)]);

    await logActivity({ adminName: admin.name, action: 'created', module: 'Items Management', moduleKey: 'items', recordId: itemName });
    return Response.json({ success: true, message: `Item '${itemName}' created.` }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return Response.json({ error: "Couldn't create item.", detail: message }, { status: 500 });
  }
}
