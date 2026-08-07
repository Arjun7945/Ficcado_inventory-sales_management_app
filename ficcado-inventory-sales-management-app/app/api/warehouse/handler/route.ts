/**
 * app/api/warehouse/handler/route.ts
 *
 * PUT    /api/warehouse/handler — update all allocated items for a specific (location, handler) pair
 * DELETE /api/warehouse/handler — delete all allocation rows for a specific (location, handler) pair
 */

import { requireAuth } from '@/lib/auth';
import { readAllRows, deleteRow, appendRows } from '@/lib/google/moduleSheet';
import { logActivity } from '@/lib/activityLogger';
import { recordInventoryHistory } from '@/lib/inventoryHistory';

export const dynamic = 'force-dynamic';

const COL_W = { sno: 0, location: 1, handler: 2, itemName: 3, size: 4, qty: 5, createdBy: 6, createdAt: 7, updatedBy: 8, updatedAt: 9 };
const COL_INV = { itemName: 1, size: 2, totalQty: 3 };

export async function PUT(request: Request) {
  let admin;
  try { admin = await requireAuth(); }
  catch (e) { if (e instanceof Response) return e; return Response.json({ error: 'Authentication required.' }, { status: 401 }); }

  try {
    const body = await request.json();
    const { originalLocation, originalHandler, newLocation, newHandler, items } = body;
    // items: array of { itemName, size, qty }

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

    const now = new Date().toISOString();

    // 1. Calculate unallocated inventory stock for each requested item+size
    // excluding current handler's allocations
    for (const item of items) {
      const normName = item.itemName.trim().toLowerCase();
      const normSize = item.size.trim().toUpperCase();

      const invRow = invRows.slice(1).find(
        (r) => (r[COL_INV.itemName] ?? '').trim().toLowerCase() === normName && (r[COL_INV.size] ?? '').trim().toUpperCase() === normSize
      );
      const totalInvQty = invRow ? (parseInt(invRow[COL_INV.totalQty] ?? '0', 10) || 0) : 0;

      // Sum allocations by OTHER handlers
      const otherAllocations = wRows.slice(1).reduce((sum, r) => {
        const isCurrentHandler = (r[COL_W.location] ?? '').trim() === originalLocation.trim() &&
                                 (r[COL_W.handler] ?? '').trim() === originalHandler.trim();
        const matchesItem = (r[COL_W.itemName] ?? '').trim().toLowerCase() === normName &&
                            (r[COL_W.size] ?? '').trim().toUpperCase() === normSize;
        if (!isCurrentHandler && matchesItem) {
          return sum + (parseInt(r[COL_W.qty] ?? '0', 10) || 0);
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
        (r[COL_W.location] ?? '').trim() === originalLocation.trim() &&
        (r[COL_W.handler] ?? '').trim() === originalHandler.trim()
      ) {
        rowIndicesToDelete.push(idx + 2);
      }
    });

    // Delete in reverse order to preserve row indices
    for (let i = rowIndicesToDelete.length - 1; i >= 0; i--) {
      await deleteRow('warehouse', rowIndicesToDelete[i]);
    }

    // 3. Append updated rows
    const currentWRows = await readAllRows('warehouse');
    let snoCounter = currentWRows.length;
    const newRowsToAppend: string[][] = [];

    for (const item of items) {
      if (item.qty > 0) {
        snoCounter++;
        newRowsToAppend.push([
          String(snoCounter),
          newLocation.trim(),
          newHandler.trim(),
          item.itemName.trim(),
          item.size.trim(),
          String(item.qty),
          admin.name,
          now,
          admin.name,
          now,
        ]);

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
    return Response.json({ error: "Couldn't update handler warehouse stock.", detail: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  let admin;
  try { admin = await requireAuth(); }
  catch (e) { if (e instanceof Response) return e; return Response.json({ error: 'Authentication required.' }, { status: 401 }); }

  try {
    const { searchParams } = new URL(request.url);
    const location = searchParams.get('location');
    const handler  = searchParams.get('handler');

    if (!location || !handler) {
      return Response.json({ error: 'Location and Handler parameters are required.' }, { status: 400 });
    }

    const wRows = await readAllRows('warehouse');
    const rowIndicesToDelete: number[] = [];

    wRows.slice(1).forEach((r, idx) => {
      if (
        (r[COL_W.location] ?? '').trim() === location.trim() &&
        (r[COL_W.handler] ?? '').trim() === handler.trim()
      ) {
        rowIndicesToDelete.push(idx + 2);
      }
    });

    if (rowIndicesToDelete.length === 0) {
      return Response.json({ error: 'No allocations found for this handler and location.' }, { status: 404 });
    }

    // Delete in reverse order
    for (let i = rowIndicesToDelete.length - 1; i >= 0; i--) {
      await deleteRow('warehouse', rowIndicesToDelete[i]);
    }

    await recordInventoryHistory({
      itemName: 'Multiple Items',
      size: 'All',
      quantityChange: 0,
      affectedSheet: 'Warehouse',
      handler: handler.trim(),
      transactionType: 'Warehouse Deallocation',
      resultingBalance: 0,
      createdBy: admin.name,
      notes: `Deallocated all warehouse stock for ${handler} at ${location}`,
    });

    await logActivity({
      adminName: admin.name,
      action: 'deleted',
      module: 'Warehouse Management',
      moduleKey: 'warehouse',
      recordId: `${handler} (${location})`,
    });

    return Response.json({ success: true, message: `Deleted all allocations for ${handler} at ${location}.` });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return Response.json({ error: "Couldn't delete handler warehouse allocations.", detail: message }, { status: 500 });
  }
}
