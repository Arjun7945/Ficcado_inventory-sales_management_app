/**
 * app/api/replacement/[id]/route.ts
 * GET, PUT, DELETE for a single replacement record.
 * Refactored with dynamic header-map lookups & writes across all sheets.
 * Updated with idempotent item calculation to prevent item duplication on Save Progress.
 */

import { requireAuth } from '@/lib/auth';
import { readAllRows, updateRow, deleteRow, appendRows } from '@/lib/google/moduleSheet';
import { buildHeaderMap, getCellByHeader, formatRowFromHeaderMap } from '@/lib/google/headerUtils';
import { calculateSaleTotalAmount } from '@/lib/salesPricing';
import { logActivity } from '@/lib/activityLogger';
import { recordInventoryHistory } from '@/lib/inventoryHistory';
import { recordSalesLog, formatPrice, formatStockLocation, parseAndGroupCommaSeparatedItems, formatItemListWithSummary } from '@/lib/salesLogger';

export const dynamic = 'force-dynamic';

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

    if (rRows.length === 0) return Response.json({ error: 'Replacement record not found.' }, { status: 404 });

    const rMap = buildHeaderMap(rRows[0]);
    const idx  = rRows.slice(1).findIndex((r) => getCellByHeader(r, rMap, 'Invoice Number') === id);
    if (idx === -1) return Response.json({ error: 'Replacement record not found.' }, { status: 404 });

    const r = rRows[idx + 1];

    let saleDetails = null;
    if (sRows.length > 0) {
      const sMap = buildHeaderMap(sRows[0]);
      const saleRow = sRows.slice(1).find((s) => getCellByHeader(s, sMap, 'Invoice Number') === id);
      if (saleRow) {
        saleDetails = {
          invoiceNumber:        getCellByHeader(saleRow, sMap, 'Invoice Number'),
          customerName:         getCellByHeader(saleRow, sMap, 'Customer Name'),
          totalAmount:          getCellByHeader(saleRow, sMap, 'Total Amount'),
          itemNames:            getCellByHeader(r, rMap, 'Last Purchased Item(s)') || getCellByHeader(saleRow, sMap, 'Item(s) Name(s)'),
          sizes:                getCellByHeader(r, rMap, 'Last Purchased Item(s) Size') || getCellByHeader(saleRow, sMap, 'Size(s) Chosen'),
          saleStatus:           getCellByHeader(saleRow, sMap, 'Sale Status'),
          deliveryStatus:       getCellByHeader(saleRow, sMap, 'Delivery Status'),
          discount:             parseFloat(getCellByHeader(saleRow, sMap, 'Discount', '0')) || 0,
          deliveryChargeToggle: getCellByHeader(saleRow, sMap, 'Delivery Charge Toggle') === 'true',
          deliveryChargeAmount: parseFloat(getCellByHeader(saleRow, sMap, 'Delivery Charge Amount', '0')) || 0,
        };
      }
    }

    const availableInventory: { itemName: string; size: string; qty: number }[] = [];
    if (invRows.length > 0) {
      const invMap = buildHeaderMap(invRows[0]);
      invRows.slice(1).forEach((row) => {
        const itemName = getCellByHeader(row, invMap, 'Item Name');
        const size     = getCellByHeader(row, invMap, 'Size');
        const qty      = parseInt(getCellByHeader(row, invMap, 'Total Quantity Available', '0'), 10) || 0;
        if (itemName && qty > 0) availableInventory.push({ itemName, size, qty });
      });
    }

    const warehouseStock: { handler: string; location: string; itemName: string; size: string; qty: number }[] = [];
    const allHandlersMap = new Map<string, string>();

    if (wRows.length > 0) {
      const wMap = buildHeaderMap(wRows[0]);
      wRows.slice(1).forEach((row) => {
        const handler  = getCellByHeader(row, wMap, 'Handler Name').trim();
        const location = getCellByHeader(row, wMap, 'Warehouse Location').trim();
        const itemName = getCellByHeader(row, wMap, 'Item Name').trim();
        const size     = getCellByHeader(row, wMap, 'Size').trim();
        const qty      = parseInt(getCellByHeader(row, wMap, 'Quantity', '0'), 10) || 0;
        if (handler) {
          if (!allHandlersMap.has(handler.toLowerCase())) {
            allHandlersMap.set(handler.toLowerCase(), handler);
          }
        }
        if (handler && itemName && qty > 0) warehouseStock.push({ handler, location, itemName, size, qty });
      });
    }

    const registeredAdmins = adminRows.slice(1).map((a) => (a[1] ?? '').trim()).filter(Boolean);
    registeredAdmins.forEach((adm) => {
      if (!allHandlersMap.has(adm.toLowerCase())) {
        allHandlersMap.set(adm.toLowerCase(), adm);
      }
    });

    const handlersList = Array.from(allHandlersMap.values());


    return Response.json({
      replacement: {
        rowIndex:                            idx + 2,
        invoiceNumber:                       getCellByHeader(r, rMap, 'Invoice Number'),
        totalItems:                          getCellByHeader(r, rMap, 'Total Number of Items Purchased'),
        lastItems:                           getCellByHeader(r, rMap, 'Last Purchased Item(s)'),
        lastSizes:                           getCellByHeader(r, rMap, 'Last Purchased Item(s) Size'),
        newItems:                            getCellByHeader(r, rMap, 'New Item(s)'),
        newSizes:                            getCellByHeader(r, rMap, 'New Item(s) Size') || getCellByHeader(r, rMap, 'New Final Items Sizes'),
        invoiceStatus:                       getCellByHeader(r, rMap, 'Invoice Status'),
        disposition:                         getCellByHeader(r, rMap, 'Disposition of Old Items'),
        restockDestination:                  getCellByHeader(r, rMap, 'Restock Destination'),
        removedItemFromLastPurchase:         getCellByHeader(r, rMap, 'Removed Item from Last Purchase'),
        sizesOfRemovedItemFromLastPurchase:  getCellByHeader(r, rMap, 'Sizes of Removed Item from Last Purchase'),
        numberOfRemovedItemFromLastPurchase: getCellByHeader(r, rMap, 'Number of Removed Item from Last Purchase'),
        newFinalItemsSelected:               getCellByHeader(r, rMap, 'New Final Items Selected'),
        newFinalItemsSizes:                  getCellByHeader(r, rMap, 'New Final Items Sizes'),
        numberOfNewFinalItems:               getCellByHeader(r, rMap, 'Number of New Final Items'),
        newFinalItemsPricesEach:             getCellByHeader(r, rMap, 'New Final Items Prices Each'),
        newFinalItemsTotalAmount:            getCellByHeader(r, rMap, 'New Final Items Total Amount'),
        newStockSource:                      getCellByHeader(r, rMap, 'New Stock Source', 'Main Inventory'),
        newDeliveryCharge:                   getCellByHeader(r, rMap, 'New Delivery Charge'),
        newDiscount:                         getCellByHeader(r, rMap, 'New Discount'),
        createdAt:                           getCellByHeader(r, rMap, 'Created At'),
        createdBy:                           getCellByHeader(r, rMap, 'Created By'),
        version:                             getCellByHeader(r, rMap, 'Version', '1'),
      },
      saleDetails,
      availableInventory,
      warehouseStock,
      admins: handlersList,
      handlers: handlersList,
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
      oldItemsToReplace,
      newItemsChosen,
      disposition,
      restockDestination,
      newStockSource,
      invoiceStatus,
      newDeliveryCharge,
      newDiscount,
      replaceDeliveryChargeToggle,
      replaceDiscountToggle,
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

    if (rRows.length === 0) return Response.json({ error: 'Replacement record not found.' }, { status: 404 });

    const rMap   = buildHeaderMap(rRows[0]);
    const sMap   = buildHeaderMap(sRows[0]);
    const invMap = buildHeaderMap(invRows[0]);
    const wMap   = buildHeaderMap(wRows[0]);
    const dmgMap = buildHeaderMap(dmgRows[0]);

    const idx = rRows.slice(1).findIndex((r) => getCellByHeader(r, rMap, 'Invoice Number') === id);
    if (idx === -1) return Response.json({ error: 'Replacement record not found.' }, { status: 404 });

    const row = rRows[idx + 1];
    const actualRowIndex = idx + 2;
    const currentVersion = parseInt(getCellByHeader(row, rMap, 'Version', '1'), 10);
    const clientVersion  = parseInt(version || '1', 10);

    if (version && clientVersion !== currentVersion) {
      return Response.json({
        error: 'Conflict: replacement was updated by another admin. Reload and try again.',
        currentVersion,
      }, { status: 409 });
    }

    const catalogPricesMap: Record<string, number> = {};
    if (itemRows.length > 1) {
      const itMap = buildHeaderMap(itemRows[0]);
      itemRows.slice(1).forEach((it) => {
        const name  = getCellByHeader(it, itMap, 'Item Name').toLowerCase().trim();
        const price = parseFloat(getCellByHeader(it, itMap, 'Price of Item', '0')) || 0;
        if (name && price > 0) catalogPricesMap[name] = price;
      });
    }

    const targetStatus = invoiceStatus || getCellByHeader(row, rMap, 'Invoice Status', 'Replacement Approved');
    const isStatusOnlyUpdate = !oldItemsToReplace && !newItemsChosen && !disposition && invoiceStatus;
    const now = new Date().toISOString();

    const origTotalItems = getCellByHeader(row, rMap, 'Total Number of Items Purchased');
    const origLastItems  = getCellByHeader(row, rMap, 'Last Purchased Item(s)');
    const origLastSizes  = getCellByHeader(row, rMap, 'Last Purchased Item(s) Size');

    const saleRow = sRows.slice(1).find((s) => getCellByHeader(s, sMap, 'Invoice Number') === id);

    // IMMUTABLE BASE PURCHASE ITEMS (Sourced directly from replacement sheet's Last Purchased Item(s))
    const origItemNamesArr  = origLastItems.split(',').map((s) => s.trim()).filter(Boolean);
    const origSizesArr      = origLastSizes.split(',').map((s) => s.trim()).filter(Boolean);
    const origItemPricesArr = saleRow ? getCellByHeader(saleRow, sMap, 'Item Prices').split(',').map((s) => s.trim()).filter(Boolean) : [];

    const origDiscount       = saleRow ? parseFloat(getCellByHeader(saleRow, sMap, 'Discount', '0')) || 0 : 0;
    const origDeliveryToggle = saleRow ? (getCellByHeader(saleRow, sMap, 'Delivery Charge Toggle') === 'true') : false;
    const origDeliveryAmt    = saleRow ? parseFloat(getCellByHeader(saleRow, sMap, 'Delivery Charge Amount', '0')) || 0 : 0;

    let effectiveDiscount = origDiscount;
    if (replaceDiscountToggle || (newDiscount !== undefined && newDiscount !== null && newDiscount !== '')) {
      effectiveDiscount = parseFloat(String(newDiscount || 0)) || 0;
    } else {
      const savedNewDisc = getCellByHeader(row, rMap, 'New Discount');
      if (savedNewDisc !== '') effectiveDiscount = parseFloat(savedNewDisc) || 0;
    }

    let effectiveDeliveryCharge = origDeliveryToggle ? origDeliveryAmt : 0;
    if (replaceDeliveryChargeToggle || (newDeliveryCharge !== undefined && newDeliveryCharge !== null && newDeliveryCharge !== '')) {
      effectiveDeliveryCharge = parseFloat(String(newDeliveryCharge || 0)) || 0;
    } else {
      const savedNewDel = getCellByHeader(row, rMap, 'New Delivery Charge');
      if (savedNewDel !== '') effectiveDeliveryCharge = parseFloat(savedNewDel) || 0;
    }

    const originalBasket = origItemNamesArr.map((name, i) => {
      const origPrice = parseFloat(origItemPricesArr[i]) || 0;
      const unitPrice = origPrice > 0 ? origPrice : (catalogPricesMap[name.toLowerCase()] || 0);
      return { itemName: name, size: origSizesArr[i] || 'M', unitPrice };
    });

    const removedItemStr  = oldItemsToReplace ? oldItemsToReplace.map((i: any) => i.itemName).join(', ') : getCellByHeader(row, rMap, 'Removed Item from Last Purchase');
    const removedSizesStr = oldItemsToReplace ? oldItemsToReplace.map((i: any) => i.size).join(', ') : getCellByHeader(row, rMap, 'Sizes of Removed Item from Last Purchase');
    const removedQtyStr   = oldItemsToReplace ? oldItemsToReplace.map((i: any) => String(i.qty)).join(', ') : getCellByHeader(row, rMap, 'Number of Removed Item from Last Purchase');

    const expandedNewItemsArr: string[] = [];
    const expandedNewSizesArr: string[] = [];
    if (newItemsChosen && Array.isArray(newItemsChosen)) {
      newItemsChosen.forEach((item: any) => {
        const q = parseInt(item.qty, 10) || 1;
        for (let k = 0; k < q; k++) {
          expandedNewItemsArr.push(item.itemName);
          expandedNewSizesArr.push(item.size);
        }
      });
    }

    const newIssuedItemsStr = expandedNewItemsArr.length > 0
      ? expandedNewItemsArr.join(', ')
      : getCellByHeader(row, rMap, 'New Item(s)');
    const newIssuedSizesStr = expandedNewSizesArr.length > 0
      ? expandedNewSizesArr.join(', ')
      : getCellByHeader(row, rMap, 'New Item(s) Size');

    const retainedBasket = [...originalBasket];
    if (oldItemsToReplace && Array.isArray(oldItemsToReplace)) {
      for (const oldItem of oldItemsToReplace) {
        let toRemove = oldItem.qty || 1;
        for (let rIdx = 0; rIdx < retainedBasket.length && toRemove > 0; rIdx++) {
          if (
            retainedBasket[rIdx].itemName.toLowerCase() === oldItem.itemName.toLowerCase() &&
            retainedBasket[rIdx].size === oldItem.size
          ) {
            retainedBasket.splice(rIdx, 1);
            rIdx--;
            toRemove--;
          }
        }
      }
    }

    const finalBasket: { itemName: string; size: string; qty: number; unitPrice: number }[] = [];
    retainedBasket.forEach((item) => {
      finalBasket.push({ itemName: item.itemName, size: item.size, qty: 1, unitPrice: item.unitPrice });
    });

    if (newItemsChosen && Array.isArray(newItemsChosen)) {
      newItemsChosen.forEach((item: any) => {
        const q = parseInt(item.qty, 10) || 1;
        const p = parseFloat(item.unitPrice) || 0;
        const priceToUse = p > 0 ? p : (catalogPricesMap[item.itemName.toLowerCase()] || 0);
        for (let k = 0; k < q; k++) {
          finalBasket.push({ itemName: item.itemName, size: item.size, qty: 1, unitPrice: priceToUse });
        }
      });
    }

    const newFinalItemsStr  = finalBasket.length > 0 ? finalBasket.map((i) => i.itemName).join(', ') : (getCellByHeader(row, rMap, 'New Final Items Selected') || newIssuedItemsStr);
    const newFinalSizesStr  = finalBasket.length > 0 ? finalBasket.map((i) => i.size).join(', ') : (getCellByHeader(row, rMap, 'New Final Items Sizes') || newIssuedSizesStr);
    const newFinalQtyStr    = finalBasket.length > 0 ? finalBasket.map((i) => String(i.qty)).join(', ') : (getCellByHeader(row, rMap, 'Number of New Final Items') || '1');
    const newFinalPricesStr = finalBasket.length > 0 ? finalBasket.map((i) => String(i.unitPrice)).join(', ') : (getCellByHeader(row, rMap, 'New Final Items Prices Each') || '0');

    // Consolidated pricing calculation via calculateSaleTotalAmount
    const basketSubtotal = finalBasket.reduce((sum, i) => sum + i.unitPrice, 0);
    const grandTotalCalc = calculateSaleTotalAmount({
      items: basketSubtotal,
      discount: effectiveDiscount,
      deliveryCharge: effectiveDeliveryCharge,
    });
    const newFinalTotalAmt = String(grandTotalCalc.grandTotal);

    const sourceLocation = (newStockSource || getCellByHeader(row, rMap, 'New Stock Source', 'Main Inventory')).trim();
    const isCompletionRequest = body.action === 'complete' || targetStatus === 'Satisfied / Completed Order';

    if (isCompletionRequest) {
      const checkRemovedItems = removedItemStr.trim();
      const checkRemovedSizes = removedSizesStr.trim();
      const checkNewItems     = newIssuedItemsStr.trim();
      const checkNewSizes     = newIssuedSizesStr.trim();
      const checkDisp         = (disposition || getCellByHeader(row, rMap, 'Disposition of Old Items')).trim();
      const checkRestock      = (restockDestination || getCellByHeader(row, rMap, 'Restock Destination')).trim();

      if (!checkRemovedItems || !checkRemovedSizes || !checkNewItems || !checkNewSizes || !checkDisp || (checkDisp === 'Returned to Inventory' && !checkRestock)) {
        return Response.json({
          error: 'Cannot complete replacement: Please ensure Old Items to Exchange, New Item(s), New Size(s), Disposition, and Restock Destination are all selected before completing.'
        }, { status: 400 });
      }

      if (oldItemsToReplace && newItemsChosen && disposition) {
        const isWarehouseSource = sourceLocation !== 'Main Inventory' && sourceLocation !== 'Inventory Only';

        // Restock old items
        for (const oldItem of oldItemsToReplace) {
          if (disposition === 'Returned to Inventory') {
            const invIdx = invRows.slice(1).findIndex(
              (r) => getCellByHeader(r, invMap, 'Item Name').toLowerCase() === oldItem.itemName.toLowerCase() && getCellByHeader(r, invMap, 'Size') === oldItem.size
            );

            let newInvQty = oldItem.qty;
            if (invIdx >= 0) {
              const invRow = invRows[invIdx + 1];
              const currentQty = parseInt(getCellByHeader(invRow, invMap, 'Total Quantity Available', '0'), 10) || 0;
              newInvQty = currentQty + oldItem.qty;

              const invObj = {
                'S.No':                     getCellByHeader(invRow, invMap, 'S.No'),
                'Item Name':                 oldItem.itemName,
                'Size':                      oldItem.size,
                'Total Quantity Available': String(newInvQty),
                'Added By (Admin)':          getCellByHeader(invRow, invMap, 'Added By (Admin)') || admin.name,
                'Updated At':                now,
                'Updated By (Admin)':        admin.name,
                'Created At':                getCellByHeader(invRow, invMap, 'Created At') || now,
              };
              await updateRow('inventory', invIdx + 2, formatRowFromHeaderMap(invObj, invRows[0]));
            } else {
              const nextInvSno = String(invRows.length);
              const invObj = {
                'S.No':                     nextInvSno,
                'Item Name':                 oldItem.itemName,
                'Size':                      oldItem.size,
                'Total Quantity Available': String(oldItem.qty),
                'Added By (Admin)':          admin.name,
                'Updated At':                now,
                'Updated By (Admin)':        admin.name,
                'Created At':                now,
              };
              await appendRows('inventory', [formatRowFromHeaderMap(invObj, invRows[0])]);
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
              notes: `Returned item restocked via replacement for invoice ${id}`,
            });

            if (restockDestination && restockDestination !== 'Inventory Only') {
              const wIdx = wRows.slice(1).findIndex(
                (r) => getCellByHeader(r, wMap, 'Handler Name').trim().toLowerCase() === restockDestination.trim().toLowerCase() &&
                       getCellByHeader(r, wMap, 'Item Name').trim().toLowerCase() === oldItem.itemName.toLowerCase() &&
                       getCellByHeader(r, wMap, 'Size').trim() === oldItem.size
              );

              let newWQty = oldItem.qty;
              if (wIdx >= 0) {
                const wRow = wRows[wIdx + 1];
                const curWQty = parseInt(getCellByHeader(wRow, wMap, 'Quantity', '0'), 10) || 0;
                newWQty = curWQty + oldItem.qty;

                const wObj = {
                  'S.No':               getCellByHeader(wRow, wMap, 'S.No'),
                  'Warehouse Location': getCellByHeader(wRow, wMap, 'Warehouse Location'),
                  'Handler Name':       getCellByHeader(wRow, wMap, 'Handler Name'),
                  'Item Name':          getCellByHeader(wRow, wMap, 'Item Name'),
                  'Size':               getCellByHeader(wRow, wMap, 'Size'),
                  'Quantity':           String(newWQty),
                  'Created By':         getCellByHeader(wRow, wMap, 'Created By'),
                  'Created At':         getCellByHeader(wRow, wMap, 'Created At'),
                  'Updated By':         admin.name,
                  'Updated At':         now,
                };
                await updateRow('warehouse', wIdx + 2, formatRowFromHeaderMap(wObj, wRows[0]));
              } else {
                const nextWSno = String(wRows.length);
                const wObj = {
                  'S.No':               nextWSno,
                  'Warehouse Location': 'Main Restock Warehouse',
                  'Handler Name':       restockDestination.trim(),
                  'Item Name':          oldItem.itemName,
                  'Size':               oldItem.size,
                  'Quantity':           String(oldItem.qty),
                  'Created By':         admin.name,
                  'Created At':         now,
                  'Updated By':         admin.name,
                  'Updated At':         now,
                };
                await appendRows('warehouse', [formatRowFromHeaderMap(wObj, wRows[0])]);
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
            const custName = saleRow ? getCellByHeader(saleRow, sMap, 'Customer Name') : '';
            const dmgSno = String(dmgRows.length + 1);

            const dmgObj = {
              'S.No':           dmgSno,
              'Invoice Number': id,
              'Item Name':      oldItem.itemName,
              'Size':           oldItem.size,
              'Quantity':       String(oldItem.qty),
              'Customer Name':  custName,
              'Reason/Notes':   'Logged via Replacement disposition',
              'Created At':     now,
              'Created By':     admin.name,
              'Updated At':     now,
              'Updated By':     admin.name,
            };
            await appendRows('damaged_products', [formatRowFromHeaderMap(dmgObj, dmgRows[0])]);

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

        // Deduct new items
        for (const newItem of newItemsChosen) {
          if (isWarehouseSource) {
            const wIdx = wRows.slice(1).findIndex(
              (r) => getCellByHeader(r, wMap, 'Handler Name').trim().toLowerCase() === sourceLocation.toLowerCase() &&
                     getCellByHeader(r, wMap, 'Item Name').trim().toLowerCase() === newItem.itemName.toLowerCase() &&
                     getCellByHeader(r, wMap, 'Size').trim() === newItem.size
            );

            if (wIdx >= 0) {
              const wRow = wRows[wIdx + 1];
              const curWQty = parseInt(getCellByHeader(wRow, wMap, 'Quantity', '0'), 10) || 0;
              const newWQty = Math.max(0, curWQty - newItem.qty);

              const wObj = {
                'S.No':               getCellByHeader(wRow, wMap, 'S.No'),
                'Warehouse Location': getCellByHeader(wRow, wMap, 'Warehouse Location'),
                'Handler Name':       getCellByHeader(wRow, wMap, 'Handler Name'),
                'Item Name':          getCellByHeader(wRow, wMap, 'Item Name'),
                'Size':               getCellByHeader(wRow, wMap, 'Size'),
                'Quantity':           String(newWQty),
                'Created By':         getCellByHeader(wRow, wMap, 'Created By'),
                'Created At':         getCellByHeader(wRow, wMap, 'Created At'),
                'Updated By':         admin.name,
                'Updated At':         now,
              };
              await updateRow('warehouse', wIdx + 2, formatRowFromHeaderMap(wObj, wRows[0]));

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
            (r) => getCellByHeader(r, invMap, 'Item Name').toLowerCase() === newItem.itemName.toLowerCase() && getCellByHeader(r, invMap, 'Size') === newItem.size
          );

          if (invIdx >= 0) {
            const invRow = invRows[invIdx + 1];
            const currentQty = parseInt(getCellByHeader(invRow, invMap, 'Total Quantity Available', '0'), 10) || 0;
            const newQty = Math.max(0, currentQty - newItem.qty);

            const invObj = {
              'S.No':                     getCellByHeader(invRow, invMap, 'S.No'),
              'Item Name':                 newItem.itemName,
              'Size':                      newItem.size,
              'Total Quantity Available': String(newQty),
              'Added By (Admin)':          getCellByHeader(invRow, invMap, 'Added By (Admin)') || admin.name,
              'Updated At':                now,
              'Updated By (Admin)':        admin.name,
              'Created At':                getCellByHeader(invRow, invMap, 'Created At') || now,
            };
            await updateRow('inventory', invIdx + 2, formatRowFromHeaderMap(invObj, invRows[0]));

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

      // Update Sales Record ONLY when completing replacement
      const sIdx = sRows.slice(1).findIndex((s) => getCellByHeader(s, sMap, 'Invoice Number') === id);
      if (sIdx >= 0) {
        const sRow = sRows[sIdx + 1];
        const sObj: Record<string, string> = {};
        sRows[0].forEach((col, cIdx) => { sObj[col.trim()] = sRow[cIdx] ?? ''; });

        sObj['Item(s) Name(s)']                 = newFinalItemsStr;
        sObj['Size(s) Chosen']                  = newFinalSizesStr;
        sObj['Item Prices']                     = newFinalPricesStr;
        sObj['Total Amount']                    = newFinalTotalAmt;
        sObj['Discount']                        = String(effectiveDiscount);
        sObj['Delivery Charge Amount']          = String(effectiveDeliveryCharge);
        sObj['Delivery Charge Toggle']          = effectiveDeliveryCharge > 0 ? 'true' : 'false';
        sObj['Total Number of Items Purchased'] = String(finalBasket.length);
        sObj['Fulfilment Request Status']     = 'Normal';
        sObj['Delivery Status']              = 'Order Delivered Successfully';
        sObj['Sale Status']                  = 'Replacement Completed & Purchase Satisfied';
        sObj['Sale Closed By']               = admin.name;

        await updateRow('sales', sIdx + 2, formatRowFromHeaderMap(sObj, sRows[0]));
      }

      await deleteRow('replacement', actualRowIndex);
    } else {
      // DRAFT SAVE PROGRESS: Update replacement row only (never mutates original sales row)
      const rObj: Record<string, string> = {
        'S.No':                                   getCellByHeader(row, rMap, 'S.No'),
        'Invoice Number':                         id,
        'Total Number of Items Purchased':        origTotalItems,
        'Last Purchased Item(s)':                 origLastItems,
        'Last Purchased Item(s) Size':            origLastSizes,
        'New Item(s)':                            newIssuedItemsStr,
        'New Item(s) Size':                       newIssuedSizesStr,
        'Invoice Status':                         targetStatus,
        'Disposition of Old Items':               disposition || getCellByHeader(row, rMap, 'Disposition of Old Items'),
        'Restock Destination':                    restockDestination || getCellByHeader(row, rMap, 'Restock Destination'),
        'Removed Item from Last Purchase':        removedItemStr,
        'Sizes of Removed Item from Last Purchase': removedSizesStr,
        'Number of Removed Item from Last Purchase': removedQtyStr,
        'New Final Items Selected':               newFinalItemsStr,
        'New Final Items Sizes':                  newFinalSizesStr,
        'Number of New Final Items':               newFinalQtyStr,
        'New Final Items Prices Each':             newFinalPricesStr,
        'New Final Items Total Amount':            newFinalTotalAmt,
        'New Stock Source':                      sourceLocation,
        'Created At':                             getCellByHeader(row, rMap, 'Created At'),
        'Created By':                             getCellByHeader(row, rMap, 'Created By'),
        'Updated At':                             now,
        'Updated By':                             admin.name,
        'Version':                                String(currentVersion + 1),
        'New Delivery Charge':                    String(effectiveDeliveryCharge),
        'New Discount':                           String(effectiveDiscount),
      };

      await updateRow('replacement', actualRowIndex, formatRowFromHeaderMap(rObj, rRows[0]));
    }

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

    if (isCompletionRequest) {
      const oldDispText = disposition === 'Returned to Inventory'
        ? `sent to ${formatStockLocation(restockDestination)}`
        : 'sent to Damaged Products';

      const groupedOldComp = parseAndGroupCommaSeparatedItems(removedItemStr, removedSizesStr, '', removedQtyStr);
      const { itemText: oldCompText } = formatItemListWithSummary(groupedOldComp, false);

      const groupedNewComp = parseAndGroupCommaSeparatedItems(newFinalItemsStr, newFinalSizesStr, newFinalPricesStr, newFinalQtyStr);
      const { itemText: newCompText } = formatItemListWithSummary(groupedNewComp, true);

      const compSalesLogMsg = `Admin ${admin.name} marked the replacement for invoice ${id} as completed. Old item(s) ${oldCompText} were ${oldDispText}. New item(s) ${newCompText} were dispatched from ${formatStockLocation(sourceLocation)}. Final delivery charge: ${formatPrice(effectiveDeliveryCharge)}; Final discount: ${formatPrice(effectiveDiscount)}. The linked sale's status and delivery status were updated accordingly. Completed at ${now}.`;

      await recordSalesLog({
        module: 'Replacement',
        operation: 'Update',
        relatedInvoiceNumber: id,
        message: compSalesLogMsg,
        adminName: admin.name,
      });
    } else {
      const groupedOldDraft = parseAndGroupCommaSeparatedItems(removedItemStr, removedSizesStr, '', removedQtyStr);
      const { itemText: oldDraftText } = formatItemListWithSummary(groupedOldDraft, false);

      const groupedNewDraft = parseAndGroupCommaSeparatedItems(newIssuedItemsStr, newIssuedSizesStr, '', '');
      const { itemText: newDraftText } = formatItemListWithSummary(groupedNewDraft, false);

      const draftSalesLogMsg = `Admin ${admin.name} saved progress on the replacement for invoice ${id} (status remains ${targetStatus}). Old item(s) selected for exchange: ${oldDraftText}; New replacement item(s): ${newDraftText}, sourced from ${formatStockLocation(sourceLocation)}; Item Disposition Path set to ${disposition || 'N/A'}, restock destination ${formatStockLocation(restockDestination)}; Delivery charge: ${formatPrice(effectiveDeliveryCharge)}; Discount: ${formatPrice(effectiveDiscount)}. This save did not complete the replacement — the transaction remains open. Saved at ${now}.`;

      await recordSalesLog({
        module: 'Replacement',
        operation: 'Update',
        relatedInvoiceNumber: id,
        message: draftSalesLogMsg,
        adminName: admin.name,
      });
    }

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
    const [rRows, sRows] = await Promise.all([
      readAllRows('replacement'),
      readAllRows('sales'),
    ]);

    if (rRows.length === 0) return Response.json({ error: 'Replacement record not found.' }, { status: 404 });

    const rMap = buildHeaderMap(rRows[0]);
    const idx  = rRows.slice(1).findIndex((r) => getCellByHeader(r, rMap, 'Invoice Number') === id);
    if (idx === -1) return Response.json({ error: 'Replacement record not found.' }, { status: 404 });

    const row = rRows[idx + 1];
    const origCreatedAt = getCellByHeader(row, rMap, 'Created At');
    const oldItemsStr = getCellByHeader(row, rMap, 'Last Purchased Item(s)');
    const oldSizesStr = getCellByHeader(row, rMap, 'Last Purchased Item(s) Size');
    const newItemsStr = getCellByHeader(row, rMap, 'New Item(s)');
    const newSizesStr = getCellByHeader(row, rMap, 'New Item(s) Size');

    const groupedOldDelete = parseAndGroupCommaSeparatedItems(oldItemsStr, oldSizesStr, '', '');
    const { itemText: oldDeleteText } = formatItemListWithSummary(groupedOldDelete, false);

    const groupedNewDelete = parseAndGroupCommaSeparatedItems(newItemsStr, newSizesStr, '', '');
    const { itemText: newDeleteText } = formatItemListWithSummary(groupedNewDelete, false);

    await deleteRow('replacement', idx + 2);

    if (sRows.length > 0) {
      const sMap = buildHeaderMap(sRows[0]);
      const sIdx = sRows.slice(1).findIndex((s) => getCellByHeader(s, sMap, 'Invoice Number') === id);
      if (sIdx >= 0) {
        const sRow = sRows[sIdx + 1];
        const sObj: Record<string, string> = {};
        sRows[0].forEach((col, cIdx) => { sObj[col.trim()] = sRow[cIdx] ?? ''; });

        sObj['Fulfilment Request Status'] = 'Normal';
        sObj['Sale Status']              = 'Purchase Satisfied & Order Completed';
        sObj['Sale Closed By']           = admin.name;

        await updateRow('sales', sIdx + 2, formatRowFromHeaderMap(sObj, sRows[0]));
      }
    }

    const now = new Date().toISOString();
    const deleteLogMsg = `Admin ${admin.name} deleted the replacement record for invoice ${id}, originally created at ${origCreatedAt}, which had old item(s) ${oldDeleteText} being replaced with ${newDeleteText}. Deleted at ${now}.`;

    await recordSalesLog({
      module: 'Replacement',
      operation: 'Delete',
      relatedInvoiceNumber: id,
      message: deleteLogMsg,
      adminName: admin.name,
    });

    await logActivity({
      adminName: admin.name,
      action: 'deleted',
      module: 'Replacement Management',
      moduleKey: 'replacement',
      recordId: id,
    });

    return Response.json({ success: true, message: `Replacement record for ${id} deleted.` });
  } catch (err) { return Response.json({ error: 'Failed to delete replacement.', detail: (err as Error).message }, { status: 500 }); }
}
