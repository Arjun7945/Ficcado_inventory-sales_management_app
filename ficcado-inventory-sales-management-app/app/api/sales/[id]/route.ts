/**
 * app/api/sales/[id]/route.ts
 *
 * GET    /api/sales/[id] — get single sale by invoice number or rowIndex
 * PUT    /api/sales/[id] — update sale (with Replace/Refund request locking and saleClosedBy tracking)
 * DELETE /api/sales/[id] — delete sale
 *
 * Updated with header mapping safety, "Return/Refund Requested" label update, and consolidated totalAmount calculation.
 */

import { requireAuth } from '@/lib/auth';
import { readAllRows, updateRow, deleteRow, appendRows } from '@/lib/google/moduleSheet';
import { buildHeaderMap, getCellByHeader, formatRowFromHeaderMap } from '@/lib/google/headerUtils';
import { calculateSaleTotalAmount } from '@/lib/salesPricing';
import { logActivity } from '@/lib/activityLogger';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth();
  } catch (authErr) {
    if (authErr instanceof Response) return authErr;
    return Response.json({ error: 'Authentication required.' }, { status: 401 });
  }

  try {
    const { id } = await params;
    const rows = await readAllRows('sales');
    if (rows.length === 0) return Response.json({ error: `Sale '${id}' not found.` }, { status: 404 });

    const headerMap = buildHeaderMap(rows[0]);
    const rowIndex = rows.slice(1).findIndex(
      (row) => getCellByHeader(row, headerMap, 'Invoice Number') === id || String(rows.indexOf(row) + 2) === id
    );

    if (rowIndex === -1) {
      return Response.json(
        { error: `Sale '${id}' not found. Check the invoice number.` },
        { status: 404 }
      );
    }

    const row = rows[rowIndex + 1];
    const sale = {
      rowIndex:             rowIndex + 2,
      invoiceNumber:        getCellByHeader(row, headerMap, 'Invoice Number'),
      saleStatus:           getCellByHeader(row, headerMap, 'Sale Status'),
      customerName:         getCellByHeader(row, headerMap, 'Customer Name'),
      customerPhone:        getCellByHeader(row, headerMap, 'Customer Phone Number'),
      customerAddress:      getCellByHeader(row, headerMap, 'Customer Address'),
      totalItems:           getCellByHeader(row, headerMap, 'Total Number of Items Purchased'),
      itemNames:            getCellByHeader(row, headerMap, 'Item(s) Name(s)'),
      sizes:                getCellByHeader(row, headerMap, 'Size(s) Chosen'),
      totalAmount:          getCellByHeader(row, headerMap, 'Total Amount'),
      paymentStatus:        getCellByHeader(row, headerMap, 'Payment Status'),
      modeOfPayment:        getCellByHeader(row, headerMap, 'Mode of Payment'),
      transactionId:        getCellByHeader(row, headerMap, 'Transaction ID'),
      createdAt:            getCellByHeader(row, headerMap, 'Created At'),
      createdBy:            getCellByHeader(row, headerMap, 'Created By (Admin)'),
      updatedAt:            getCellByHeader(row, headerMap, 'Updated At'),
      updatedBy:            getCellByHeader(row, headerMap, 'Updated By'),
      version:              getCellByHeader(row, headerMap, 'Version', '1'),
      deliveryStatus:       getCellByHeader(row, headerMap, 'Delivery Status', 'Packed & Ready for Shipment'),
      deliveryChargeToggle: getCellByHeader(row, headerMap, 'Delivery Charge Toggle') === 'true',
      deliveryChargeAmount: parseFloat(getCellByHeader(row, headerMap, 'Delivery Charge Amount', '0')) || 0,
      fulfilmentStatus:     getCellByHeader(row, headerMap, 'Fulfilment Request Status', 'Normal'),
      fulfilmentSource:     getCellByHeader(row, headerMap, 'Fulfilment Source', 'Take from Inventory'),
      saleClosedBy:         getCellByHeader(row, headerMap, 'Sale Closed By'),
      discount:             parseFloat(getCellByHeader(row, headerMap, 'Discount', '0')) || 0,
      customerEmail:        getCellByHeader(row, headerMap, 'Customer Email'),
      itemPrices:           getCellByHeader(row, headerMap, 'Item Prices'),
    };

    return Response.json({ sale });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return Response.json({ error: "Couldn't load sale.", detail: message }, { status: 500 });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  let admin;
  try {
    admin = await requireAuth();
  } catch (authErr) {
    if (authErr instanceof Response) return authErr;
    return Response.json({ error: 'Authentication required.' }, { status: 401 });
  }

  try {
    const { id } = await params;
    const body = await request.json();
    const { requestAction, version: clientVersion, rowIndex, ...updates } = body;

    const rows = await readAllRows('sales');
    if (rows.length === 0) return Response.json({ error: `Sale '${id}' not found.` }, { status: 404 });

    const headerMap = buildHeaderMap(rows[0]);
    const foundIndex = rows.slice(1).findIndex((row) => getCellByHeader(row, headerMap, 'Invoice Number') === id);

    if (foundIndex === -1) {
      return Response.json({ error: `Sale '${id}' not found.` }, { status: 404 });
    }

    const actualRowIndex = foundIndex + 2;
    const row = rows[foundIndex + 1];
    const currentFulfilmentStatus = getCellByHeader(row, headerMap, 'Fulfilment Request Status', 'Normal');

    // Handle Replace Requested action
    if (requestAction === 'replace_requested') {
      if (currentFulfilmentStatus !== 'Normal') {
        return Response.json(
          { error: `Sale ${id} is already locked under ${currentFulfilmentStatus}.` },
          { status: 400 }
        );
      }

      const now = new Date().toISOString();
      const currentVer = parseInt(getCellByHeader(row, headerMap, 'Version', '1'), 10);
      const newVersion = String(currentVer + 1);

      const sObj: Record<string, string> = {};
      rows[0].forEach((col, cIdx) => { sObj[col.trim()] = row[cIdx] ?? ''; });

      sObj['Fulfilment Request Status'] = 'Replace-Requested';
      sObj['Updated At']                = now;
      sObj['Updated By']                = admin.name;
      sObj['Version']                   = newVersion;

      await updateRow('sales', actualRowIndex, formatRowFromHeaderMap(sObj, rows[0]));

      const replRows = await readAllRows('replacement');
      const replHeaderRow = replRows[0] || [];
      const replSno = String(replRows.length);

      const replObj: Record<string, string> = {
        'S.No': replSno,
        'Invoice Number': id,
        'Total Number of Items Purchased': getCellByHeader(row, headerMap, 'Total Number of Items Purchased', '1'),
        'Last Purchased Item(s)': getCellByHeader(row, headerMap, 'Item(s) Name(s)'),
        'Last Purchased Item(s) Size': getCellByHeader(row, headerMap, 'Size(s) Chosen'),
        'Invoice Status': 'Replacement Approved',
        'Created At': now,
        'Created By': admin.name,
        'Updated At': now,
        'Updated By': admin.name,
        'Version': '1',
      };

      await appendRows('replacement', [formatRowFromHeaderMap(replObj, replHeaderRow)]);

      const logMsg = `${admin.name} marked sale ${id} as Replace Requested — moved to Replacement Management.`;
      await logActivity({
        adminName: admin.name,
        action: 'updated',
        module: 'Sales Management',
        moduleKey: 'sales',
        recordId: id,
      });

      return Response.json({
        success: true,
        message: logMsg,
        fulfilmentStatus: 'Replace-Requested',
      });
    }

    // Handle Return/Refund Requested action (A1 label update: Return/Refund Requested)
    if (requestAction === 'refund_requested' || requestAction === 'return_refund_requested') {
      if (currentFulfilmentStatus !== 'Normal') {
        return Response.json(
          { error: `Sale ${id} is already locked under ${currentFulfilmentStatus}.` },
          { status: 400 }
        );
      }

      const now = new Date().toISOString();
      const currentVer = parseInt(getCellByHeader(row, headerMap, 'Version', '1'), 10);
      const newVersion = String(currentVer + 1);

      const sObj: Record<string, string> = {};
      rows[0].forEach((col, cIdx) => { sObj[col.trim()] = row[cIdx] ?? ''; });

      sObj['Fulfilment Request Status'] = 'Refund-Requested';
      sObj['Updated At']                = now;
      sObj['Updated By']                = admin.name;
      sObj['Version']                   = newVersion;

      await updateRow('sales', actualRowIndex, formatRowFromHeaderMap(sObj, rows[0]));

      const retRows = await readAllRows('return_refund');
      const retHeaderRow = retRows[0] || [];
      const retSno = String(retRows.length);

      const retObj: Record<string, string> = {
        'S.No': retSno,
        'Invoice Number': id,
        'Item Verification Status': 'Not Received — In Transit',
        'Refund Status': 'Refund Pending',
        'Refund Amount': getCellByHeader(row, headerMap, 'Total Amount', '0'),
        'Transaction ID': getCellByHeader(row, headerMap, 'Transaction ID'),
        'Mode of Refund': getCellByHeader(row, headerMap, 'Mode of Payment', 'Cash'),
        'Created At': now,
        'Created By': admin.name,
        'Updated At': now,
        'Updated By': admin.name,
        'Version': '1',
      };

      await appendRows('return_refund', [formatRowFromHeaderMap(retObj, retHeaderRow)]);

      const logMsg = `${admin.name} marked sale ${id} as Return/Refund Requested — moved to Return/Refund Management.`;
      await logActivity({
        adminName: admin.name,
        action: 'updated',
        module: 'Sales Management',
        moduleKey: 'sales',
        recordId: id,
      });

      return Response.json({
        success: true,
        message: logMsg,
        fulfilmentStatus: 'Refund-Requested',
      });
    }

    // Normal Edit check
    if (currentFulfilmentStatus !== 'Normal') {
      const sectionName = currentFulfilmentStatus === 'Replace-Requested' ? 'Replacement Management' : 'Return / Refund Management';
      return Response.json(
        {
          error: `Sale ${id} is currently locked (${currentFulfilmentStatus}). You cannot edit basic sale details directly. Please manage it in the ${sectionName} module.`,
          locked: true,
          fulfilmentStatus: currentFulfilmentStatus,
        },
        { status: 403 }
      );
    }

    // Optimistic lock check
    const serverVersion = getCellByHeader(row, headerMap, 'Version', '1');
    if (clientVersion && String(clientVersion) !== String(serverVersion)) {
      return Response.json(
        {
          error: `This sale was updated by ${getCellByHeader(row, headerMap, 'Updated By')} at ${getCellByHeader(row, headerMap, 'Updated At')} — reload to see the changes before saving yours.`,
          type: 'conflict',
          updatedBy: getCellByHeader(row, headerMap, 'Updated By'),
          updatedAt: getCellByHeader(row, headerMap, 'Updated At'),
        },
        { status: 409 }
      );
    }

    const now = new Date().toISOString();
    const newVersion = String(parseInt(serverVersion, 10) + 1);

    const nextPaymentStatus  = updates.paymentStatus  ?? getCellByHeader(row, headerMap, 'Payment Status');
    const nextDeliveryStatus = updates.deliveryStatus ?? getCellByHeader(row, headerMap, 'Delivery Status');
    const nextSaleStatus     = updates.saleStatus     ?? getCellByHeader(row, headerMap, 'Sale Status');

    const isCompletedNow = (nextPaymentStatus === 'Paid' && nextDeliveryStatus === 'Order Delivered Successfully') ||
                           (nextSaleStatus && nextSaleStatus.includes('Purchase Satisfied'));

    let saleClosedByVal = getCellByHeader(row, headerMap, 'Sale Closed By');
    if (isCompletedNow) {
      saleClosedByVal = admin.name;
    } else if (nextPaymentStatus !== 'Paid') {
      saleClosedByVal = '';
    }

    // A3 Fix: Recalculate totalAmount using consolidated pricing helper whenever amount-affecting fields are sent
    const itemPricesArr = (updates.itemPrices ?? getCellByHeader(row, headerMap, 'Item Prices')).split(',').map((p: string) => parseFloat(p.trim()) || 0);
    const rawSubtotal = itemPricesArr.reduce((sum: number, p: number) => sum + p, 0);

    const delivToggle = updates.deliveryChargeToggle !== undefined
      ? Boolean(updates.deliveryChargeToggle)
      : (getCellByHeader(row, headerMap, 'Delivery Charge Toggle') === 'true');
    const delivAmount = updates.deliveryChargeAmount !== undefined
      ? parseFloat(String(updates.deliveryChargeAmount)) || 0
      : (parseFloat(getCellByHeader(row, headerMap, 'Delivery Charge Amount', '0')) || 0);
    const discountVal = updates.discount !== undefined
      ? parseFloat(String(updates.discount)) || 0
      : (parseFloat(getCellByHeader(row, headerMap, 'Discount', '0')) || 0);

    // If frontend passed an explicit totalAmount, or we calculate it from subtotal/discount/deliveryCharge
    const calculatedPricing = calculateSaleTotalAmount({
      items: rawSubtotal > 0 ? rawSubtotal : parseFloat(getCellByHeader(row, headerMap, 'Total Amount', '0')) || 0,
      discount: discountVal,
      deliveryChargeToggle: delivToggle,
      deliveryChargeAmount: delivAmount,
    });

    const finalTotalAmount = updates.totalAmount !== undefined
      ? String(updates.totalAmount)
      : String(calculatedPricing.grandTotal);

    const sObj: Record<string, string> = {
      'S.No':                            getCellByHeader(row, headerMap, 'S.No'),
      'Invoice Number':                  getCellByHeader(row, headerMap, 'Invoice Number'),
      'Sale Status':                     nextSaleStatus,
      'Customer Name':                   updates.customerName    ?? getCellByHeader(row, headerMap, 'Customer Name'),
      'Customer Phone Number':           updates.customerPhone   ?? getCellByHeader(row, headerMap, 'Customer Phone Number'),
      'Customer Address':                updates.customerAddress ?? getCellByHeader(row, headerMap, 'Customer Address'),
      'Total Number of Items Purchased': updates.totalItems      ?? getCellByHeader(row, headerMap, 'Total Number of Items Purchased'),
      'Item(s) Name(s)':                 Array.isArray(updates.itemNames) ? updates.itemNames.join(', ') : (updates.itemNames ?? getCellByHeader(row, headerMap, 'Item(s) Name(s)')),
      'Size(s) Chosen':                  Array.isArray(updates.sizes)     ? updates.sizes.join(', ')     : (updates.sizes     ?? getCellByHeader(row, headerMap, 'Size(s) Chosen')),
      'Item Prices':                     updates.itemPrices      ?? getCellByHeader(row, headerMap, 'Item Prices'),
      'Total Amount':                    finalTotalAmount,
      'Payment Status':                  nextPaymentStatus,
      'Mode of Payment':                 updates.modeOfPayment   ?? getCellByHeader(row, headerMap, 'Mode of Payment'),
      'Transaction ID':                  updates.transactionId   ?? getCellByHeader(row, headerMap, 'Transaction ID'),
      'Created At':                      getCellByHeader(row, headerMap, 'Created At'),
      'Created By (Admin)':              getCellByHeader(row, headerMap, 'Created By (Admin)'),
      'Updated At':                      now,
      'Updated By':                      admin.name,
      'Version':                         newVersion,
      'Delivery Status':                 nextDeliveryStatus,
      'Delivery Charge Toggle':          String(delivToggle),
      'Delivery Charge Amount':          String(delivAmount),
      'Fulfilment Request Status':       getCellByHeader(row, headerMap, 'Fulfilment Request Status', 'Normal'),
      'Fulfilment Source':               updates.fulfilmentSource ?? getCellByHeader(row, headerMap, 'Fulfilment Source', 'Take from Inventory'),
      'Sale Closed By':                  saleClosedByVal,
      'Discount':                        String(discountVal),
      'Customer Email':                  updates.customerEmail   ?? getCellByHeader(row, headerMap, 'Customer Email'),
    };

    await updateRow('sales', actualRowIndex, formatRowFromHeaderMap(sObj, rows[0]));

    await logActivity({
      adminName: admin.name,
      action:    'updated',
      module:    'Sales Management',
      moduleKey: 'sales',
      recordId:  id,
    });

    return Response.json({
      success: true,
      version: newVersion,
      saleClosedBy: saleClosedByVal,
      totalAmount: finalTotalAmount,
      message: `Sale ${id} updated successfully by ${admin.name}.`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return Response.json({ error: "Couldn't update sale.", detail: message }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  let admin;
  try {
    admin = await requireAuth();
  } catch (authErr) {
    if (authErr instanceof Response) return authErr;
    return Response.json({ error: 'Authentication required.' }, { status: 401 });
  }

  try {
    const { id } = await params;
    const rows = await readAllRows('sales');
    if (rows.length === 0) return Response.json({ error: `Sale '${id}' not found.` }, { status: 404 });

    const headerMap = buildHeaderMap(rows[0]);
    const foundIndex = rows.slice(1).findIndex((row) => getCellByHeader(row, headerMap, 'Invoice Number') === id);

    if (foundIndex === -1) {
      return Response.json({ error: `Sale '${id}' not found.` }, { status: 404 });
    }

    const actualRowIndex = foundIndex + 2;
    const row = rows[foundIndex + 1];

    if ((getCellByHeader(row, headerMap, 'Fulfilment Request Status', 'Normal')) !== 'Normal') {
      return Response.json(
        { error: `Cannot delete sale ${id} while it is locked.` },
        { status: 400 }
      );
    }

    await deleteRow('sales', actualRowIndex);

    await logActivity({
      adminName: admin.name,
      action:    'deleted',
      module:    'Sales Management',
      moduleKey:  'sales',
      recordId:   id,
    });

    return Response.json({ success: true, message: `Sale ${id} deleted.` });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return Response.json({ error: "Couldn't delete sale.", detail: message }, { status: 500 });
  }
}
