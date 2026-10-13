/**
 * app/api/warehouse/route.ts
 * GET  /api/warehouse — list warehouse entries & unallocated inventory balances (header-mapped)
 * POST /api/warehouse — create warehouse allocation entry with hard inventory capping (header-mapped)
 */

import { requireAuth } from '@/lib/auth';
import { readAllRows, appendRows, updateRow } from '@/lib/google/moduleSheet';
import { buildHeaderMap, getCellByHeader, formatRowFromHeaderMap } from '@/lib/google/headerUtils';
import { validate, WarehouseSchema } from '@/lib/validation';
import { logActivity } from '@/lib/activityLogger';
import { recordInventoryHistory } from '@/lib/inventoryHistory';
import { MODULE_REGISTRY } from '@/lib/google/moduleRegistry';

export const dynamic = 'force-dynamic';

const EXPECTED_HEADERS = MODULE_REGISTRY.warehouse.headers;

export async function GET() {
  try { await requireAuth(); }
  catch (e) { if (e instanceof Response) return e; return Response.json({ error: 'Authentication required.' }, { status: 401 }); }

  try {
    const [wRows, invRows, adminRows] = await Promise.all([
      readAllRows('warehouse'),
      readAllRows('inventory'),
      readAllRows('admin_info'),
    ]);

    if (wRows.length === 0) {
      await updateRow('warehouse', 1, EXPECTED_HEADERS).catch(() => {});
      return Response.json({ warehouse: [], admins: [], inventoryStock: [] });
    }

    if (wRows[0] && wRows[0].length < EXPECTED_HEADERS.length) {
      await updateRow('warehouse', 1, EXPECTED_HEADERS).catch(() => {});
    }

    const wMap = buildHeaderMap(wRows[0]);
    const invMapHeaders = buildHeaderMap(invRows[0] ?? []);
    const adminMap = buildHeaderMap(adminRows[0] ?? []);

    // Parse warehouse rows
    const warehouse = wRows.slice(1).map((row, i) => ({
      rowIndex: i + 2,
      location: getCellByHeader(row, wMap, 'Warehouse Location'),
      handler:  getCellByHeader(row, wMap, 'Handler Name'),
      itemName: getCellByHeader(row, wMap, 'Item Name'),
      size:     getCellByHeader(row, wMap, 'Size'),
      qty:      parseInt(getCellByHeader(row, wMap, 'Quantity', '0'), 10) || 0,
      updatedAt: getCellByHeader(row, wMap, 'Updated At'),
    })).filter((w) => w.location);

    // Parse admins list for handler dropdown
    const admins = adminRows.slice(1)
      .map((r) => getCellByHeader(r, adminMap, 'Admin Name').trim())
      .filter(Boolean);

    // Calculate live unallocated balances per item+size from Inventory
    const inventoryStock: Record<string, { itemName: string; size: string; totalQty: number; allocatedQty: number; remainingQty: number }> = {};

    for (const row of invRows.slice(1)) {
      const name = getCellByHeader(row, invMapHeaders, 'Item Name').trim();
      const size = getCellByHeader(row, invMapHeaders, 'Size').trim();
      const totalQty = parseInt(getCellByHeader(row, invMapHeaders, 'Total Quantity Available', getCellByHeader(row, invMapHeaders, 'Quantity', '0')), 10) || 0;

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

    if (wRows.length === 0 || (wRows[0] && wRows[0].length < EXPECTED_HEADERS.length)) {
      await updateRow('warehouse', 1, EXPECTED_HEADERS).catch(() => {});
    }

    const wMapHeaders   = buildHeaderMap(wRows[0] ?? []);
    const invMapHeaders = buildHeaderMap(invRows[0] ?? []);

    // Build Inventory totals map (normalized key)
    const invMap: Record<string, number> = {};
    for (const row of invRows.slice(1)) {
      const name = getCellByHeader(row, invMapHeaders, 'Item Name').trim();
      const size = getCellByHeader(row, invMapHeaders, 'Size').trim();
      const totalQty = parseInt(getCellByHeader(row, invMapHeaders, 'Total Quantity Available', getCellByHeader(row, invMapHeaders, 'Quantity', '0')), 10) || 0;
      if (name && size) {
        invMap[`${name.toLowerCase()}:${size.toUpperCase()}`] = totalQty;
      }
    }

    // Build existing allocated map
    const allocMap: Record<string, number> = {};
    const handlerStockMap: Record<string, number> = {};

    for (const row of wRows.slice(1)) {
      const name = getCellByHeader(row, wMapHeaders, 'Item Name').trim();
      const size = getCellByHeader(row, wMapHeaders, 'Size').trim();
      const handler = getCellByHeader(row, wMapHeaders, 'Handler Name').trim();
      const qty = parseInt(getCellByHeader(row, wMapHeaders, 'Quantity', '0'), 10) || 0;

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
    let currentRowsCount = Math.max(wRows.length - 1, 0);
    const rowsToAppend: string[][] = [];

    for (const item of normalizedItems) {
      currentRowsCount++;
      const sno = String(currentRowsCount);
      const itemName = item.itemName.trim();
      const size = item.size.trim();
      const qty = item.qty;

      const wObj = {
        'S.No':               sno,
        'Warehouse Location': warehouseLocation.trim(),
        'Handler Name':       handlerName.trim(),
        'Item Name':          itemName,
        'Size':               size,
        'Quantity':           String(qty),
        'Created By':         admin.name,
        'Created At':         now,
        'Updated By':         admin.name,
        'Updated At':         now,
      };

      rowsToAppend.push(formatRowFromHeaderMap(wObj, EXPECTED_HEADERS));

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
