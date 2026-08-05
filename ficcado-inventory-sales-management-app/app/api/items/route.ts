/**
 * app/api/items/route.ts
 * GET  /api/items — list all items
 * POST /api/items — create a new item
 */

import { requireAuth } from '@/lib/auth';
import { readAllRows, appendRows } from '@/lib/google/moduleSheet';
import { validate, ItemSchema } from '@/lib/validation';
import { logActivity } from '@/lib/activityLogger';

export const dynamic = 'force-dynamic';

const COL = {
  sno: 0, itemName: 1, itemType: 2, price: 3, sizes: 4,
  createdBy: 5, createdAt: 6, updatedBy: 7, updatedAt: 8, status: 9,
};

export async function GET() {
  try { await requireAuth(); }
  catch (e) { if (e instanceof Response) return e; return Response.json({ error: 'Authentication required.' }, { status: 401 }); }

  try {
    const rows = await readAllRows('items');
    const items = rows.slice(1).map((row, i) => ({
      rowIndex: i + 2,
      sno:      row[COL.sno]       ?? '',
      itemName: row[COL.itemName]  ?? '',
      itemType: row[COL.itemType]  ?? '',
      price:    row[COL.price]     ?? '',
      sizes:    row[COL.sizes]     ?? '',
      status:   row[COL.status]    ?? 'In Stock',
      createdAt: row[COL.createdAt] ?? '',
      createdBy: row[COL.createdBy] ?? '',
      updatedAt: row[COL.updatedAt] ?? '',
      updatedBy: row[COL.updatedBy] ?? '',
    })).filter((it) => it.itemName);
    return Response.json({ items });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return Response.json({ error: "Couldn't load items. Check Sheet Configuration for 'items'.", detail: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  let admin;
  try { admin = await requireAuth(); }
  catch (e) { if (e instanceof Response) return e; return Response.json({ error: 'Authentication required.' }, { status: 401 }); }

  try {
    const body = await request.json();
    const { valid, data, errors } = validate(ItemSchema, body);
    if (!valid) return Response.json({ error: 'Validation failed', errors }, { status: 400 });

    const { itemName, itemType, priceOfItem, availableSizes, currentStatus } = data!;
    const rows = await readAllRows('items');

    // Duplicate name check
    const dup = rows.slice(1).find((r) => r[COL.itemName]?.toLowerCase() === itemName.toLowerCase());
    if (dup) return Response.json({ error: `An item named '${itemName}' already exists.` }, { status: 409 });

    const now = new Date().toISOString();
    const sno = String(rows.length);

    await appendRows('items', [[
      sno, itemName, itemType, String(priceOfItem),
      Array.isArray(availableSizes) ? availableSizes.join(', ') : availableSizes,
      admin.name, now, admin.name, now, currentStatus ?? 'In Stock',
    ]]);

    await logActivity({ adminName: admin.name, action: 'created', module: 'Items Management', moduleKey: 'items', recordId: itemName });
    return Response.json({ success: true, message: `Item '${itemName}' created.` }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return Response.json({ error: "Couldn't create item.", detail: message }, { status: 500 });
  }
}
