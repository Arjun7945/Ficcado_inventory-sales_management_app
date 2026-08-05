/**
 * app/api/replacement/[id]/route.ts
 * GET, PUT, DELETE for a single replacement record.
 * Handles old-item disposition (Restock to Inventory/Handler vs Damaged Products),
 * new-item inventory deductions, and automatic Sales unlocking when completed.
 */

import { requireAuth } from '@/lib/auth';
import { readAllRows, updateRow, deleteRow, appendRows } from '@/lib/google/moduleSheet';
import { logActivity } from '@/lib/activityLogger';
import { recordInventoryHistory } from '@/lib/inventoryHistory';

export const dynamic = 'force-dynamic';

const COL_R = {
  sno:                 0,
  invoiceNumber:       1,
  totalItems:          2,
  lastItems:           3,
  lastSizes:           4,
  newItems:            5,
  newSizes:            6,
  invoiceStatus:       7,
  disposition:         8,
  restockDestination:  9,
  createdAt:           10,
  createdBy:           11,
  updatedAt:           12,
  updatedBy:           13,
  version:             14,
};

const COL_S = {
  sno: 0, invoiceNumber: 1, saleStatus: 2, customerName: 3,
  totalItems: 6, itemNames: 7, sizes: 8, totalAmount: 9,
  deliveryStatus: 18, fulfilmentStatus: 21,
};

const COL_INV = { sno: 0, itemName: 1, size: 2, qty: 3, addedBy: 4, updatedAt: 5, updatedBy: 6, createdAt: 7 };
const COL_W   = { sno: 0, location: 1, handler: 2, itemName: 3, size: 4, qty: 5, createdBy: 6, createdAt: 7, updatedBy: 8, updatedAt: 9 };

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try { await requireAuth(); } catch (e) { if (e instanceof Response) return e; return Response.json({ error: 'Auth required.' }, { status: 401 }); }

  try {
    const [rRows, sRows, invRows, adminRows] = await Promise.all([
      readAllRows('replacement'),
      readAllRows('sales'),
      readAllRows('inventory'),
      readAllRows('admin_info'),
    ]);

    const idx = rRows.slice(1).findIndex((r) => r[COL_R.invoiceNumber] === id);
    if (idx === -1) return Response.json({ error: 'Replacement record not found.' }, { status: 404 });

    const r = rRows[idx + 1];

    // Find original sale details for order history view
    const saleRow = sRows.slice(1).find((s) => s[COL_S.invoiceNumber] === id);
    const saleDetails = saleRow ? {
      invoiceNumber:  saleRow[COL_S.invoiceNumber],
      customerName:   saleRow[COL_S.customerName],
      totalAmount:    saleRow[COL_S.totalAmount],
      itemNames:      saleRow[COL_S.itemNames],
      sizes:          saleRow[COL_S.sizes],
      saleStatus:     saleRow[COL_S.saleStatus],
      deliveryStatus: saleRow[COL_S.deliveryStatus],
    } : null;

    // Available inventory items for new item selection
    const availableInventory = invRows.slice(1).map((inv) => ({
      itemName: inv[COL_INV.itemName] ?? '',
      size:     inv[COL_INV.size] ?? '',
      qty:      parseInt(inv[COL_INV.qty] ?? '0', 10) || 0,
    })).filter((inv) => inv.itemName && inv.size && inv.qty > 0);

    const admins = adminRows.slice(1).map((a) => (a[1] ?? '').trim()).filter(Boolean);

    return Response.json({
      replacement: {
        rowIndex:           idx + 2,
        invoiceNumber:      r[COL_R.invoiceNumber],
        totalItems:         r[COL_R.totalItems],
        lastItems:          r[COL_R.lastItems],
        lastSizes:          r[COL_R.lastSizes],
        newItems:           r[COL_R.newItems],
        newSizes:           r[COL_R.newSizes],
        invoiceStatus:      r[COL_R.invoiceStatus],
        disposition:        r[COL_R.disposition] ?? '',
        restockDestination: r[COL_R.restockDestination] ?? '',
        createdAt:          r[COL_R.createdAt],
        createdBy:          r[COL_R.createdBy],
        version:            r[COL_R.version] || '1',
      },
      saleDetails,
      availableInventory,
      admins,
    });
  } catch (err) { return Response.json({ error: 'Failed to load replacement details.', detail: (err as Error).message }, { status: 500 }); }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let admin;
  try { admin = await requireAuth(); } catch (e) { if (e instanceof Response) return e; return Response.json({ error: 'Auth required.' }, { status: 401 }); }

  try {
    const body = await request.json();
    const {
      oldItemsToReplace, // array of { itemName, size, qty }
      newItemsChosen,    // array of { itemName, size, qty }
      disposition,       // 'Returned to Inventory' | 'Sent to Damaged Products'
      restockDestination,// 'Inventory Only' | handler admin name
      invoiceStatus,     // 'Replacement Approved' | 'Replacement Dispatched' | 'Replacement Received' | 'Satisfied / Completed Order'
      version,
    } = body;

    const [rRows, sRows, invRows, wRows, dmgRows] = await Promise.all([
      readAllRows('replacement'),
      readAllRows('sales'),
      readAllRows('inventory'),
      readAllRows('warehouse'),
      readAllRows('damaged_products'),
    ]);

    const idx = rRows.slice(1).findIndex((r) => r[COL_R.invoiceNumber] === id);
    if (idx === -1) return Response.json({ error: 'Replacement record not found.' }, { status: 404 });

    const row = rRows[idx + 1];
    const actualRowIndex = idx + 2;
    const currentVersion = parseInt(row[COL_R.version] || '1', 10);
    const clientVersion  = parseInt(version || '1', 10);

    if (version && clientVersion !== currentVersion) {
      return Response.json({ error: 'Conflict: record was updated by another admin. Reload and try again.', currentVersion }, { status: 409 });
    }

    const now = new Date().toISOString();
    const targetStatus = invoiceStatus || row[COL_R.invoiceStatus] || 'Replacement Approved';
    const isFirstApproval = row[COL_R.invoiceStatus] !== 'Replacement Approved' && targetStatus === 'Replacement Approved';
    const isStatusOnlyUpdate = !oldItemsToReplace && !newItemsChosen && targetStatus !== row[COL_R.invoiceStatus];

    // If configuring items & disposition
    if (oldItemsToReplace && newItemsChosen && disposition) {
      // 1. Process Old Items Disposition
      for (const oldItem of oldItemsToReplace) {
        if (disposition === 'Returned to Inventory') {
          // Add back to Inventory total
          const invIdx = invRows.slice(1).findIndex(
            (r) => r[COL_INV.itemName]?.toLowerCase() === oldItem.itemName.toLowerCase() && r[COL_INV.size] === oldItem.size
          );

          if (invIdx >= 0) {
            const invRow = invRows[invIdx + 1];
            const currentQty = parseInt(invRow[COL_INV.qty] ?? '0', 10) || 0;
            const newQty = currentQty + oldItem.qty;

            await updateRow('inventory', invIdx + 2, [
              invRow[COL_INV.sno], oldItem.itemName, oldItem.size, String(newQty),
              invRow[COL_INV.addedBy] ?? admin.name, now, admin.name, invRow[COL_INV.createdAt] ?? now,
            ]);

            await recordInventoryHistory({
              itemName: oldItem.itemName,
              size: oldItem.size,
              quantityChange: oldItem.qty,
              affectedSheet: 'Inventory',
              transactionType: 'Replacement — Old Item Restock',
              relatedInvoiceNumber: id,
              resultingBalance: newQty,
              createdBy: admin.name,
              notes: `Replacement old item restocked for invoice ${id}`,
            });
          }

          // If handler restock destination specified
          if (restockDestination && restockDestination !== 'Inventory Only') {
            const wIdx = wRows.slice(1).findIndex(
              (r) => (r[COL_W.handler] ?? '').trim() === restockDestination.trim() &&
                     (r[COL_W.itemName] ?? '').trim().toLowerCase() === oldItem.itemName.toLowerCase() &&
                     (r[COL_W.size] ?? '').trim() === oldItem.size
            );

            let newWQty = oldItem.qty;
            if (wIdx >= 0) {
              const wRow = wRows[wIdx + 1];
              const curWQty = parseInt(wRow[COL_W.qty] ?? '0', 10) || 0;
              newWQty = curWQty + oldItem.qty;

              await updateRow('warehouse', wIdx + 2, [
                wRow[COL_W.sno], wRow[COL_W.location], wRow[COL_W.handler], wRow[COL_W.itemName],
                wRow[COL_W.size], String(newWQty), wRow[COL_W.createdBy], wRow[COL_W.createdAt],
                admin.name, now,
              ]);
            }

            await recordInventoryHistory({
              itemName: oldItem.itemName,
              size: oldItem.size,
              quantityChange: oldItem.qty,
              affectedSheet: 'Warehouse',
              handler: restockDestination,
              transactionType: 'Replacement — Old Item Restock',
              relatedInvoiceNumber: id,
              resultingBalance: newWQty,
              createdBy: admin.name,
              notes: `Restocked to ${restockDestination}'s warehouse`,
            });
          }
        } else if (disposition === 'Sent to Damaged Products') {
          // Create entry in damaged_products sheet
          const saleRow = sRows.slice(1).find((s) => s[COL_S.invoiceNumber] === id);
          const custName = saleRow ? saleRow[COL_S.customerName] : '';
          const dmgSno = String(dmgRows.length + 1);

          await appendRows('damaged_products', [[
            dmgSno, id, oldItem.itemName, oldItem.size, String(oldItem.qty),
            custName, 'Logged via Replacement disposition', now, admin.name, now, admin.name,
          ]]);

          await recordInventoryHistory({
            itemName: oldItem.itemName,
            size: oldItem.size,
            quantityChange: -oldItem.qty,
            affectedSheet: 'Inventory',
            transactionType: 'Damaged Disposal',
            relatedInvoiceNumber: id,
            resultingBalance: 0,
            createdBy: admin.name,
            notes: `Sent to Damaged Products via Replacement disposition (${id})`,
          });
        }
      }

      // 2. Process New Items Deduction from Inventory
      for (const newItem of newItemsChosen) {
        const invIdx = invRows.slice(1).findIndex(
          (r) => r[COL_INV.itemName]?.toLowerCase() === newItem.itemName.toLowerCase() && r[COL_INV.size] === newItem.size
        );

        if (invIdx >= 0) {
          const invRow = invRows[invIdx + 1];
          const currentQty = parseInt(invRow[COL_INV.qty] ?? '0', 10) || 0;
          const newQty = Math.max(0, currentQty - newItem.qty);

          await updateRow('inventory', invIdx + 2, [
            invRow[COL_INV.sno], newItem.itemName, newItem.size, String(newQty),
            invRow[COL_INV.addedBy] ?? admin.name, now, admin.name, invRow[COL_INV.createdAt] ?? now,
          ]);

          await recordInventoryHistory({
            itemName: newItem.itemName,
            size: newItem.size,
            quantityChange: -newItem.qty,
            affectedSheet: 'Inventory',
            transactionType: 'Replacement — New Item Deduction',
            relatedInvoiceNumber: id,
            resultingBalance: newQty,
            createdBy: admin.name,
            notes: `New replacement item assigned for invoice ${id}`,
          });
        }
      }
    }

    // Build summaries for row update
    const lastItemsStr = oldItemsToReplace ? oldItemsToReplace.map((i: any) => i.itemName).join(', ') : row[COL_R.lastItems];
    const lastSizesStr = oldItemsToReplace ? oldItemsToReplace.map((i: any) => i.size).join(', ') : row[COL_R.lastSizes];
    const newItemsStr  = newItemsChosen ? newItemsChosen.map((i: any) => i.itemName).join(', ') : row[COL_R.newItems];
    const newSizesStr  = newItemsChosen ? newItemsChosen.map((i: any) => i.size).join(', ') : row[COL_R.newSizes];

    await updateRow('replacement', actualRowIndex, [
      row[COL_R.sno],
      id,
      String((oldItemsToReplace || []).length || row[COL_R.totalItems] || '1'),
      lastItemsStr,
      lastSizesStr,
      newItemsStr,
      newSizesStr,
      targetStatus,
      disposition || row[COL_R.disposition] || '',
      restockDestination || row[COL_R.restockDestination] || '',
      row[COL_R.createdAt],
      row[COL_R.createdBy],
      now,
      admin.name,
      String(currentVersion + 1),
    ]);

    // 3. Unlock Sales Record on reaching 'Satisfied / Completed Order'
    if (targetStatus === 'Satisfied / Completed Order') {
      const sIdx = sRows.slice(1).findIndex((s) => s[COL_S.invoiceNumber] === id);
      if (sIdx >= 0) {
        const sRow = [...sRows[sIdx + 1]];
        sRow[COL_S.fulfilmentStatus] = 'Normal';
        sRow[COL_S.deliveryStatus] = 'Order Delivered Successfully';
        sRow[COL_S.saleStatus] = 'Replacement Completed & Purchase Satisfied';

        await updateRow('sales', sIdx + 2, sRow);
      }
    }

    // 4. Activity Log sentence
    let activityText = '';
    if (isStatusOnlyUpdate) {
      activityText = `${admin.name} updated replacement ${id} to ${targetStatus}.`;
    } else {
      const dispText = disposition === 'Returned to Inventory'
        ? `restocked to ${restockDestination || 'Inventory Only'}`
        : 'sent to Damaged Products';
      activityText = `${admin.name} confirmed a replacement on ${id}: ${lastItemsStr} (${lastSizesStr}) → ${newItemsStr} (${newSizesStr}), old item ${dispText}.`;
    }

    await logActivity({
      adminName: admin.name,
      action: 'updated',
      module: 'Replacement Management',
      moduleKey: 'replacement',
      recordId: id,
    });

    return Response.json({
      success: true,
      version: String(currentVersion + 1),
      message: activityText,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return Response.json({ error: 'Failed to update replacement.', detail: message }, { status: 500 });
  }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let admin;
  try { admin = await requireAuth(); } catch (e) { if (e instanceof Response) return e; return Response.json({ error: 'Auth required.' }, { status: 401 }); }
  try {
    const rows = await readAllRows('replacement');
    const idx = rows.slice(1).findIndex((r) => r[COL_R.invoiceNumber] === id);
    if (idx === -1) return Response.json({ error: 'Replacement record not found.' }, { status: 404 });
    await deleteRow('replacement', idx + 2);
    await logActivity({ adminName: admin.name, action: 'deleted', module: 'Replacement Management', moduleKey: 'replacement', recordId: id });
    return Response.json({ success: true });
  } catch (err) { return Response.json({ error: 'Failed to delete replacement.', detail: (err as Error).message }, { status: 500 }); }
}
