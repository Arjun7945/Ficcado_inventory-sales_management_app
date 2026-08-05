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
    const inventoryStock: Record<string, { itemName: string; size: string; totalQty: number; allocatedQty: number; remainingQty: number }> = {};

    for (const row of invRows.slice(1)) {
      const name = (row[COL_INV.itemName] ?? '').trim();
      const size = (row[COL_INV.size] ?? '').trim();
      const totalQty = parseInt(row[COL_INV.totalQty] ?? '0', 10) || 0;

      if (name && size) {
        const key = `${name.toLowerCase()}:${size.toUpperCase()}`;
        inventoryStock[key] = {
          itemName: name,
          size: size.toUpperCase(),
          totalQty,
          allocatedQty: 0,
          remainingQty: totalQty,
        };
      }
    }

    // Sum existing warehouse allocations
    for (const w of warehouse) {
      const key = `${w.itemName.toLowerCase()}:${w.size.toUpperCase()}`;
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

    // Normalize items array to support both flat [{ itemName, size, qty }] and nested [{ itemName, sizes: [...] }]
    const normalizedItems: { itemName: string; size: string; qty: number }[] = [];
    if (Array.isArray(body.items)) {
      for (const it of body.items) {
        if (it.itemName && it.size && (it.qty !== undefined || it.quantity !== undefined)) {
          const q = parseInt(String(it.qty ?? it.quantity ?? 0), 10) || 0;
          if (q > 0) {
            normalizedItems.push({ itemName: String(it.itemName).trim(), size: String(it.size).trim(), qty: q });
          }
        } else if (it.itemName && Array.isArray(it.sizes)) {
          for (const sz of it.sizes) {
            const q = parseInt(String(sz.quantity ?? sz.qty ?? 0), 10) || 0;
            if (q > 0) {
              normalizedItems.push({ itemName: String(it.itemName).trim(), size: String(sz.size).trim(), qty: q });
            }
          }
        }
      }
    }

    const payloadToValidate = {
      warehouseLocation: body.warehouseLocation,
      handlerName:       body.handlerName,
      items:             normalizedItems,
    };

    const validation = validate(WarehouseSchema, payloadToValidate);
    if (!validation.valid) {
      return Response.json({ error: validation.errorMessage, errors: validation.errors }, { status: 400 });
    }

    const { warehouseLocation, handlerName } = validation.data!;

    if (normalizedItems.length === 0) {
      return Response.json({ error: 'Select at least one item variant and enter a quantity greater than 0.' }, { status: 400 });
    }

    const [wRows, invRows] = await Promise.all([
      readAllRows('warehouse'),
      readAllRows('inventory'),
    ]);

    // Build Inventory totals map (normalized key)
    const invMap: Record<string, number> = {};
    for (const row of invRows.slice(1)) {
      const name = (row[COL_INV.itemName] ?? '').trim();
      const size = (row[COL_INV.size] ?? '').trim();
      const totalQty = parseInt(row[COL_INV.totalQty] ?? '0', 10) || 0;
      if (name && size) {
        invMap[`${name.toLowerCase()}:${size.toUpperCase()}`] = totalQty;
      }
    }

    // Build existing allocated map
    const allocMap: Record<string, number> = {};
    const handlerStockMap: Record<string, number> = {};

    for (const row of wRows.slice(1)) {
      const name = (row[COL_W.itemName] ?? '').trim();
      const size = (row[COL_W.size] ?? '').trim();
      const handler = (row[COL_W.handler] ?? '').trim();
      const qty = parseInt(row[COL_W.qty] ?? '0', 10) || 0;

      if (name && size) {
        const key = `${name.toLowerCase()}:${size.toUpperCase()}`;
        allocMap[key] = (allocMap[key] || 0) + qty;
        if (handler.toLowerCase() === handlerName.trim().toLowerCase()) {
          handlerStockMap[key] = (handlerStockMap[key] || 0) + qty;
        }
      }
    }

    // Validate all requested items/sizes against remaining balances
    for (const item of normalizedItems) {
      const key = `${item.itemName.toLowerCase()}:${item.size.toUpperCase()}`;
      const total = invMap[key] ?? 0;
      const alreadyAllocated = allocMap[key] ?? 0;
      const remaining = total - alreadyAllocated;

      if (item.qty > remaining) {
        return Response.json(
          { error: `Only ${Math.max(0, remaining)} piece(s) of ${item.itemName} (${item.size}) remain unallocated in Inventory.` },
          { status: 400 }
        );
      }
    }

    // Commit allocations
    const now = new Date().toISOString();
    let currentRowsCount = wRows.length;
    const rowsToAppend: string[][] = [];

    for (const item of normalizedItems) {
      currentRowsCount++;
      const sno = String(currentRowsCount);
      const itemName = item.itemName.trim();
      const size = item.size.trim();
      const qty = item.qty;

      rowsToAppend.push([
        sno, warehouseLocation.trim(), handlerName.trim(), itemName,
        size, String(qty), admin.name, now, admin.name, now,
      ]);

      const key = `${itemName.toLowerCase()}:${size.toUpperCase()}`;
      const newHandlerBalance = (handlerStockMap[key] || 0) + qty;

      await recordInventoryHistory({
        itemName,
        size,
        quantityChange: qty,
        affectedSheet: 'Warehouse',
        handler: handlerName.trim(),
        transactionType: 'Warehouse Allocation',
        resultingBalance: newHandlerBalance,
        createdBy: admin.name,
        notes: `Allocated ${qty} piece(s) to ${handlerName.trim()} at ${warehouseLocation.trim()}`,
      });
    }

    if (rowsToAppend.length > 0) {
      await appendRows('warehouse', rowsToAppend);
    }

    const logMsg = `${admin.name} allocated ${normalizedItems.length} item variant(s) to ${handlerName.trim()} at ${warehouseLocation.trim()}.`;
    await logActivity({
      adminName: admin.name,
      action: 'created',
      module: 'Warehouse Management',
      moduleKey: 'warehouse',
      recordId: `${handlerName.trim()} (${warehouseLocation.trim()})`,
    });

    return Response.json({ success: true, message: logMsg });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return Response.json({ error: "Couldn't create warehouse allocation.", detail: message }, { status: 500 });
  }
}
