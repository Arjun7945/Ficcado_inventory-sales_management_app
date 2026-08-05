/**
 * app/api/warehouse/route.ts
 * GET  /api/warehouse — list warehouse entries
 * POST /api/warehouse — create warehouse allocation entry
 */

import { requireAuth } from '@/lib/auth';
import { readAllRows, appendRows } from '@/lib/google/moduleSheet';
import { validate, WarehouseSchema } from '@/lib/validation';
import { logActivity } from '@/lib/activityLogger';

export const dynamic = 'force-dynamic';

const COL = { sno: 0, location: 1, handler: 2, itemName: 3, size: 4, qty: 5, createdBy: 6, createdAt: 7, updatedBy: 8, updatedAt: 9 };

export async function GET() {
  try { await requireAuth(); }
  catch (e) { if (e instanceof Response) return e; return Response.json({ error: 'Authentication required.' }, { status: 401 }); }

  try {
    const rows = await readAllRows('warehouse');
    const warehouse = rows.slice(1).map((row, i) => ({
      rowIndex: i + 2,
      location: row[COL.location] ?? '',
      handler:  row[COL.handler]  ?? '',
      itemName: row[COL.itemName] ?? '',
      size:     row[COL.size]     ?? '',
      qty:      row[COL.qty]      ?? '0',
      updatedAt: row[COL.updatedAt] ?? '',
    })).filter((w) => w.location);
    return Response.json({ warehouse });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return Response.json({ error: "Couldn't load warehouse data.", detail: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  let admin;
  try { admin = await requireAuth(); }
  catch (e) { if (e instanceof Response) return e; return Response.json({ error: 'Authentication required.' }, { status: 401 }); }

  try {
    const body = await request.json();
    const { valid, data, errors } = validate(WarehouseSchema, body);
    if (!valid) return Response.json({ error: 'Validation failed', errors }, { status: 400 });

    const { warehouseLocation, handlerName, items } = data!;
    const rows = await readAllRows('warehouse');
    const now = new Date().toISOString();

    for (const item of items) {
      for (const sizeQty of item.sizes) {
        const sno = String(rows.length + 1);
        await appendRows('warehouse', [[
          sno, warehouseLocation, handlerName, item.itemName,
          sizeQty.size, String(sizeQty.quantity), admin.name, now, admin.name, now,
        ]]);
      }
    }

    await logActivity({ adminName: admin.name, action: 'created', module: 'Warehouse Management', moduleKey: 'warehouse', recordId: warehouseLocation });
    return Response.json({ success: true, message: `Warehouse entries added for ${warehouseLocation}.` }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return Response.json({ error: "Couldn't save warehouse entry.", detail: message }, { status: 500 });
  }
}
