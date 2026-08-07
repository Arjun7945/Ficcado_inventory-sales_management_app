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
  sno:                                   0,
  invoiceNumber:                         1,
  totalItems:                            2,
  lastItems:                             3,
  lastSizes:                             4,
  newItems:                              5,
  newSizes:                              6,
  invoiceStatus:                         7,
  disposition:                           8,
  restockDestination:                    9,
  removedItemFromLastPurchase:           10,
  sizesOfRemovedItemFromLastPurchase:    11,
  numberOfRemovedItemFromLastPurchase:   12,
  newFinalItemsSelected:                 13,
  newFinalItemsSizes:                    14,
  numberOfNewFinalItems:                 15,
  newFinalItemsPricesEach:               16,
  newFinalItemsTotalAmount:            17,
  newStockSource:                        18,
  createdAt:                             19,
  createdBy:                             20,
  updatedAt:                             21,
  updatedBy:                             22,
  version:                               23,
};

const COL_S = {
  sno: 0, invoiceNumber: 1, saleStatus: 2, customerName: 3,
  totalItems: 6, itemNames: 7, sizes: 8, totalAmount: 10,
  deliveryStatus: 19, fulfilmentStatus: 22, saleClosedBy: 24,
};

const COL_INV = { sno: 0, itemName: 1, size: 2, qty: 3, addedBy: 4, updatedAt: 5, updatedBy: 6, createdAt: 7 };
const COL_W   = { sno: 0, location: 1, handler: 2, itemName: 3, size: 4, qty: 5, createdBy: 6, createdAt: 7, updatedBy: 8, updatedAt: 9 };

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try { await requireAuth(); } catch (e) { if (e instanceof Response) return e; return Response.json({ error: 'Auth required.' }, { status: 401 }); }

  try {
    const [rRows, sRows, invRows, wRows, adminRows] = await Promise.all([
      readAllRows('replacement'),
      readAllRows('sales'),
      readAllRows('inventory'),
      readAllRows('warehouse'),
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

    const warehouseStock = wRows.slice(1).map((w) => ({
      handler:  (w[COL_W.handler] ?? '').trim(),
      location: (w[COL_W.location] ?? '').trim(),
      itemName: (w[COL_W.itemName] ?? '').trim(),
      size:     (w[COL_W.size] ?? '').trim(),
      qty:      parseInt(w[COL_W.qty] ?? '0', 10) || 0,
    })).filter((w) => w.handler && w.itemName && w.size && w.qty > 0);

    const admins = adminRows.slice(1).map((a) => (a[1] ?? '').trim()).filter(Boolean);

    return Response.json({
      replacement: {
        rowIndex:                            idx + 2,
        invoiceNumber:                       r[COL_R.invoiceNumber],
        totalItems:                          r[COL_R.totalItems],
        lastItems:                           r[COL_R.lastItems],
        lastSizes:                           r[COL_R.lastSizes],
        newItems:                            r[COL_R.newItems] ?? r[COL_R.newFinalItemsSelected] ?? '',
        newSizes:                            r[COL_R.newSizes] ?? r[COL_R.newFinalItemsSizes] ?? '',
        invoiceStatus:                       r[COL_R.invoiceStatus],
        disposition:                         r[COL_R.disposition] ?? '',
        restockDestination:                  r[COL_R.restockDestination] ?? '',
        removedItemFromLastPurchase:         r[COL_R.removedItemFromLastPurchase] ?? '',
        sizesOfRemovedItemFromLastPurchase:  r[COL_R.sizesOfRemovedItemFromLastPurchase] ?? '',
        numberOfRemovedItemFromLastPurchase: r[COL_R.numberOfRemovedItemFromLastPurchase] ?? '',
        newFinalItemsSelected:               r[COL_R.newFinalItemsSelected] ?? '',
        newFinalItemsSizes:                  r[COL_R.newFinalItemsSizes] ?? '',
        numberOfNewFinalItems:               r[COL_R.numberOfNewFinalItems] ?? '',
        newFinalItemsPricesEach:             r[COL_R.newFinalItemsPricesEach] ?? '',
        newFinalItemsTotalAmount:            r[COL_R.newFinalItemsTotalAmount] ?? '',
        newStockSource:                      r[COL_R.newStockSource] ?? 'Main Inventory',
        createdAt:                           r[COL_R.createdAt],
        createdBy:                           r[COL_R.createdBy],
        version:                             r[COL_R.version] || '1',
      },
      saleDetails,
      availableInventory,
      warehouseStock,
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
      newStockSource,    // 'Main Inventory' | handler admin name
      invoiceStatus,     // 'Replacement Approved' | ...
      version,
    } = body;

    const [rRows, sRows, invRows, wRows, dmgRows, itemRows] = await Promise.all([
      readAllRows('replacement'),
      readAllRows('sales'),
      readAllRows('inventory'),
      readAllRows('warehouse'),
      readAllRows('damaged_products'),
      readAllRows('items').catch(() => []),
    ]);

    const catalogPricesMap: Record<string, number> = {};
    if (itemRows && itemRows.length > 1) {
      itemRows.slice(1).forEach((r) => {
        const name = (r[1] ?? '').trim().toLowerCase();
        const price = parseFloat(r[3] ?? '0') || 0;
        if (name && price > 0) catalogPricesMap[name] = price;
      });
    }

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
    const isStatusOnlyUpdate = !oldItemsToReplace && !newItemsChosen && targetStatus !== row[COL_R.invoiceStatus];

    // Build summaries for row update & completion checks
    const origTotalItems = row[COL_R.totalItems] ?? '1';
    const origLastItems  = row[COL_R.lastItems]  ?? '';
    const origLastSizes  = row[COL_R.lastSizes]  ?? '';

    // Find original sale row details for computing retained items
    const saleRow = sRows.slice(1).find((s) => s[COL_S.invoiceNumber] === id);
    const origItemNamesArr  = saleRow ? (saleRow[COL_S.itemNames] ?? '').split(',').map((s) => s.trim()).filter(Boolean) : origLastItems.split(',').map((s) => s.trim()).filter(Boolean);
    const origSizesArr      = saleRow ? (saleRow[COL_S.sizes] ?? '').split(',').map((s) => s.trim()).filter(Boolean) : origLastSizes.split(',').map((s) => s.trim()).filter(Boolean);
    const origItemPricesArr = saleRow ? (saleRow[9] ?? '').split(',').map((s) => s.trim()).filter(Boolean) : [];

    // Build structured list of original items with catalog fallback
    const originalBasket: { itemName: string; size: string; unitPrice: number }[] = origItemNamesArr.map((name, i) => {
      const origPrice = parseFloat(origItemPricesArr[i]) || 0;
      const unitPrice = origPrice > 0 ? origPrice : (catalogPricesMap[name.toLowerCase()] || 0);
      return {
        itemName: name,
        size: origSizesArr[i] || 'M',
        unitPrice,
      };
    });

    // 1. Exchanged / Returned items summary
    const removedItemStr  = oldItemsToReplace ? oldItemsToReplace.map((i: any) => i.itemName).join(', ') : row[COL_R.removedItemFromLastPurchase] ?? '';
    const removedSizesStr = oldItemsToReplace ? oldItemsToReplace.map((i: any) => i.size).join(', ') : row[COL_R.sizesOfRemovedItemFromLastPurchase] ?? '';
    const removedQtyStr   = oldItemsToReplace ? oldItemsToReplace.map((i: any) => String(i.qty)).join(', ') : row[COL_R.numberOfRemovedItemFromLastPurchase] ?? '';

    // Newly issued items summary (col 5 & col 6)
    const newIssuedItemsStr = newItemsChosen ? newItemsChosen.map((i: any) => i.itemName).join(', ') : row[COL_R.newItems] ?? '';
    const newIssuedSizesStr = newItemsChosen ? newItemsChosen.map((i: any) => i.size).join(', ') : row[COL_R.newSizes] ?? '';

    // 2. Compute Retained Original Items (Original Basket MINUS Returned Items)
    const retainedBasket = [...originalBasket];
    if (oldItemsToReplace && Array.isArray(oldItemsToReplace)) {
      for (const oldItem of oldItemsToReplace) {
        let toRemove = oldItem.qty || 1;
        for (let idx = 0; idx < retainedBasket.length && toRemove > 0; idx++) {
          if (
            retainedBasket[idx].itemName.toLowerCase() === oldItem.itemName.toLowerCase() &&
            retainedBasket[idx].size === oldItem.size
          ) {
            retainedBasket.splice(idx, 1);
            idx--;
            toRemove--;
          }
        }
      }
    }

    // 3. Combine Retained Items + Issued Replacement Items = Final Basket
    const finalBasket: { itemName: string; size: string; qty: number; unitPrice: number }[] = [];
    
    // Add retained items to final basket
    retainedBasket.forEach((item) => {
      finalBasket.push({ itemName: item.itemName, size: item.size, qty: 1, unitPrice: item.unitPrice });
    });

    // Add newly issued replacement items to final basket
    if (newItemsChosen && Array.isArray(newItemsChosen)) {
      newItemsChosen.forEach((item: any) => {
        const q = parseInt(item.qty, 10) || 1;
        const p = parseFloat(item.unitPrice) || 0;
        const priceToUse = p > 0 ? p : (catalogPricesMap[item.itemName.toLowerCase()] || 0);
        for (let k = 0; k < q; k++) {
          finalBasket.push({
            itemName: item.itemName,
            size: item.size,
            qty: 1,
            unitPrice: priceToUse,
          });
        }
      });
    }

    // Compute final basket string representations
    const newFinalItemsStr  = finalBasket.length > 0 ? finalBasket.map((i) => i.itemName).join(', ') : (row[COL_R.newFinalItemsSelected] || newIssuedItemsStr);
    const newFinalSizesStr  = finalBasket.length > 0 ? finalBasket.map((i) => i.size).join(', ') : (row[COL_R.newFinalItemsSizes] || newIssuedSizesStr);
    const newFinalQtyStr    = finalBasket.length > 0 ? finalBasket.map((i) => String(i.qty)).join(', ') : (row[COL_R.numberOfNewFinalItems] || '1');
    const newFinalPricesStr = finalBasket.length > 0 ? finalBasket.map((i) => String(i.unitPrice)).join(', ') : (row[COL_R.newFinalItemsPricesEach] || '0');
    const newFinalTotalAmt  = finalBasket.length > 0 ? String(finalBasket.reduce((sum, i) => sum + i.unitPrice, 0)) : (row[COL_R.newFinalItemsTotalAmount] || '0');

    const sourceLocation = (newStockSource || row[COL_R.newStockSource] || 'Main Inventory').trim();

    const isCompletionRequest = body.action === 'complete' || targetStatus === 'Satisfied / Completed Order';

    // If completing the replacement, perform mandatory field checks & execute inventory stock transfers
    if (isCompletionRequest) {
      const checkRemovedItems = removedItemStr.trim();
      const checkRemovedSizes = removedSizesStr.trim();
      const checkNewItems     = newIssuedItemsStr.trim();
      const checkNewSizes     = newIssuedSizesStr.trim();
      const checkDisp         = (disposition || row[COL_R.disposition] || '').trim();
      const checkRestock      = (restockDestination || row[COL_R.restockDestination] || '').trim();

      if (!checkRemovedItems || !checkRemovedSizes || !checkNewItems || !checkNewSizes || !checkDisp || (checkDisp === 'Returned to Inventory' && !checkRestock)) {
        return Response.json({
          error: 'Cannot complete replacement: Please ensure Old Items to Exchange, New Item(s), New Size(s), Disposition, and Restock Destination are all selected before completing.'
        }, { status: 400 });
      }

      // Execute Stock Transfer & Deductions ONLY on Replacement Completion
      if (oldItemsToReplace && newItemsChosen && disposition) {
        const isWarehouseSource = sourceLocation !== 'Main Inventory' && sourceLocation !== 'Inventory Only';

        // 0. Stock availability check
        for (const newItem of newItemsChosen) {
          if (isWarehouseSource) {
            const matches = wRows.slice(1).filter(
              (r) => (r[COL_W.handler] ?? '').trim().toLowerCase() === sourceLocation.toLowerCase() &&
                     (r[COL_W.itemName] ?? '').trim().toLowerCase() === newItem.itemName.toLowerCase() &&
                     (r[COL_W.size] ?? '').trim() === newItem.size
            );
            const availQty = matches.reduce((sum, r) => sum + (parseInt(r[COL_W.qty] ?? '0', 10) || 0), 0);
            if (availQty < newItem.qty) {
              return Response.json({
                error: `Handler '${sourceLocation}' does not have sufficient stock for '${newItem.itemName} (Size ${newItem.size})' in their warehouse. Available: ${availQty} piece(s), Requested: ${newItem.qty}.`
              }, { status: 400 });
            }
          } else {
            const invMatch = invRows.slice(1).find(
              (r) => (r[COL_INV.itemName] ?? '').trim().toLowerCase() === newItem.itemName.toLowerCase() &&
                     (r[COL_INV.size] ?? '').trim() === newItem.size
            );
            const availQty = invMatch ? (parseInt(invMatch[COL_INV.qty] ?? '0', 10) || 0) : 0;
            if (availQty < newItem.qty) {
              return Response.json({
                error: `Main Inventory does not have sufficient stock for '${newItem.itemName} (Size ${newItem.size})'. Available: ${availQty} piece(s), Requested: ${newItem.qty}.`
              }, { status: 400 });
            }
          }
        }

        // 1. Process Old Items Restock / Disposal
        for (const oldItem of oldItemsToReplace) {
          if (disposition === 'Returned to Inventory') {
            const invIdx = invRows.slice(1).findIndex(
              (r) => r[COL_INV.itemName]?.toLowerCase() === oldItem.itemName.toLowerCase() && r[COL_INV.size] === oldItem.size
            );

            let newInvQty = oldItem.qty;
            if (invIdx >= 0) {
              const invRow = invRows[invIdx + 1];
              const currentQty = parseInt(invRow[COL_INV.qty] ?? '0', 10) || 0;
              newInvQty = currentQty + oldItem.qty;

              await updateRow('inventory', invIdx + 2, [
                invRow[COL_INV.sno], oldItem.itemName, oldItem.size, String(newInvQty),
                invRow[COL_INV.addedBy] ?? admin.name, now, admin.name, invRow[COL_INV.createdAt] ?? now,
              ]);
            } else {
              const nextInvSno = String(invRows.length);
              await appendRows('inventory', [[
                nextInvSno, oldItem.itemName, oldItem.size, String(oldItem.qty),
                admin.name, now, admin.name, now,
              ]]);
            }

            await recordInventoryHistory({
              itemName: oldItem.itemName,
              size: oldItem.size,
              quantityChange: oldItem.qty,
              affectedSheet: 'Inventory',
              transactionType: 'Replacement — Old Item Restock',
              relatedInvoiceNumber: id,
              resultingBalance: newInvQty,
              createdBy: admin.name,
              notes: `Replacement old item restocked for invoice ${id}`,
            });

            if (restockDestination && restockDestination !== 'Inventory Only') {
              const wIdx = wRows.slice(1).findIndex(
                (r) => (r[COL_W.handler] ?? '').trim().toLowerCase() === restockDestination.trim().toLowerCase() &&
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
              } else {
                const nextWSno = String(wRows.length);
                await appendRows('warehouse', [[
                  nextWSno, 'Main Restock Warehouse', restockDestination.trim(), oldItem.itemName,
                  oldItem.size, String(oldItem.qty), admin.name, now, admin.name, now,
                ]]);
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

        // 2. Process New Items Deduction
        for (const newItem of newItemsChosen) {
          if (isWarehouseSource) {
            const wIdx = wRows.slice(1).findIndex(
              (r) => (r[COL_W.handler] ?? '').trim().toLowerCase() === sourceLocation.toLowerCase() &&
                     (r[COL_W.itemName] ?? '').trim().toLowerCase() === newItem.itemName.toLowerCase() &&
                     (r[COL_W.size] ?? '').trim() === newItem.size
            );

            if (wIdx >= 0) {
              const wRow = wRows[wIdx + 1];
              const curWQty = parseInt(wRow[COL_W.qty] ?? '0', 10) || 0;
              const newWQty = Math.max(0, curWQty - newItem.qty);

              await updateRow('warehouse', wIdx + 2, [
                wRow[COL_W.sno], wRow[COL_W.location], wRow[COL_W.handler], wRow[COL_W.itemName],
                wRow[COL_W.size], String(newWQty), wRow[COL_W.createdBy], wRow[COL_W.createdAt],
                admin.name, now,
              ]);

              await recordInventoryHistory({
                itemName: newItem.itemName,
                size: newItem.size,
                quantityChange: -newItem.qty,
                affectedSheet: 'Warehouse',
                handler: sourceLocation,
                transactionType: 'Replacement — New Item Deduction',
                relatedInvoiceNumber: id,
                resultingBalance: newWQty,
                createdBy: admin.name,
                notes: `New replacement item deducted from ${sourceLocation}'s warehouse for invoice ${id}`,
              });
            }
          }

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

            if (!isWarehouseSource) {
              await recordInventoryHistory({
                itemName: newItem.itemName,
                size: newItem.size,
                quantityChange: -newItem.qty,
                affectedSheet: 'Inventory',
                transactionType: 'Replacement — New Item Deduction',
                relatedInvoiceNumber: id,
                resultingBalance: newQty,
                createdBy: admin.name,
                notes: `New replacement item assigned from Main Inventory for invoice ${id}`,
              });
            }
          }
        }
      }

      // 3. Complete replacement: unlock sales record with final basket & remove entry from replacement sheet
      const sIdx = sRows.slice(1).findIndex((s) => s[COL_S.invoiceNumber] === id);
      if (sIdx >= 0) {
        const sRow = [...sRows[sIdx + 1]];
        sRow[COL_S.itemNames] = newFinalItemsStr;
        sRow[COL_S.sizes] = newFinalSizesStr;
        sRow[9] = newFinalPricesStr; // itemPrices (Index 9)
        sRow[COL_S.totalAmount] = newFinalTotalAmt;
        sRow[COL_S.totalItems] = String(finalBasket.length);
        sRow[COL_S.fulfilmentStatus] = 'Normal';
        sRow[COL_S.deliveryStatus] = 'Order Delivered Successfully';
        sRow[COL_S.saleStatus] = 'Replacement Completed & Purchase Satisfied';
        sRow[COL_S.saleClosedBy] = admin.name;

        await updateRow('sales', sIdx + 2, sRow);
      }

      await deleteRow('replacement', actualRowIndex);
    } else {
      // DRAFT SAVE PROGRESS: Only update the replacement sheet row!
      await updateRow('replacement', actualRowIndex, [
        row[COL_R.sno],
        id,
        origTotalItems,
        origLastItems,
        origLastSizes,
        newIssuedItemsStr,
        newIssuedSizesStr,
        targetStatus,
        disposition || row[COL_R.disposition] || '',
        restockDestination || row[COL_R.restockDestination] || '',
        removedItemStr,
        removedSizesStr,
        removedQtyStr,
        newFinalItemsStr,
        newFinalSizesStr,
        newFinalQtyStr,
        newFinalPricesStr,
        newFinalTotalAmt,
        sourceLocation,
        row[COL_R.createdAt],
        row[COL_R.createdBy],
        now,
        admin.name,
        String(currentVersion + 1),
      ]);
    }

    // Activity Log sentence
    let activityText = '';
    if (isCompletionRequest) {
      activityText = `${admin.name} marked replacement ${id} as completed. Sale unlocked and replacement entry finalized.`;
    } else if (isStatusOnlyUpdate) {
      activityText = `${admin.name} updated replacement ${id} to ${targetStatus}.`;
    } else {
      const dispText = disposition === 'Returned to Inventory'
        ? `restocked to ${restockDestination || 'Inventory Only'}`
        : 'sent to Damaged Products';
      activityText = `${admin.name} updated replacement details on ${id}: ${removedItemStr} (${removedSizesStr}) → ${newFinalItemsStr} (${newFinalSizesStr}), old item ${dispText}.`;
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
      completed: isCompletionRequest,
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
    const [rows, sRows] = await Promise.all([
      readAllRows('replacement'),
      readAllRows('sales'),
    ]);
    const idx = rows.slice(1).findIndex((r) => r[COL_R.invoiceNumber] === id);
    if (idx === -1) return Response.json({ error: 'Replacement record not found.' }, { status: 404 });

    // 1. Delete replacement record
    await deleteRow('replacement', idx + 2);

    // 2. Unlock corresponding Sale record in sales sheet
    const sIdx = sRows.slice(1).findIndex((s) => s[COL_S.invoiceNumber] === id);
    if (sIdx >= 0) {
      const sRow = [...sRows[sIdx + 1]];
      sRow[COL_S.saleStatus]       = 'Purchase Satisfied & Order Completed';
      sRow[COL_S.deliveryStatus]   = 'Order Delivered Successfully';
      sRow[COL_S.fulfilmentStatus] = 'Normal';
      sRow[COL_S.saleClosedBy]     = admin.name;

      await updateRow('sales', sIdx + 2, sRow);
    }

    await logActivity({ adminName: admin.name, action: 'deleted', module: 'Replacement Management', moduleKey: 'replacement', recordId: id });
    return Response.json({ success: true, message: `Replacement for ${id} deleted and sale unlocked.` });
  } catch (err) { return Response.json({ error: 'Failed to delete replacement.', detail: (err as Error).message }, { status: 500 }); }
}
