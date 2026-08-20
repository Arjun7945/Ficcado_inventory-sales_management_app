/**
 * app/api/warehouse/handler/route.ts
 *
 * PUT    /api/warehouse/handler — update all allocated items for a specific (location, handler) pair (header-mapped)
 * DELETE /api/warehouse/handler — delete all allocation rows for a specific (location, handler) pair (header-mapped)
 */

import { requireAuth } from '@/lib/auth';
import { readAllRows, deleteRow, appendRows, updateRow } from '@/lib/google/moduleSheet';
import { buildHeaderMap, getCellByHeader, formatRowFromHeaderMap } from '@/lib/google/headerUtils';
import { logActivity } from '@/lib/activityLogger';
import { recordInventoryHistory } from '@/lib/inventoryHistory';
import { MODULE_REGISTRY } from '@/lib/google/moduleRegistry';

export const dynamic = 'force-dynamic';

const EXPECTED_HEADERS = MODULE_REGISTRY.warehouse.headers;

export async function PUT(request: Request) {
  let admin;
  try { admin = await requireAuth(); }
  catch (e) { if (e instanceof Response) return e; return Response.json({ error: 'Authentication required.' }, { status: 401 }); }

  try {
    const body = await request.json();
    const { originalLocation, originalHandler, newLocation, newHandler, items } = body;

    if (!originalLocation || !originalHandler || !newLocation || !newHandler) {
      return Response.json({ error: 'Location and Handler names are required.' }, { status: 400 });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return Response.json({ error: 'Select at least one item and size variant for allocation.' }, { status: 400 });
    }

    const [wRows, invRows] = await Promise.all([
      readAllRows('warehouse'),
      readAllRows('inventory'),
    ]);

    if (wRows.length === 0 || (wRows[0] && wRows[0].length < EXPECTED_HEADERS.length)) {
      await updateRow('warehouse', 1, EXPECTED_HEADERS).catch(() => {});
    }

    const wMap   = buildHeaderMap(wRows[0] ?? []);
    const invMap = buildHeaderMap(invRows[0] ?? []);

    const now = new Date().toISOString();

    // 1. Calculate unallocated inventory stock for each requested item+size
    for (const item of items) {
      const normName = item.itemName.trim().toLowerCase();
      const normSize = item.size.trim().toUpperCase();

      const invRow = invRows.slice(1).find(
        (r) => getCellByHeader(r, invMap, 'Item Name').trim().toLowerCase() === normName &&
          getCellByHeader(r, invMap, 'Size').trim().toUpperCase() === normSize
      );
      const totalInvQty = invRow ? (parseInt(getCellByHeader(invRow, invMap, 'Total Quantity Available', getCellByHeader(invRow, invMap, 'Quantity', '0')), 10) || 0) : 0;

      // Sum allocations by OTHER handlers
      const otherAllocations = wRows.slice(1).reduce((sum, r) => {
        const isCurrentHandler = getCellByHeader(r, wMap, 'Warehouse Location').trim() === originalLocation.trim() &&
                                 getCellByHeader(r, wMap, 'Handler Name').trim() === originalHandler.trim();
        const matchesItem = getCellByHeader(r, wMap, 'Item Name').trim().toLowerCase() === normName &&
                            getCellByHeader(r, wMap, 'Size').trim().toUpperCase() === normSize;
        if (!isCurrentHandler && matchesItem) {
          return sum + (parseInt(getCellByHeader(r, wMap, 'Quantity', '0'), 10) || 0);
        }
        return sum;
      }, 0);

      const unallocated = totalInvQty - otherAllocations;
      if (item.qty > unallocated) {
        return Response.json(
          { error: `Cannot allocate ${item.qty} piece(s) of ${item.itemName} (${item.size}). Only ${unallocated} piece(s) remain unallocated in Inventory.` },
          { status: 400 }
        );
      }
    }

    // 2. Remove old rows for this (originalLocation, originalHandler)
    const rowIndicesToDelete: number[] = [];
    wRows.slice(1).forEach((r, idx) => {
      if (
        getCellByHeader(r, wMap, 'Warehouse Location').trim() === originalLocation.trim() &&
        getCellByHeader(r, wMap, 'Handler Name').trim() === originalHandler.trim()
      ) {
        rowIndicesToDelete.push(idx + 2);
      }
    });

    for (let i = rowIndicesToDelete.length - 1; i >= 0; i--) {
      await deleteRow('warehouse', rowIndicesToDelete[i]);
    }

    // 3. Append updated rows
    const currentWRows = await readAllRows('warehouse');
    let snoCounter = Math.max(currentWRows.length - 1, 0);
    const newRowsToAppend: string[][] = [];

    for (const item of items) {
      if (item.qty > 0) {
        snoCounter++;
        const wObj = {
          'S.No':               String(snoCounter),
          'Warehouse Location': newLocation.trim(),
          'Handler Name':       newHandler.trim(),
          'Item Name':          item.itemName.trim(),
          'Size':               item.size.trim(),
          'Quantity':           String(item.qty),
          'Created By':         admin.name,
          'Created At':         now,
          'Updated By':         admin.name,
          'Updated At':         now,
        };

        newRowsToAppend.push(formatRowFromHeaderMap(wObj, EXPECTED_HEADERS));

        await recordInventoryHistory({
          itemName: item.itemName,
          size: item.size,
          quantityChange: item.qty,
          affectedSheet: 'Warehouse',
          handler: newHandler.trim(),
          transactionType: 'Warehouse Allocation',
          resultingBalance: item.qty,
          createdBy: admin.name,
          notes: `Updated allocation for ${newHandler} at ${newLocation}`,
        });
      }
    }

    if (newRowsToAppend.length > 0) {
      await appendRows('warehouse', newRowsToAppend);
    }

    const logMsg = `${admin.name} updated warehouse allocations for ${newHandler} at ${newLocation}.`;
    await logActivity({
      adminName: admin.name,
      action: 'updated',
      module: 'Warehouse Management',
      moduleKey: 'warehouse',
      recordId: `${newHandler} (${newLocation})`,
    });

    return Response.json({ success: true, message: logMsg });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return Response.json({ error: "Couldn't update warehouse allocation.", detail: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  let admin;
  try { admin = await requireAuth(); }
  catch (e) { if (e instanceof Response) return e; return Response.json({ error: 'Authentication required.' }, { status: 401 }); }

  try {
    const body = await request.json();
    const { location, handler } = body;

    if (!location || !handler) {
      return Response.json({ error: 'Location and Handler names are required.' }, { status: 400 });
    }

    const wRows = await readAllRows('warehouse');
    if (wRows.length < 2) {
      return Response.json({ error: 'No warehouse allocations found.' }, { status: 404 });
    }

    const wMap = buildHeaderMap(wRows[0]);
    const rowIndicesToDelete: number[] = [];

    wRows.slice(1).forEach((r, idx) => {
      if (
        getCellByHeader(r, wMap, 'Warehouse Location').trim() === location.trim() &&
        getCellByHeader(r, wMap, 'Handler Name').trim() === handler.trim()
      ) {
        rowIndicesToDelete.push(idx + 2);
      }
    });

    if (rowIndicesToDelete.length === 0) {
      return Response.json({ error: `No allocations found for handler '${handler}' at location '${location}'.` }, { status: 404 });
    }

    for (let i = rowIndicesToDelete.length - 1; i >= 0; i--) {
      await deleteRow('warehouse', rowIndicesToDelete[i]);
    }

    const logMsg = `${admin.name} deleted all warehouse allocations for ${handler} at ${location}.`;
    await logActivity({
      adminName: admin.name,
      action: 'deleted',
      module: 'Warehouse Management',
      moduleKey: 'warehouse',
      recordId: `${handler} (${location})`,
    });

    return Response.json({ success: true, message: logMsg });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return Response.json({ error: "Couldn't delete warehouse allocation.", detail: message }, { status: 500 });
  }
}
