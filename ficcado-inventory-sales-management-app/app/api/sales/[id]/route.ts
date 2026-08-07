/**
 * app/api/sales/[id]/route.ts
 *
 * GET    /api/sales/[id] — get single sale by invoice number or rowIndex
 * PUT    /api/sales/[id] — update sale (with Replace/Refund request locking and saleClosedBy tracking)
 * DELETE /api/sales/[id] — delete sale
 */

import { requireAuth } from '@/lib/auth';
import { readAllRows, updateRow, deleteRow, appendRows } from '@/lib/google/moduleSheet';
import { logActivity } from '@/lib/activityLogger';

export const dynamic = 'force-dynamic';

const COL = {
  sno:                  0,
  invoiceNumber:        1,
  saleStatus:           2,
  customerName:         3,
  customerPhone:        4,
  customerAddress:      5,
  totalItems:           6,
  itemNames:            7,
  sizes:                8,
  itemPrices:           9,
  totalAmount:          10,
  paymentStatus:        11,
  modeOfPayment:        12,
  transactionId:        13,
  createdAt:            14,
  createdBy:            15,
  updatedAt:            16,
  updatedBy:            17,
  version:              18,
  deliveryStatus:       19,
  deliveryChargeToggle: 20,
  deliveryChargeAmount: 21,
  fulfilmentStatus:     22,
  fulfilmentSource:     23,
  saleClosedBy:         24,
  discount:             25,
  customerEmail:        26,
};

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

    const rowIndex = rows.slice(1).findIndex(
      (row) => row[COL.invoiceNumber] === id || String(rows.indexOf(row) + 2) === id
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
      invoiceNumber:        row[COL.invoiceNumber]        ?? '',
      saleStatus:           row[COL.saleStatus]           ?? '',
      customerName:         row[COL.customerName]         ?? '',
      customerPhone:        row[COL.customerPhone]        ?? '',
      customerAddress:      row[COL.customerAddress]      ?? '',
      totalItems:           row[COL.totalItems]           ?? '',
      itemNames:            row[COL.itemNames]            ?? '',
      sizes:                row[COL.sizes]                ?? '',
      totalAmount:          row[COL.totalAmount]          ?? '',
      paymentStatus:        row[COL.paymentStatus]        ?? '',
      modeOfPayment:        row[COL.modeOfPayment]        ?? '',
      transactionId:        row[COL.transactionId]        ?? '',
      createdAt:            row[COL.createdAt]            ?? '',
      createdBy:            row[COL.createdBy]            ?? '',
      updatedAt:            row[COL.updatedAt]            ?? '',
      updatedBy:            row[COL.updatedBy]            ?? '',
      version:              row[COL.version]              ?? '1',
      deliveryStatus:       row[COL.deliveryStatus]       ?? 'Packed & Ready for Shipment',
      deliveryChargeToggle: row[COL.deliveryChargeToggle] === 'true',
      deliveryChargeAmount: parseFloat(row[COL.deliveryChargeAmount] ?? '0') || 0,
      fulfilmentStatus:     row[COL.fulfilmentStatus]     ?? 'Normal',
      fulfilmentSource:     row[COL.fulfilmentSource]     ?? 'Take from Inventory',
      saleClosedBy:         row[COL.saleClosedBy]         ?? '',
      discount:             parseFloat(row[COL.discount]  ?? '0') || 0,
      customerEmail:        row[COL.customerEmail]        ?? '',
      itemPrices:           row[COL.itemPrices]           ?? '',
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
    const foundIndex = rows.slice(1).findIndex((row) => row[COL.invoiceNumber] === id);

    if (foundIndex === -1) {
      return Response.json({ error: `Sale '${id}' not found.` }, { status: 404 });
    }

    const actualRowIndex = foundIndex + 2;
    const row = rows[foundIndex + 1];
    const currentFulfilmentStatus = row[COL.fulfilmentStatus] ?? 'Normal';

    // 1. Handle special request actions: 'replace_requested' or 'refund_requested'
    if (requestAction === 'replace_requested') {
      if (currentFulfilmentStatus !== 'Normal') {
        return Response.json(
          { error: `Sale ${id} is already locked under ${currentFulfilmentStatus}.` },
          { status: 400 }
        );
      }

      const now = new Date().toISOString();
      const newVersion = String(parseInt(row[COL.version] ?? '1', 10) + 1);

      const updatedRow = [...row];
      updatedRow[COL.fulfilmentStatus] = 'Replace-Requested';
      updatedRow[COL.updatedAt] = now;
      updatedRow[COL.updatedBy] = admin.name;
      updatedRow[COL.version] = newVersion;

      await updateRow('sales', actualRowIndex, updatedRow);

      const replRows = await readAllRows('replacement');
      const replSno = String(replRows.length);
      await appendRows('replacement', [[
        replSno,
        id,
        row[COL.totalItems] ?? '1',
        row[COL.itemNames] ?? '',
        row[COL.sizes] ?? '',
        '', '',
        'Replacement Approved',
        '', '',
        now, admin.name, now, admin.name, '1',
      ]]);

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

    if (requestAction === 'refund_requested') {
      if (currentFulfilmentStatus !== 'Normal') {
        return Response.json(
          { error: `Sale ${id} is already locked under ${currentFulfilmentStatus}.` },
          { status: 400 }
        );
      }

      const now = new Date().toISOString();
      const newVersion = String(parseInt(row[COL.version] ?? '1', 10) + 1);

      const updatedRow = [...row];
      updatedRow[COL.fulfilmentStatus] = 'Refund-Requested';
      updatedRow[COL.updatedAt] = now;
      updatedRow[COL.updatedBy] = admin.name;
      updatedRow[COL.version] = newVersion;

      await updateRow('sales', actualRowIndex, updatedRow);

      const retRows = await readAllRows('return_refund');
      const retSno = String(retRows.length);
      await appendRows('return_refund', [[
        retSno,
        id,
        'No Damage',
        'Refund Pending',
        row[COL.totalAmount] ?? '0',
        '',
        row[COL.transactionId] ?? '',
        row[COL.modeOfPayment] ?? 'UPI',
        '', '',
        now, admin.name, now, admin.name, '1',
      ]]);

      const logMsg = `${admin.name} marked sale ${id} as Refund Requested — moved to Return/Refund Management.`;
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

    // 2. Normal Edit check
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

    // 3. Optimistic lock check
    const serverVersion = row[COL.version] ?? '1';
    if (clientVersion && String(clientVersion) !== String(serverVersion)) {
      return Response.json(
        {
          error: `This sale was updated by ${row[COL.updatedBy]} at ${row[COL.updatedAt]} — reload to see the changes before saving yours.`,
          type: 'conflict',
          updatedBy: row[COL.updatedBy],
          updatedAt: row[COL.updatedAt],
        },
        { status: 409 }
      );
    }

    const now = new Date().toISOString();
    const newVersion = String(parseInt(serverVersion, 10) + 1);

    const nextPaymentStatus  = updates.paymentStatus  ?? row[COL.paymentStatus];
    const nextDeliveryStatus = updates.deliveryStatus ?? row[COL.deliveryStatus];
    const nextSaleStatus     = updates.saleStatus     ?? row[COL.saleStatus];

    const isCompletedNow = (nextPaymentStatus === 'Paid' && nextDeliveryStatus === 'Order Delivered Successfully') ||
                           (nextSaleStatus && nextSaleStatus.includes('Purchase Satisfied'));

    let saleClosedByVal = row[COL.saleClosedBy] ?? '';
    if (isCompletedNow) {
      saleClosedByVal = admin.name;
    } else if (nextPaymentStatus !== 'Paid') {
      saleClosedByVal = '';
    }

    const newRow = [
      row[COL.sno],
      row[COL.invoiceNumber],
      nextSaleStatus,
      updates.customerName    ?? row[COL.customerName],
      updates.customerPhone   ?? row[COL.customerPhone],
      updates.customerAddress ?? row[COL.customerAddress],
      updates.totalItems      ?? row[COL.totalItems],
      Array.isArray(updates.itemNames) ? updates.itemNames.join(', ') : (updates.itemNames ?? row[COL.itemNames]),
      Array.isArray(updates.sizes)     ? updates.sizes.join(', ')     : (updates.sizes     ?? row[COL.sizes]),
      updates.itemPrices      ?? row[COL.itemPrices]      ?? '',
      updates.totalAmount     ?? row[COL.totalAmount],
      nextPaymentStatus,
      updates.modeOfPayment   ?? row[COL.modeOfPayment],
      updates.transactionId   ?? row[COL.transactionId],
      row[COL.createdAt],
      row[COL.createdBy],
      now,
      admin.name,
      newVersion,
      nextDeliveryStatus,
      String(updates.deliveryChargeToggle ?? row[COL.deliveryChargeToggle] ?? 'false'),
      String(updates.deliveryChargeAmount ?? row[COL.deliveryChargeAmount] ?? '0'),
      row[COL.fulfilmentStatus]    ?? 'Normal',
      updates.fulfilmentSource     ?? row[COL.fulfilmentSource]     ?? 'Take from Inventory',
      saleClosedByVal,
      String(updates.discount     ?? row[COL.discount]     ?? '0'),
      updates.customerEmail   ?? row[COL.customerEmail]   ?? '',
    ];

    await updateRow('sales', actualRowIndex, newRow);

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
    const foundIndex = rows.slice(1).findIndex((row) => row[COL.invoiceNumber] === id);

    if (foundIndex === -1) {
      return Response.json({ error: `Sale '${id}' not found.` }, { status: 404 });
    }

    const actualRowIndex = foundIndex + 2;
    const row = rows[foundIndex + 1];

    if ((row[COL.fulfilmentStatus] ?? 'Normal') !== 'Normal') {
      return Response.json(
        { error: `Cannot delete sale ${id} while it is locked under ${row[COL.fulfilmentStatus]}.` },
        { status: 400 }
      );
    }

    await deleteRow('sales', actualRowIndex);

    await logActivity({
      adminName: admin.name,
      action:    'deleted',
      module:    'Sales Management',
      moduleKey: 'sales',
      recordId:  id,
    });

    return Response.json({ success: true, message: `Sale ${id} deleted.` });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return Response.json({ error: "Couldn't delete sale.", detail: message }, { status: 500 });
  }
}
