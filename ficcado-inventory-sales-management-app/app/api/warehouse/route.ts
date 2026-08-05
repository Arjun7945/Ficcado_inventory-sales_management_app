/**
 * app/api/warehouse/route.ts
 * GET  /api/warehouse — list warehouse entries & unallocated inventory balances
 * POST /api/warehouse — create warehouse allocation entry with hard inventory capping
 */

import { requireAuth } from '@/lib/auth';
import { readAllRows, appendRows } from '@/lib/google/moduleSheet';
import { validate, WarehouseSchema } from '@/lib/validation';
import { logActivity } from '@/lib/activityLogger';
import { recordInventoryHistory } from '@/lib/inventoryHistory';

export const dynamic = 'force-dynamic';

const COL_W = { sno: 0, location: 1, handler: 2, itemName: 3, size: 4, qty: 5, createdBy: 6, createdAt: 7, updatedBy: 8, updatedAt: 9 };
const COL_INV = { itemName: 1, size: 2, totalQty: 3 };

export async function GET() {
  try { await requireAuth(); }
  catch (e) { if (e instanceof Response) return e; return Response.json({ error: 'Authentication required.' }, { status: 401 }); }

  try {
    const [wRows, invRows, adminRows] = await Promise.all([
      readAllRows('warehouse'),
      readAllRows('inventory'),
      readAllRows('admin_info'),
    ]);

    // Parse warehouse rows
    const warehouse = wRows.slice(1).map((row, i) => ({
      rowIndex: i + 2,
      location: row[COL_W.location] ?? '',
      handler:  row[COL_W.handler]  ?? '',
      itemName: row[COL_W.itemName] ?? '',
      size:     row[COL_W.size]     ?? '',
      qty:      parseInt(row[COL_W.qty] ?? '0', 10) || 0,
      updatedAt: row[COL_W.updatedAt] ?? '',
    })).filter((w) => w.location);

    // Parse admins list for handler dropdown
    const admins = adminRows.slice(1)
      .map((r) => (r[1] ?? '').trim())
      .filter(Boolean);

    // Calculate live unallocated balances per item+size from Inventory
    // Map: `${itemName}:${size}` -> { totalQty, allocatedQty, remainingQty }
    const inventoryStock: Record<string, { itemName: string; size: string; totalQty: number; allocatedQty: number; remainingQty: number }> = {};

    for (const row of invRows.slice(1)) {
      const name = (row[COL_INV.itemName] ?? '').trim();
      const size = (row[COL_INV.size] ?? '').trim();
      const totalQty = parseInt(row[COL_INV.totalQty] ?? '0', 10) || 0;

      if (name && size) {
        const key = `${name}:${size}`;
        inventoryStock[key] = {
          itemName: name,
          size,
          totalQty,
          allocatedQty: 0,
          remainingQty: totalQty,
        };
      }
    }

    // Sum existing warehouse allocations
    for (const w of warehouse) {
      const key = `${w.itemName}:${w.size}`;
      if (inventoryStock[key]) {
        inventoryStock[key].allocatedQty += w.qty;
        inventoryStock[key].remainingQty = Math.max(0, inventoryStock[key].totalQty - inventoryStock[key].allocatedQty);
      }
    }

    return Response.json({
      warehouse,
      admins,
      inventoryStock: Object.values(inventoryStock),
    });
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

    const [wRows, invRows, adminRows] = await Promise.all([
      readAllRows('warehouse'),
      readAllRows('inventory'),
      readAllRows('admin_info'),
    ]);

    // 1. Verify Handler exists in Admin list
    const validAdmins = adminRows.slice(1).map((r) => (r[1] ?? '').trim()).filter(Boolean);
    if (!validAdmins.includes(handlerName.trim())) {
      return Response.json(
        { error: `Handler '${handlerName}' is not a registered admin. Select an admin from the handler list.` },
        { status: 400 }
      );
    }

    // 2. Build Inventory totals map
    const invMap: Record<string, number> = {};
    for (const row of invRows.slice(1)) {
      const name = (row[COL_INV.itemName] ?? '').trim();
      const size = (row[COL_INV.size] ?? '').trim();
      const totalQty = parseInt(row[COL_INV.totalQty] ?? '0', 10) || 0;
      if (name && size) {
        invMap[`${name}:${size}`] = totalQty;
      }
    }

    // 3. Build existing allocated map
    const allocMap: Record<string, number> = {};
    const handlerStockMap: Record<string, number> = {}; // for resulting balance calculation

    for (const row of wRows.slice(1)) {
      const name = (row[COL_W.itemName] ?? '').trim();
      const size = (row[COL_W.size] ?? '').trim();
      const handler = (row[COL_W.handler] ?? '').trim();
      const qty = parseInt(row[COL_W.qty] ?? '0', 10) || 0;

      if (name && size) {
        const key = `${name}:${size}`;
        allocMap[key] = (allocMap[key] || 0) + qty;
        if (handler === handlerName.trim()) {
          handlerStockMap[key] = (handlerStockMap[key] || 0) + qty;
        }
      }
    }

    // 4. Validate all requested items/sizes against remaining balances
    for (const item of items) {
      for (const sizeQty of item.sizes) {
        const key = `${item.itemName.trim()}:${sizeQty.size.trim()}`;
        const total = invMap[key] ?? 0;
        const alreadyAllocated = allocMap[key] ?? 0;
        const remaining = total - alreadyAllocated;

        if (sizeQty.quantity > remaining) {
          return Response.json(
            {
              error: `Only ${Math.max(0, remaining)} piece(s) of ${item.itemName}, size ${sizeQty.size} remain unallocated.`,
            },
            { status: 400 }
          );
        }
      }
    }

    // 5. Commit allocations
    const now = new Date().toISOString();
    let currentRowsCount = wRows.length;

    for (const item of items) {
      for (const sizeQty of item.sizes) {
        currentRowsCount++;
        const sno = String(currentRowsCount);
        const itemName = item.itemName.trim();
        const size = sizeQty.size.trim();
        const qty = sizeQty.quantity;

        await appendRows('warehouse', [[
          sno, warehouseLocation, handlerName, itemName,
          size, String(qty), admin.name, now, admin.name, now,
        ]]);

        // Calculate resulting balance for this handler & item+size
        const key = `${itemName}:${size}`;
        const previousHandlerBalance = handlerStockMap[key] || 0;
        const newHandlerBalance = previousHandlerBalance + qty;
        handlerStockMap[key] = newHandlerBalance;

        // Log to inventory_history
        await recordInventoryHistory({
          itemName,
          size,
          quantityChange: qty,
          affectedSheet: 'Warehouse',
          handler: handlerName,
          transactionType: 'Warehouse Allocation',
          resultingBalance: newHandlerBalance,
          createdBy: admin.name,
          notes: `Allocated to ${warehouseLocation}`,
        });
      }
    }

    await logActivity({ adminName: admin.name, action: 'created', module: 'Warehouse Management', moduleKey: 'warehouse', recordId: warehouseLocation });
    return Response.json({ success: true, message: `Warehouse entries added for ${warehouseLocation}.` }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return Response.json({ error: "Couldn't save warehouse entry.", detail: message }, { status: 500 });
  }
}
