/**
 * app/api/inventory/route.ts
 * GET  /api/inventory — list all inventory rows
 * POST /api/inventory — add or update inventory entry
 */

import { requireAuth } from '@/lib/auth';
import { readAllRows, appendRows, updateRow } from '@/lib/google/moduleSheet';
import { validate, InventorySchema } from '@/lib/validation';
import { logActivity } from '@/lib/activityLogger';

export const dynamic = 'force-dynamic';

const COL = { sno: 0, itemName: 1, size: 2, qty: 3, addedBy: 4, updatedAt: 5, updatedBy: 6, createdAt: 7 };

export async function GET() {
  try { await requireAuth(); }
  catch (e) { if (e instanceof Response) return e; return Response.json({ error: 'Authentication required.' }, { status: 401 }); }

  try {
    const rows = await readAllRows('inventory');
    const inventory = rows.slice(1).map((row, i) => ({
      rowIndex: i + 2,
      sno:      row[COL.sno]       ?? '',
      itemName: row[COL.itemName]  ?? '',
      size:     row[COL.size]      ?? '',
      qty:      row[COL.qty]       ?? '0',
      addedBy:  row[COL.addedBy]   ?? '',
      updatedAt: row[COL.updatedAt] ?? '',
      updatedBy: row[COL.updatedBy] ?? '',
      createdAt: row[COL.createdAt] ?? '',
    })).filter((inv) => inv.itemName);
    return Response.json({ inventory });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return Response.json({ error: "Couldn't load inventory.", detail: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  let admin;
  try { admin = await requireAuth(); }
  catch (e) { if (e instanceof Response) return e; return Response.json({ error: 'Authentication required.' }, { status: 401 }); }

  try {
    const body = await request.json();
    const { valid, data, errors } = validate(InventorySchema, body);
    if (!valid) return Response.json({ error: 'Validation failed', errors }, { status: 400 });

    const { itemName, size, totalQuantityAvailable } = data!;
    const rows = await readAllRows('inventory');
    const now = new Date().toISOString();

    // Check for existing entry (same item + size)
    const existingIdx = rows.slice(1).findIndex(
      (r) => r[COL.itemName]?.toLowerCase() === itemName.toLowerCase() && r[COL.size] === size
    );

    if (existingIdx >= 0) {
      // Update existing
      const rowIndex = existingIdx + 2;
      const row = rows[existingIdx + 1];
      await updateRow('inventory', rowIndex, [
        row[COL.sno], itemName, size, String(totalQuantityAvailable),
        admin.name, now, admin.name, row[COL.createdAt] ?? now,
      ]);
      await logActivity({ adminName: admin.name, action: 'updated', module: 'Inventory Management', moduleKey: 'inventory', recordId: `${itemName} (${size})` });
      return Response.json({ success: true, message: `Inventory for ${itemName} (${size}) updated.` });
    }

    // Append new row
    const sno = String(rows.length);
    await appendRows('inventory', [[sno, itemName, size, String(totalQuantityAvailable), admin.name, now, admin.name, now]]);
    await logActivity({ adminName: admin.name, action: 'created', module: 'Inventory Management', moduleKey: 'inventory', recordId: `${itemName} (${size})` });
    return Response.json({ success: true, message: `Inventory for ${itemName} (${size}) added.` }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return Response.json({ error: "Couldn't update inventory.", detail: message }, { status: 500 });
  }
}
