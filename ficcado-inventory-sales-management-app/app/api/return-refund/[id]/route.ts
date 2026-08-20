import { requireAuth } from '@/lib/auth';
import { readAllRows, updateRow, deleteRow, appendRows } from '@/lib/google/moduleSheet';
import { buildHeaderMap, getCellByHeader, formatRowFromHeaderMap } from '@/lib/google/headerUtils';
import { calculateSaleTotalAmount } from '@/lib/salesPricing';
import { logActivity } from '@/lib/activityLogger';
import { recordInventoryHistory } from '@/lib/inventoryHistory';
import { recordSalesLog, formatPrice, formatStockLocation, groupItemLines, parseAndGroupCommaSeparatedItems, formatItemListWithSummary } from '@/lib/salesLogger';

export const dynamic = 'force-dynamic';

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try { await requireAuth(); } catch (e) { if (e instanceof Response) return e; return Response.json({ error: 'Auth required.' }, { status: 401 }); }

  try {
    const [retRows, sRows, adminRows, wRows] = await Promise.all([
      readAllRows('return_refund'),
      readAllRows('sales'),
      readAllRows('admin_info'),
      readAllRows('warehouse'),
    ]);

    if (retRows.length === 0) return Response.json({ error: 'Return/refund record not found.' }, { status: 404 });

    const retMap = buildHeaderMap(retRows[0]);
    const idx = retRows.slice(1).findIndex((r) => getCellByHeader(r, retMap, 'Invoice Number') === id);
    if (idx === -1) return Response.json({ error: 'Return/refund record not found.' }, { status: 404 });

    const r = retRows[idx + 1];

    let saleDetails = null;
    if (sRows.length > 0) {
      const sMap = buildHeaderMap(sRows[0]);
      const saleRow = sRows.slice(1).find((s) => getCellByHeader(s, sMap, 'Invoice Number') === id);
      if (saleRow) {
        saleDetails = {
          invoiceNumber:        getCellByHeader(saleRow, sMap, 'Invoice Number'),
          customerName:         getCellByHeader(saleRow, sMap, 'Customer Name'),
          customerPhone:        getCellByHeader(saleRow, sMap, 'Customer Phone Number'),
          customerAddress:      getCellByHeader(saleRow, sMap, 'Customer Address'),
          customerEmail:        getCellByHeader(saleRow, sMap, 'Customer Email'),
          itemNames:            getCellByHeader(saleRow, sMap, 'Item(s) Name(s)'),
          sizes:                getCellByHeader(saleRow, sMap, 'Size(s) Chosen'),
          totalItems:           getCellByHeader(saleRow, sMap, 'Total Number of Items Purchased'),
          itemPrices:           getCellByHeader(saleRow, sMap, 'Item Prices'),
          totalAmount:          getCellByHeader(saleRow, sMap, 'Total Amount'),
          discount:             parseFloat(getCellByHeader(saleRow, sMap, 'Discount', '0')) || 0,
          deliveryChargeToggle: getCellByHeader(saleRow, sMap, 'Delivery Charge Toggle') === 'true',
          deliveryChargeAmount: parseFloat(getCellByHeader(saleRow, sMap, 'Delivery Charge Amount', '0')) || 0,
          fulfilmentSource:     getCellByHeader(saleRow, sMap, 'Fulfilment Source'),
        };
      }
    }

    // Fallback to snapshot fields if Sales row is deleted or missing
    if (!saleDetails && getCellByHeader(r, retMap, 'Customer Name')) {
      const delivChg = parseFloat(getCellByHeader(r, retMap, 'Original Delivery Charge', '0')) || 0;
      saleDetails = {
        invoiceNumber:        id,
        customerName:         getCellByHeader(r, retMap, 'Customer Name'),
        customerPhone:        getCellByHeader(r, retMap, 'Customer Phone Number'),
        customerAddress:      getCellByHeader(r, retMap, 'Customer Address'),
        customerEmail:        getCellByHeader(r, retMap, 'Customer Email'),
        itemNames:            getCellByHeader(r, retMap, 'Original Purchased Items'),
        sizes:                getCellByHeader(r, retMap, 'Original Item Sizes'),
        totalItems:           getCellByHeader(r, retMap, 'Original Item Quantities'),
        itemPrices:           getCellByHeader(r, retMap, 'Original Item Prices'),
        totalAmount:          getCellByHeader(r, retMap, 'Original Total Amount'),
        discount:             parseFloat(getCellByHeader(r, retMap, 'Original Discount', '0')) || 0,
        deliveryChargeToggle: delivChg > 0,
        deliveryChargeAmount: delivChg,
        fulfilmentSource:     'Main Inventory',
      };
    }

    const allHandlersMap = new Map<string, string>();
    if (wRows.length > 0) {
      const wMap = buildHeaderMap(wRows[0]);
      wRows.slice(1).forEach((row) => {
        const handler = getCellByHeader(row, wMap, 'Handler Name').trim();
        if (handler && !allHandlersMap.has(handler.toLowerCase())) {
          allHandlersMap.set(handler.toLowerCase(), handler);
        }
      });
    }

    const registeredAdmins = adminRows.slice(1).map((a) => (a[1] ?? '').trim()).filter(Boolean);
    registeredAdmins.forEach((adm) => {
      if (!allHandlersMap.has(adm.toLowerCase())) {
        allHandlersMap.set(adm.toLowerCase(), adm);
      }
    });

    const handlersList = Array.from(allHandlersMap.values());

    const rawRef = getCellByHeader(r, retMap, 'Refund Amount');
    const priceChargedStr = getCellByHeader(r, retMap, 'Price Charged (Returned Items)');
    const refNum = parseFloat(rawRef.replace(/[^0-9.]/g, '')) || 0;
    let effectiveRefStr = rawRef;
    if (refNum === 0 && priceChargedStr) {
      const parts = priceChargedStr.split(',').map((p) => parseFloat(p.replace(/[^0-9.]/g, '')) || 0);
      const sum = parts.reduce((a, b) => a + b, 0);
      if (sum > 0) effectiveRefStr = String(sum);
    }

    return Response.json({
      record: {
        rowIndex:           idx + 2,
        invoiceNumber:      getCellByHeader(r, retMap, 'Invoice Number'),
        verificationStatus: getCellByHeader(r, retMap, 'Item Verification Status'),
        refundStatus:       getCellByHeader(r, retMap, 'Refund Status'),
        refundAmount:       effectiveRefStr,
        refundCompletedAt:  getCellByHeader(r, retMap, 'Refund Completed Date & Time'),
        transactionId:      getCellByHeader(r, retMap, 'Transaction ID'),
        modeOfRefund:       getCellByHeader(r, retMap, 'Mode of Refund'),
        disposition:        getCellByHeader(r, retMap, 'Disposition of Returned Items'),
        restockDestination: getCellByHeader(r, retMap, 'Restock Destination'),
        returnedItems:      getCellByHeader(r, retMap, 'Returned Item(s)'),
        returnedSizes:      getCellByHeader(r, retMap, 'Returned Item Size(s)'),
        returnedQty:        getCellByHeader(r, retMap, 'Returned Item Quantity(ies)'),
        priceCharged:       getCellByHeader(r, retMap, 'Price Charged (Returned Items)'),
        newFinalItems:      getCellByHeader(r, retMap, 'New Final Items Selected'),
        newFinalSizes:      getCellByHeader(r, retMap, 'New Final Items Sizes'),
        newFinalQty:        getCellByHeader(r, retMap, 'Number of New Final Items'),
        newFinalPrices:     getCellByHeader(r, retMap, 'New Final Items Prices Each'),
        newDiscountApplied: getCellByHeader(r, retMap, 'New Discount Applied', '0'),
        newFinalTotalAmt:   getCellByHeader(r, retMap, 'New Final Items Total Amount'),
        createdAt:          getCellByHeader(r, retMap, 'Created At'),
        createdBy:          getCellByHeader(r, retMap, 'Created By'),
        reasonForReturn:    getCellByHeader(r, retMap, 'Reason for Return', 'OTHER'),
        closedBy:           getCellByHeader(r, retMap, 'Closed By'),
        version:            getCellByHeader(r, retMap, 'Version', '1'),
      },
      saleDetails,
      admins: handlersList,
      handlers: handlersList,
    });

  } catch (err) { return Response.json({ error: 'Failed to load return/refund details.', detail: (err as Error).message }, { status: 500 }); }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let admin;
  try { admin = await requireAuth(); } catch (e) { if (e instanceof Response) return e; return Response.json({ error: 'Auth required.' }, { status: 401 }); }

  try {
    const body = await request.json();
    const {
      action,               // 'save_progress' | 'close_ticket'
      selectedReturnedItems,// array of { itemName, size, qty, unitPrice, verificationStatus, disposition, restockDestination }
      refundStatus,         // 'Approved' | 'Completed'
      refundAmount,
      modeOfRefund,         // 'Cash' | 'UPI' | 'Card' | 'Bank Transfer'
      transactionId,
      newDiscountApplied,   // numeric extra discount on remaining items
      reasonForReturn,
      version,
    } = body;

    const [retRows, sRows, invRows, wRows, dmgRows] = await Promise.all([
      readAllRows('return_refund'),
      readAllRows('sales'),
      readAllRows('inventory'),
      readAllRows('warehouse'),
      readAllRows('damaged_products'),
    ]);

    if (retRows.length === 0) return Response.json({ error: 'Return/refund record not found.' }, { status: 404 });

    const retMap = buildHeaderMap(retRows[0]);
    const sMap   = buildHeaderMap(sRows[0]);
    const invMap = buildHeaderMap(invRows[0]);
    const wMap   = buildHeaderMap(wRows[0]);
    const dmgMap = buildHeaderMap(dmgRows[0]);

    const idx = retRows.slice(1).findIndex((r) => getCellByHeader(r, retMap, 'Invoice Number') === id);
    if (idx === -1) return Response.json({ error: 'Return/refund record not found.' }, { status: 404 });

    const row = retRows[idx + 1];
    const actualRowIndex = idx + 2;
    const currentVersion = parseInt(getCellByHeader(row, retMap, 'Version', '1'), 10);
    const clientVersion  = parseInt(version || '1', 10);

    if (version && clientVersion !== currentVersion) {
      return Response.json({ error: 'Conflict: record was updated by another admin. Reload and try again.', currentVersion }, { status: 409 });
    }

    const now = new Date().toISOString();

    // ── Build Returned Items Strings & Remaining Items Calculation ────────────
    const returnedList: { itemName: string; size: string; qty: number; unitPrice: number; verificationStatus?: string; disposition?: string; restockDestination?: string }[] = selectedReturnedItems || [];
    
    const returnedItemsStr = returnedList.map((i) => i.itemName).join(', ');
    const returnedSizesStr = returnedList.map((i) => i.size).join(', ');
    const returnedQtyStr   = returnedList.map((i) => String(i.qty)).join(', ');
    const priceChargedStr  = returnedList.map((i) => String(i.unitPrice)).join(', ');

    const itemVerStatuses = Array.from(new Set(returnedList.map((i) => i.verificationStatus).filter(Boolean))).join(', ');
    const itemDispositions = Array.from(new Set(returnedList.map((i) => i.disposition).filter(Boolean))).join(', ');
    const itemRestockDests = Array.from(new Set(returnedList.map((i) => i.restockDestination).filter(Boolean))).join(', ');

    // Calculate remaining items based on original sale or snapshot
    const saleRow = sRows.slice(1).find((s) => getCellByHeader(s, sMap, 'Invoice Number') === id);
    const origItemNamesStr = saleRow ? getCellByHeader(saleRow, sMap, 'Item(s) Name(s)') : getCellByHeader(row, retMap, 'Original Purchased Items');
    const origSizesStr     = saleRow ? getCellByHeader(saleRow, sMap, 'Size(s) Chosen') : getCellByHeader(row, retMap, 'Original Item Sizes');
    const origPricesStr    = saleRow ? getCellByHeader(saleRow, sMap, 'Item Prices') : getCellByHeader(row, retMap, 'Original Item Prices');

    const origItemNamesArr = origItemNamesStr.split(',').map((s) => s.trim()).filter(Boolean);
    const origSizesArr     = origSizesStr.split(',').map((s) => s.trim()).filter(Boolean);
    const origPricesArr    = origPricesStr.split(',').map((s) => parseFloat(s.trim()) || 0);

    // Expand original basket
    const originalBasket: { itemName: string; size: string; unitPrice: number }[] = origItemNamesArr.map((name, i) => ({
      itemName: name,
      size: origSizesArr[i] || 'M',
      unitPrice: origPricesArr[i] ?? 0,
    }));

    // Subtract returned items to form remaining items basket
    const remainingBasket = [...originalBasket];
    for (const retItem of returnedList) {
      let toRemove = retItem.qty || 1;
      for (let rIdx = 0; rIdx < remainingBasket.length && toRemove > 0; rIdx++) {
        if (
          remainingBasket[rIdx].itemName.toLowerCase() === retItem.itemName.toLowerCase() &&
          remainingBasket[rIdx].size === retItem.size
        ) {
          remainingBasket.splice(rIdx, 1);
          rIdx--;
          toRemove--;
        }
      }
    }

    const isAllItemsReturn = remainingBasket.length === 0;
    const newFinalItemsStr  = remainingBasket.map((i) => i.itemName).join(', ');
    const newFinalSizesStr  = remainingBasket.map((i) => i.size).join(', ');
    const newFinalQtyStr    = remainingBasket.map((_) => '1').join(', ');
    const newFinalPricesStr = remainingBasket.map((i) => String(i.unitPrice)).join(', ');
    
    // Compute remaining items subtotal
    const remainingSubtotal = remainingBasket.reduce((sum, i) => sum + i.unitPrice, 0);
    const extraDiscountVal  = parseFloat(String(newDiscountApplied || 0)) || 0;

    const newFinalTotalCalc = calculateSaleTotalAmount({
      items: remainingSubtotal,
      discount: extraDiscountVal,
    });
    const newFinalTotalAmtStr = String(newFinalTotalCalc.grandTotal);

    const isCloseTicket = action === 'close_ticket';

    // ── Close Ticket Validation Gate ──────────────────────────────────────────
    if (isCloseTicket) {
      const missingFields: string[] = [];

      // Check 1: Every selected returned item has a non-null Item Verification Status
      if (returnedList.length === 0) {
        missingFields.push('No items selected for return.');
      } else {
        const unverified = returnedList.filter((i) => !i.verificationStatus);
        if (unverified.length > 0) {
          missingFields.push(`Item Verification Status missing for: ${unverified.map((i) => i.itemName).join(', ')}.`);
        }
      }

      // A3 Stricter Gate for All-Items Return: Payment proof required before closing
      if (isAllItemsReturn) {
        if (!refundStatus || (refundStatus !== 'Approved' && refundStatus !== 'Completed')) {
          missingFields.push('Refund Status must be set to "Approved" or "Completed" for all-items returns.');
        }
        const numericRefundAmt = parseFloat(String(refundAmount || 0));
        if (!numericRefundAmt || numericRefundAmt <= 0) {
          missingFields.push('Refund Amount details are required before closing an all-items return.');
        }
        if (!modeOfRefund) {
          missingFields.push('Refund Mode is required before closing an all-items return.');
        }
      } else {
        // Standard specific-item checks
        if (!refundStatus || (refundStatus !== 'Approved' && refundStatus !== 'Completed')) {
          missingFields.push('Refund Status must be set to "Approved" or "Completed".');
        }
        const numericRefundAmt = parseFloat(String(refundAmount || 0));
        if (!numericRefundAmt || numericRefundAmt <= 0) {
          missingFields.push('Refund Amount must be greater than zero.');
        }
        if (!modeOfRefund) {
          missingFields.push('Refund Mode is required.');
        }
      }

      if (missingFields.length > 0) {
        return Response.json({
          error: 'Cannot close ticket. Missing required information:',
          missingFields,
        }, { status: 400 });
      }

      // Execute inventory/warehouse restocks & damaged disposal on Close Ticket ONLY
      for (const item of returnedList) {
        if (item.verificationStatus === 'Damaged — Cannot Accept Return') {
          continue;
        }

        const disp = item.disposition || 'Returned to Inventory';
        const restockDest = item.restockDestination || 'Inventory Only';

        if (disp === 'Returned to Inventory') {
          const invIdx = invRows.slice(1).findIndex(
            (r) => getCellByHeader(r, invMap, 'Item Name').toLowerCase() === item.itemName.toLowerCase() && getCellByHeader(r, invMap, 'Size') === item.size
          );

          let newInvQty = item.qty;
          if (invIdx >= 0) {
            const invRow = invRows[invIdx + 1];
            const currentQty = parseInt(getCellByHeader(invRow, invMap, 'Total Quantity Available', '0'), 10) || 0;
            newInvQty = currentQty + item.qty;

            const invObj = {
              'S.No':                     getCellByHeader(invRow, invMap, 'S.No'),
              'Item Name':                 item.itemName,
              'Size':                      item.size,
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
              'Item Name':                 item.itemName,
              'Size':                      item.size,
              'Total Quantity Available': String(item.qty),
              'Added By (Admin)':          admin.name,
              'Updated At':                now,
              'Updated By (Admin)':        admin.name,
              'Created At':                now,
            };
            await appendRows('inventory', [formatRowFromHeaderMap(invObj, invRows[0])]);
          }

          await recordInventoryHistory({
            itemName: item.itemName,
            size: item.size,
            quantityChange: item.qty,
            affectedSheet: 'Inventory',
            transactionType: 'Refund Restock',
            relatedInvoiceNumber: id,
            resultingBalance: newInvQty,
            createdBy: admin.name,
            notes: `Returned item restocked for invoice ${id}`,
          });

          if (restockDest && restockDest !== 'Inventory Only') {
            const wIdx = wRows.slice(1).findIndex(
              (r) => getCellByHeader(r, wMap, 'Handler Name').trim().toLowerCase() === restockDest.trim().toLowerCase() &&
                     getCellByHeader(r, wMap, 'Item Name').trim().toLowerCase() === item.itemName.toLowerCase() &&
                     getCellByHeader(r, wMap, 'Size').trim() === item.size
            );

            let newWQty = item.qty;
            if (wIdx >= 0) {
              const wRow = wRows[wIdx + 1];
              const curWQty = parseInt(getCellByHeader(wRow, wMap, 'Quantity', '0'), 10) || 0;
              newWQty = curWQty + item.qty;

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
                'Handler Name':       restockDest.trim(),
                'Item Name':          item.itemName,
                'Size':               item.size,
                'Quantity':           String(item.qty),
                'Created By':         admin.name,
                'Created At':         now,
                'Updated By':         admin.name,
                'Updated At':         now,
              };
              await appendRows('warehouse', [formatRowFromHeaderMap(wObj, wRows[0])]);
            }

            await recordInventoryHistory({
              itemName: item.itemName,
              size: item.size,
              quantityChange: item.qty,
              affectedSheet: 'Warehouse',
              handler: restockDest,
              transactionType: 'Refund Restock',
              relatedInvoiceNumber: id,
              resultingBalance: newWQty,
              createdBy: admin.name,
              notes: `Restocked to ${restockDest}'s warehouse via refund`,
            });
          }
        } else if (disp === 'Sent to Damaged Products') {
          const custName = saleRow ? getCellByHeader(saleRow, sMap, 'Customer Name') : getCellByHeader(row, retMap, 'Customer Name');
          const dmgSno = String(dmgRows.length + 1);

          const dmgObj = {
            'S.No':           dmgSno,
            'Invoice Number': id,
            'Item Name':      item.itemName,
            'Size':           item.size,
            'Quantity':       String(item.qty),
            'Customer Name':  custName,
            'Reason/Notes':   'Logged via Return/Refund disposition',
            'Created At':     now,
            'Created By':     admin.name,
            'Updated At':     now,
            'Updated By':     admin.name,
          };
          await appendRows('damaged_products', [formatRowFromHeaderMap(dmgObj, dmgRows[0])]);

          await recordInventoryHistory({
            itemName: item.itemName,
            size: item.size,
            quantityChange: -item.qty,
            affectedSheet: 'Inventory',
            transactionType: 'Damaged Disposal',
            relatedInvoiceNumber: id,
            resultingBalance: 0,
            createdBy: admin.name,
            notes: `Sent to Damaged Products via Refund disposition (${id})`,
          });
        }
      }

      // Handle Sales Row: A2 Delete on All-Items Return vs. Unlock/Update on Specific-Item Return
      const sIdx = sRows.slice(1).findIndex((s) => getCellByHeader(s, sMap, 'Invoice Number') === id);
      if (sIdx >= 0) {
        const sRow = sRows[sIdx + 1];
        if (isAllItemsReturn) {
          // A2: Delete Sales row entirely from Sales Management
          const custName = getCellByHeader(sRow, sMap, 'Customer Name');
          const origCreatedAt = getCellByHeader(sRow, sMap, 'Created At');
          const origTotalAmt = getCellByHeader(sRow, sMap, 'Total Amount', '0');

          await deleteRow('sales', sIdx + 2);

          const deletedLogMsg = `Admin ${admin.name} deleted sale ${id} for customer ${custName} — originally created at ${origCreatedAt} with items ${origItemNamesStr} totaling ${formatPrice(origTotalAmt)}. This sale was removed because its linked Return/Refund ticket was closed and fully refunded. Deleted at ${now}.`;

          await recordSalesLog({
            module: 'Sales',
            operation: 'Delete',
            relatedInvoiceNumber: id,
            message: deletedLogMsg,
            adminName: admin.name,
          });
        } else {
          // Specific-Item Return: update Sales row and unlock
          const sObj: Record<string, string> = {};
          sRows[0].forEach((col, cIdx) => { sObj[col.trim()] = sRow[cIdx] ?? ''; });

          sObj['Item(s) Name(s)']                   = newFinalItemsStr;
          sObj['Size(s) Chosen']                    = newFinalSizesStr;
          sObj['Item Prices']                       = newFinalPricesStr;
          sObj['Total Amount']                      = newFinalTotalAmtStr;
          sObj['Total Number of Items Purchased']  = String(remainingBasket.length);
          sObj['Fulfilment Request Status']         = 'Normal';
          sObj['Sale Status']                       = 'Return/Refund on Specific Item(s)';
          sObj['Delivery Status']                   = 'Specific Item(s) Returning';
          sObj['Sale Closed By']                    = admin.name;

          await updateRow('sales', sIdx + 2, formatRowFromHeaderMap(sObj, sRows[0]));
        }
      }
    }

    // Save Return/Refund Row (for both Save Progress & Close Ticket)
    const finalRefundStatus = isCloseTicket ? 'Completed' : (refundStatus || getCellByHeader(row, retMap, 'Refund Status', 'Refund Pending'));
    const finalReason = reasonForReturn || getCellByHeader(row, retMap, 'Reason for Return', 'OTHER');
    const closedByVal = isCloseTicket ? admin.name : getCellByHeader(row, retMap, 'Closed By');

    const retObj: Record<string, string> = {
      'S.No':                           getCellByHeader(row, retMap, 'S.No'),
      'Invoice Number':                 id,
      'Item Verification Status':       itemVerStatuses || getCellByHeader(row, retMap, 'Item Verification Status', 'Good — Accepted for Return'),
      'Refund Status':                  finalRefundStatus,
      'Refund Amount':                  String(refundAmount ?? getCellByHeader(row, retMap, 'Refund Amount', '0')),
      'Refund Completed Date & Time':   isCloseTicket ? now : getCellByHeader(row, retMap, 'Refund Completed Date & Time'),
      'Transaction ID':                 transactionId || getCellByHeader(row, retMap, 'Transaction ID'),
      'Mode of Refund':                modeOfRefund || getCellByHeader(row, retMap, 'Mode of Refund', 'Cash'),
      'Disposition of Returned Items': itemDispositions || getCellByHeader(row, retMap, 'Disposition of Returned Items'),
      'Restock Destination':           itemRestockDests || getCellByHeader(row, retMap, 'Restock Destination'),
      'Returned Item(s)':               returnedItemsStr || getCellByHeader(row, retMap, 'Returned Item(s)'),
      'Returned Item Size(s)':          returnedSizesStr || getCellByHeader(row, retMap, 'Returned Item Size(s)'),
      'Returned Item Quantity(ies)':    returnedQtyStr || getCellByHeader(row, retMap, 'Returned Item Quantity(ies)'),
      'Price Charged (Returned Items)': priceChargedStr || getCellByHeader(row, retMap, 'Price Charged (Returned Items)'),
      'New Final Items Selected':       newFinalItemsStr || getCellByHeader(row, retMap, 'New Final Items Selected'),
      'New Final Items Sizes':          newFinalSizesStr || getCellByHeader(row, retMap, 'New Final Items Sizes'),
      'Number of New Final Items':       newFinalQtyStr || getCellByHeader(row, retMap, 'Number of New Final Items'),
      'New Final Items Prices Each':     newFinalPricesStr || getCellByHeader(row, retMap, 'New Final Items Prices Each'),
      'New Discount Applied':           String(extraDiscountVal),
      'New Final Items Total Amount':    newFinalTotalAmtStr || getCellByHeader(row, retMap, 'New Final Items Total Amount'),
      'Created At':                     getCellByHeader(row, retMap, 'Created At'),
      'Created By':                     getCellByHeader(row, retMap, 'Created By'),
      'Updated At':                     now,
      'Updated By':                     admin.name,
      'Version':                        String(currentVersion + 1),
      'Customer Name':                  getCellByHeader(row, retMap, 'Customer Name'),
      'Customer Phone Number':           getCellByHeader(row, retMap, 'Customer Phone Number'),
      'Customer Address':               getCellByHeader(row, retMap, 'Customer Address'),
      'Customer Email':                 getCellByHeader(row, retMap, 'Customer Email'),
      'Original Purchased Items':        origItemNamesStr,
      'Original Item Sizes':            origSizesStr,
      'Original Item Quantities':        getCellByHeader(row, retMap, 'Original Item Quantities'),
      'Original Item Prices':           origPricesStr,
      'Original Discount':              getCellByHeader(row, retMap, 'Original Discount', '0'),
      'Original Delivery Charge':        getCellByHeader(row, retMap, 'Original Delivery Charge', '0'),
      'Original Total Amount':           getCellByHeader(row, retMap, 'Original Total Amount', '0'),
      'Original Sale Created At':        getCellByHeader(row, retMap, 'Original Sale Created At'),
      'Original Sale Created By':        getCellByHeader(row, retMap, 'Original Sale Created By'),
      'Reason for Return':               finalReason,
      'Closed By':                        closedByVal,
    };

    await updateRow('return_refund', actualRowIndex, formatRowFromHeaderMap(retObj, retRows[0]));

    // Generate Sales Log entries for Return/Refund Progress Saved vs Return/Refund Closed
    const groupedReturned = groupItemLines(selectedReturnedItems);
    const { itemText: returnedItemSummary } = formatItemListWithSummary(groupedReturned, true);

    const groupedKept = groupItemLines(remainingBasket);
    const { itemText: keptItemSummary } = formatItemListWithSummary(groupedKept, true);

    if (isCloseTicket) {
      const modeText = modeOfRefund || 'Cash';
      const txText = modeText !== 'Cash' && transactionId ? `, transaction ID ${transactionId}` : '';
      const closedLogMsg = isAllItemsReturn
        ? `Admin ${admin.name} closed the Return/Refund ticket for invoice ${id}. All items (${returnedItemSummary}) were returned and refunded; this sale has been removed from Sales Management and now exists only in Return/Refund Management. A refund of ${formatPrice(refundAmount || 0)} was issued via ${modeText}${txText}. Closed at ${now}.`
        : `Admin ${admin.name} closed partial Return/Refund ticket for invoice ${id}. Returned item(s): ${returnedItemSummary} (${itemDispositions || 'Returned to Inventory'}); Kept item(s) remaining on order: ${keptItemSummary} with new final total amount ${formatPrice(newFinalTotalAmtStr)}. A refund of ${formatPrice(refundAmount || 0)} was issued via ${modeText}${txText}. Closed at ${now}.`;

      await recordSalesLog({
        module: 'Return/Refund',
        operation: 'Update',
        relatedInvoiceNumber: id,
        message: closedLogMsg,
        adminName: admin.name,
      });
    } else {
      const progressLogMsg = `Admin ${admin.name} saved progress on the Return/Refund for invoice ${id} (status remains ${finalRefundStatus}). Selected returned item(s): ${returnedItemSummary}; Item Verification Status set to ${itemVerStatuses || 'Pending'}; Disposition set to ${itemDispositions || 'N/A'}, restock destination ${itemRestockDests || 'N/A'}; Refund Mode set to ${modeOfRefund || 'Cash'}${transactionId ? `; Transaction ID recorded` : ''}. This save did not close the ticket — the transaction remains open. Saved at ${now}.`;

      await recordSalesLog({
        module: 'Return/Refund',
        operation: 'Update',
        relatedInvoiceNumber: id,
        message: progressLogMsg,
        adminName: admin.name,
      });
    }

    await logActivity({
      adminName: admin.name,
      action: 'updated',
      module: 'Return/Refund Management',
      moduleKey: 'return_refund',
      recordId: id,
    });

    return Response.json({
      success: true,
      completed: isCloseTicket,
      version: String(currentVersion + 1),
      message: isCloseTicket ? `Return/Refund ticket ${id} closed successfully.` : `Progress saved for ${id}.`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return Response.json({ error: 'Failed to update return/refund.', detail: message }, { status: 500 });
  }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let admin;
  try { admin = await requireAuth(); } catch (e) { if (e instanceof Response) return e; return Response.json({ error: 'Auth required.' }, { status: 401 }); }
  try {
    const [rows, sRows] = await Promise.all([
      readAllRows('return_refund'),
      readAllRows('sales'),
    ]);
    if (rows.length === 0) return Response.json({ error: 'Return/refund record not found.' }, { status: 404 });

    const retMap = buildHeaderMap(rows[0]);
    const idx = rows.slice(1).findIndex((r) => getCellByHeader(r, retMap, 'Invoice Number') === id);
    if (idx === -1) return Response.json({ error: 'Return/refund record not found.' }, { status: 404 });

    const r = rows[idx + 1];
    const origCreatedAt = getCellByHeader(r, retMap, 'Created At');

    const groupedRetItems = parseAndGroupCommaSeparatedItems(
      getCellByHeader(r, retMap, 'Returned Item(s)'),
      getCellByHeader(r, retMap, 'Returned Item Size(s)'),
      getCellByHeader(r, retMap, 'Price Charged (Returned Items)'),
      getCellByHeader(r, retMap, 'Returned Item Quantity(ies)')
    );
    const { itemText: retItemSummary } = formatItemListWithSummary(groupedRetItems, true);

    await deleteRow('return_refund', idx + 2);

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
    const deleteLogMsg = `Admin ${admin.name} deleted the Return/Refund record for invoice ${id}, originally created at ${origCreatedAt}, concerning item(s) ${retItemSummary}. Deleted at ${now}.`;

    await recordSalesLog({
      module: 'Return/Refund',
      operation: 'Delete',
      relatedInvoiceNumber: id,
      message: deleteLogMsg,
      adminName: admin.name,
    });

    await logActivity({ adminName: admin.name, action: 'deleted', module: 'Return/Refund Management', moduleKey: 'return_refund', recordId: id });
    return Response.json({ success: true, message: `Return/refund ticket for ${id} deleted.` });
  } catch (err) { return Response.json({ error: 'Failed to delete return/refund.', detail: (err as Error).message }, { status: 500 }); }
}
