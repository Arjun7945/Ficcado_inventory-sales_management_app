/**
 * app/api/return-refund/[id]/route.ts
 * GET, PUT, DELETE for a single return/refund record.
 * Handles Save Progress (writes to return_refund sheet only) vs Close Ticket (validation gate + stock updates + Sales unlocking).
 */

import { requireAuth } from '@/lib/auth';
import { readAllRows, updateRow, deleteRow, appendRows } from '@/lib/google/moduleSheet';
import { buildHeaderMap, getCellByHeader, formatRowFromHeaderMap } from '@/lib/google/headerUtils';
import { calculateSaleTotalAmount } from '@/lib/salesPricing';
import { logActivity } from '@/lib/activityLogger';
import { recordInventoryHistory } from '@/lib/inventoryHistory';

export const dynamic = 'force-dynamic';

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try { await requireAuth(); } catch (e) { if (e instanceof Response) return e; return Response.json({ error: 'Auth required.' }, { status: 401 }); }

  try {
    const [retRows, sRows, adminRows] = await Promise.all([
      readAllRows('return_refund'),
      readAllRows('sales'),
      readAllRows('admin_info'),
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

    const admins = adminRows.slice(1).map((a) => (a[1] ?? '').trim()).filter(Boolean);

    return Response.json({
      record: {
        rowIndex:           idx + 2,
        invoiceNumber:      getCellByHeader(r, retMap, 'Invoice Number'),
        verificationStatus: getCellByHeader(r, retMap, 'Item Verification Status'),
        refundStatus:       getCellByHeader(r, retMap, 'Refund Status'),
        refundAmount:       getCellByHeader(r, retMap, 'Refund Amount'),
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
        version:            getCellByHeader(r, retMap, 'Version', '1'),
      },
      saleDetails,
      admins,
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

    // Calculate remaining items based on original sale
    const saleRow = sRows.slice(1).find((s) => getCellByHeader(s, sMap, 'Invoice Number') === id);
    const origItemNamesArr  = saleRow ? getCellByHeader(saleRow, sMap, 'Item(s) Name(s)').split(',').map((s) => s.trim()).filter(Boolean) : [];
    const origSizesArr      = saleRow ? getCellByHeader(saleRow, sMap, 'Size(s) Chosen').split(',').map((s) => s.trim()).filter(Boolean) : [];
    const origPricesArr     = saleRow ? getCellByHeader(saleRow, sMap, 'Item Prices').split(',').map((s) => parseFloat(s.trim()) || 0) : [];
    const origTotalAmount   = saleRow ? parseFloat(getCellByHeader(saleRow, sMap, 'Total Amount', '0')) || 0 : 0;
    const origDiscount      = saleRow ? parseFloat(getCellByHeader(saleRow, sMap, 'Discount', '0')) || 0 : 0;

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

    const newFinalItemsStr  = remainingBasket.map((i) => i.itemName).join(', ');
    const newFinalSizesStr  = remainingBasket.map((i) => i.size).join(', ');
    const newFinalQtyStr    = remainingBasket.map((_) => '1').join(', ');
    const newFinalPricesStr = remainingBasket.map((i) => String(i.unitPrice)).join(', ');
    
    // Compute remaining items subtotal
    const remainingSubtotal = remainingBasket.reduce((sum, i) => sum + i.unitPrice, 0);
    const extraDiscountVal  = parseFloat(String(newDiscountApplied || 0)) || 0;

    // Use consolidated pricing calculation function from salesPricing.ts
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

      // Check 2: Refund Status is Approved or Completed
      if (!refundStatus || (refundStatus !== 'Approved' && refundStatus !== 'Completed')) {
        missingFields.push('Refund Status must be set to "Approved" or "Completed".');
      }

      // Check 3: Refund Amount is not zero
      const numericRefundAmt = parseFloat(String(refundAmount || 0));
      if (!numericRefundAmt || numericRefundAmt <= 0) {
        missingFields.push('Refund Amount must be greater than zero.');
      }

      // Check 4: Refund Mode is not null
      if (!modeOfRefund) {
        missingFields.push('Refund Mode is required.');
      }

      // Check 5: If Refund Mode is not Cash, Transaction ID is present
      if (modeOfRefund && modeOfRefund !== 'Cash' && (!transactionId || !transactionId.trim())) {
        missingFields.push('Transaction ID is required when Refund Mode is non-Cash (UPI, Card, Bank Transfer).');
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
          // Damaged — return not accepted into stock
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
          const custName = saleRow ? getCellByHeader(saleRow, sMap, 'Customer Name') : '';
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

      // Unlock Sales Record & update final remaining items
      const sIdx = sRows.slice(1).findIndex((s) => getCellByHeader(s, sMap, 'Invoice Number') === id);
      if (sIdx >= 0) {
        const sRow = sRows[sIdx + 1];
        const sObj: Record<string, string> = {};
        sRows[0].forEach((col, cIdx) => { sObj[col.trim()] = sRow[cIdx] ?? ''; });

        if (remainingBasket.length > 0) {
          sObj['Item(s) Name(s)']          = newFinalItemsStr;
          sObj['Size(s) Chosen']           = newFinalSizesStr;
          sObj['Item Prices']              = newFinalPricesStr;
          sObj['Total Amount']             = newFinalTotalAmtStr;
          sObj['Total Number of Items Purchased'] = String(remainingBasket.length);
        }

        sObj['Fulfilment Request Status'] = 'Normal';
        sObj['Sale Status']              = 'Return & Refund';
        sObj['Sale Closed By']           = admin.name;

        await updateRow('sales', sIdx + 2, formatRowFromHeaderMap(sObj, sRows[0]));
      }
    }

    // Save Return/Refund Row (for both Save Progress & Close Ticket)
    const finalRefundStatus = isCloseTicket ? 'Completed' : (refundStatus || getCellByHeader(row, retMap, 'Refund Status', 'Refund Pending'));

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
    };

    await updateRow('return_refund', actualRowIndex, formatRowFromHeaderMap(retObj, retRows[0]));

    const logActionText = isCloseTicket
      ? `${admin.name} closed return/refund ticket for ${id}. Sale unlocked and inventory updated.`
      : `${admin.name} saved return/refund progress for ${id}.`;

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
      message: logActionText,
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

    await logActivity({ adminName: admin.name, action: 'deleted', module: 'Return/Refund Management', moduleKey: 'return_refund', recordId: id });
    return Response.json({ success: true, message: `Return/refund ticket for ${id} deleted.` });
  } catch (err) { return Response.json({ error: 'Failed to delete return/refund.', detail: (err as Error).message }, { status: 500 }); }
}
