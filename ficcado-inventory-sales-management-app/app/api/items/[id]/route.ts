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
    await updateRow('items', idx + 2, [
      row[COL.sno], data!.itemName, data!.itemType, String(data!.priceOfItem),
      data!.availableSizes.join(', '), row[COL.createdBy], row[COL.createdAt],
      admin.name, now, data!.currentStatus,
    ]);
    await logActivity({ adminName: admin.name, action: 'updated', module: 'Items Management', moduleKey: 'items', recordId: data!.itemName });
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
    const name = rows[idx + 1][COL.itemName];
    await deleteRow('items', idx + 2);
    await logActivity({ adminName: admin.name, action: 'deleted', module: 'Items Management', moduleKey: 'items', recordId: name });
    return Response.json({ success: true });
  } catch (err) { return Response.json({ error: 'Failed to delete item.', detail: (err as Error).message }, { status: 500 }); }
}
