/**
 * app/api/inventory/route.ts
 * GET  /api/inventory — list all inventory rows & items dropdown
 * POST /api/inventory — add or update inventory entry (Items-sourced)
 */

import { requireAuth } from '@/lib/auth';
import { readAllRows, appendRows, updateRow } from '@/lib/google/moduleSheet';
import { validate, InventorySchema } from '@/lib/validation';
import { logActivity } from '@/lib/activityLogger';
import { recordInventoryHistory } from '@/lib/inventoryHistory';

export const dynamic = 'force-dynamic';

const COL = { sno: 0, itemName: 1, size: 2, qty: 3, addedBy: 4, updatedAt: 5, updatedBy: 6, createdAt: 7 };

export async function GET() {
  try { await requireAuth(); }
  catch (e) { if (e instanceof Response) return e; return Response.json({ error: 'Authentication required.' }, { status: 401 }); }

  try {
    const [invRows, itemRows] = await Promise.all([
      readAllRows('inventory'),
      readAllRows('items'),
    ]);

    const inventory = invRows.slice(1).map((row, i) => {
      const qtyNum = parseInt(row[COL.qty] ?? '0', 10) || 0;
      return {
        rowIndex:      i + 2,
        sno:           row[COL.sno]       ?? '',
        itemName:      row[COL.itemName]  ?? '',
        size:          row[COL.size]      ?? '',
        qty:           qtyNum,
        addedBy:       row[COL.addedBy]   ?? '',
        updatedAt:     row[COL.updatedAt] ?? '',
        updatedBy:     row[COL.updatedBy] ?? '',
        createdAt:     row[COL.createdAt] ?? '',
        currentStatus: qtyNum > 0 ? 'In Stock' : 'Out of Stock',
      };
    }).filter((inv) => inv.itemName);

    // Get list of registered items with available sizes
    const items = itemRows.slice(1).map((r) => ({
      itemName: r[1] ?? '',
      sizes:    r[4] ? r[4].split(/,\s*/).filter(Boolean) : ['XS', 'S', 'M', 'L', 'XL'],
      status:   r[9] ?? 'In Stock',
    })).filter((it) => it.itemName);

    return Response.json({ inventory, items });
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
    const validation = validate(InventorySchema, body);
    if (!validation.valid) return Response.json({ error: validation.errorMessage, errors: validation.errors }, { status: 400 });

    const { itemName, size, totalQuantityAvailable } = validation.data!;

    const [invRows, itemRows] = await Promise.all([
      readAllRows('inventory'),
      readAllRows('items'),
    ]);

    // Verify item exists in Items Management
    const validItems = itemRows.slice(1).map((r) => (r[1] ?? '').trim()).filter(Boolean);
    if (!validItems.includes(itemName.trim())) {
      return Response.json(
        { error: `Item '${itemName}' does not exist in Items Management. Please select a valid item.` },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();

    // Check for existing entry (same item + size)
    const existingIdx = invRows.slice(1).findIndex(
      (r) => r[COL.itemName]?.toLowerCase() === itemName.toLowerCase() && r[COL.size] === size
    );

    if (existingIdx >= 0) {
      // Update existing
      const rowIndex = existingIdx + 2;
      const row = invRows[existingIdx + 1];
      const oldQty = parseInt(row[COL.qty] ?? '0', 10) || 0;
      const diff = totalQuantityAvailable - oldQty;

      await updateRow('inventory', rowIndex, [
        row[COL.sno], itemName, size, String(totalQuantityAvailable),
        row[COL.addedBy] ?? admin.name, now, admin.name, row[COL.createdAt] ?? now,
      ]);

      if (diff !== 0) {
        await recordInventoryHistory({
          itemName,
          size,
          quantityChange: diff,
          affectedSheet: 'Inventory',
          transactionType: 'Manual Adjustment',
          resultingBalance: totalQuantityAvailable,
          createdBy: admin.name,
          notes: 'Updated via Inventory Management Add/Update',
        });
      }

      await logActivity({ adminName: admin.name, action: 'updated', module: 'Inventory Management', moduleKey: 'inventory', recordId: `${itemName} (${size})` });
      return Response.json({ success: true, message: `Inventory for ${itemName} (${size}) updated to ${totalQuantityAvailable} piece(s).` });
    }

    // Append new row
    const sno = String(invRows.length);
    await appendRows('inventory', [[sno, itemName, size, String(totalQuantityAvailable), admin.name, now, admin.name, now]]);

    if (totalQuantityAvailable > 0) {
      await recordInventoryHistory({
        itemName,
        size,
        quantityChange: totalQuantityAvailable,
        affectedSheet: 'Inventory',
        transactionType: 'Manual Adjustment',
        resultingBalance: totalQuantityAvailable,
        createdBy: admin.name,
        notes: 'Added via Inventory Management',
      });
    }

    await logActivity({ adminName: admin.name, action: 'created', module: 'Inventory Management', moduleKey: 'inventory', recordId: `${itemName} (${size})` });
    return Response.json({ success: true, message: `Inventory for ${itemName} (${size}) added (${totalQuantityAvailable} piece(s)).` }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return Response.json({ error: "Couldn't update inventory.", detail: message }, { status: 500 });
  }
}
