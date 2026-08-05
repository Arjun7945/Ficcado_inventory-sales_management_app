/**
 * app/api/return-refund/[id]/route.ts
 * GET, PUT, DELETE for a single return/refund record.
 * Supports item disposition (restock to inventory/handler vs damaged products),
 * history logging, and Sales unlocking when completed.
 */

import { requireAuth } from '@/lib/auth';
import { readAllRows, updateRow, deleteRow, appendRows } from '@/lib/google/moduleSheet';
import { logActivity } from '@/lib/activityLogger';
import { recordInventoryHistory } from '@/lib/inventoryHistory';

export const dynamic = 'force-dynamic';

const COL_RET = {
  sno:                 0,
  invoiceNumber:       1,
  verificationStatus:  2,
  refundStatus:        3,
  refundAmount:        4,
  refundCompletedAt:   5,
  transactionId:       6,
  modeOfRefund:        7,
  disposition:         8,
  restockDestination:  9,
  createdAt:           10,
  createdBy:           11,
  updatedAt:           12,
  updatedBy:           13,
  version:             14,
};

const COL_S = { sno: 0, invoiceNumber: 1, customerName: 3, itemNames: 7, sizes: 8, totalItems: 6, fulfilmentStatus: 21, saleStatus: 2 };
const COL_INV = { sno: 0, itemName: 1, size: 2, qty: 3, addedBy: 4, updatedAt: 5, updatedBy: 6, createdAt: 7 };
const COL_W   = { sno: 0, location: 1, handler: 2, itemName: 3, size: 4, qty: 5, createdBy: 6, createdAt: 7, updatedBy: 8, updatedAt: 9 };

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try { await requireAuth(); } catch (e) { if (e instanceof Response) return e; return Response.json({ error: 'Auth required.' }, { status: 401 }); }

  try {
    const [retRows, sRows, adminRows] = await Promise.all([
      readAllRows('return_refund'),
      readAllRows('sales'),
      readAllRows('admin_info'),
    ]);

    const idx = retRows.slice(1).findIndex((r) => r[COL_RET.invoiceNumber] === id);
    if (idx === -1) return Response.json({ error: 'Return/refund record not found.' }, { status: 404 });

    const r = retRows[idx + 1];
    const saleRow = sRows.slice(1).find((s) => s[COL_S.invoiceNumber] === id);
    const saleDetails = saleRow ? {
      invoiceNumber: saleRow[COL_S.invoiceNumber],
      customerName:  saleRow[COL_S.customerName],
      itemNames:     saleRow[COL_S.itemNames],
      sizes:         saleRow[COL_S.sizes],
      totalItems:    saleRow[COL_S.totalItems],
    } : null;

    const admins = adminRows.slice(1).map((a) => (a[1] ?? '').trim()).filter(Boolean);

    return Response.json({
      record: {
        rowIndex:           idx + 2,
        invoiceNumber:      r[COL_RET.invoiceNumber],
        verificationStatus: r[COL_RET.verificationStatus],
        refundStatus:       r[COL_RET.refundStatus],
        refundAmount:       r[COL_RET.refundAmount],
        refundCompletedAt:  r[COL_RET.refundCompletedAt],
        transactionId:      r[COL_RET.transactionId],
        modeOfRefund:       r[COL_RET.modeOfRefund],
        disposition:        r[COL_RET.disposition] ?? '',
        restockDestination: r[COL_RET.restockDestination] ?? '',
        createdAt:          r[COL_RET.createdAt],
        createdBy:          r[COL_RET.createdBy],
        version:            r[COL_RET.version] || '1',
      },
      saleDetails,
      admins,
    });
  } catch (err) { return Response.json({ error: 'Failed.', detail: (err as Error).message }, { status: 500 }); }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let admin;
  try { admin = await requireAuth(); } catch (e) { if (e instanceof Response) return e; return Response.json({ error: 'Auth required.' }, { status: 401 }); }

  try {
    const body = await request.json();
    const {
      verificationStatus,
      refundStatus,
      refundAmount,
      refundCompletedAt,
      transactionId,
      modeOfRefund,
      disposition,        // 'Returned to Inventory' | 'Sent to Damaged Products'
      restockDestination, // 'Inventory Only' | handler admin name
      returnedItems,      // array of { itemName, size, qty }
      version,
    } = body;

    const [retRows, sRows, invRows, wRows, dmgRows] = await Promise.all([
      readAllRows('return_refund'),
      readAllRows('sales'),
      readAllRows('inventory'),
      readAllRows('warehouse'),
      readAllRows('damaged_products'),
    ]);

    const idx = retRows.slice(1).findIndex((r) => r[COL_RET.invoiceNumber] === id);
    if (idx === -1) return Response.json({ error: 'Return/refund record not found.' }, { status: 404 });

    const row = retRows[idx + 1];
    const actualRowIndex = idx + 2;
    const currentVersion = parseInt(row[COL_RET.version] || '1', 10);
    const clientVersion  = parseInt(version || '1', 10);

    if (version && clientVersion !== currentVersion) {
      return Response.json({ error: 'Conflict: record was updated by another admin. Reload and try again.', currentVersion }, { status: 409 });
    }

    const now = new Date().toISOString();
    const targetStatus = refundStatus || row[COL_RET.refundStatus] || 'Refund Pending';

    // Process disposition if returnedItems provided
    if (returnedItems && Array.isArray(returnedItems) && disposition) {
      const saleRow = sRows.slice(1).find((s) => s[COL_S.invoiceNumber] === id);
      const custName = saleRow ? saleRow[COL_S.customerName] : '';

      for (const item of returnedItems) {
        if (disposition === 'Returned to Inventory') {
          // Add back to Inventory total
          const invIdx = invRows.slice(1).findIndex(
            (r) => r[COL_INV.itemName]?.toLowerCase() === item.itemName.toLowerCase() && r[COL_INV.size] === item.size
          );

          if (invIdx >= 0) {
            const invRow = invRows[invIdx + 1];
            const currentQty = parseInt(invRow[COL_INV.qty] ?? '0', 10) || 0;
            const newQty = currentQty + item.qty;

            await updateRow('inventory', invIdx + 2, [
              invRow[COL_INV.sno], item.itemName, item.size, String(newQty),
              invRow[COL_INV.addedBy] ?? admin.name, now, admin.name, invRow[COL_INV.createdAt] ?? now,
            ]);

            await recordInventoryHistory({
              itemName: item.itemName,
              size: item.size,
              quantityChange: item.qty,
              affectedSheet: 'Inventory',
              transactionType: 'Refund Restock',
              relatedInvoiceNumber: id,
              resultingBalance: newQty,
              createdBy: admin.name,
              notes: `Refund restocked for invoice ${id}`,
            });
          }

          // If handler restock destination specified
          if (restockDestination && restockDestination !== 'Inventory Only') {
            const wIdx = wRows.slice(1).findIndex(
              (r) => (r[COL_W.handler] ?? '').trim() === restockDestination.trim() &&
                     (r[COL_W.itemName] ?? '').trim().toLowerCase() === item.itemName.toLowerCase() &&
                     (r[COL_W.size] ?? '').trim() === item.size
            );

            let newWQty = item.qty;
            if (wIdx >= 0) {
              const wRow = wRows[wIdx + 1];
              const curWQty = parseInt(wRow[COL_W.qty] ?? '0', 10) || 0;
              newWQty = curWQty + item.qty;

              await updateRow('warehouse', wIdx + 2, [
                wRow[COL_W.sno], wRow[COL_W.location], wRow[COL_W.handler], wRow[COL_W.itemName],
                wRow[COL_W.size], String(newWQty), wRow[COL_W.createdBy], wRow[COL_W.createdAt],
                admin.name, now,
              ]);
            }

            await recordInventoryHistory({
              itemName: item.itemName,
              size: item.size,
              quantityChange: item.qty,
              affectedSheet: 'Warehouse',
              handler: restockDestination,
              transactionType: 'Refund Restock',
              relatedInvoiceNumber: id,
              resultingBalance: newWQty,
              createdBy: admin.name,
              notes: `Restocked to ${restockDestination}'s warehouse via refund`,
            });
          }
        } else if (disposition === 'Sent to Damaged Products') {
          const dmgSno = String(dmgRows.length + 1);

          await appendRows('damaged_products', [[
            dmgSno, id, item.itemName, item.size, String(item.qty),
            custName, 'Logged via Refund disposition', now, admin.name, now, admin.name,
          ]]);

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
    }

    // Save Return/Refund row
    await updateRow('return_refund', actualRowIndex, [
      row[COL_RET.sno],
      id,
      verificationStatus || row[COL_RET.verificationStatus] || 'No Damage',
      targetStatus,
      String(refundAmount ?? row[COL_RET.refundAmount] ?? '0'),
      refundCompletedAt || row[COL_RET.refundCompletedAt] || (targetStatus === 'Completed' ? now : ''),
      transactionId || row[COL_RET.transactionId] || '',
      modeOfRefund || row[COL_RET.modeOfRefund] || 'UPI',
      disposition || row[COL_RET.disposition] || '',
      restockDestination || row[COL_RET.restockDestination] || '',
      row[COL_RET.createdAt],
      row[COL_RET.createdBy],
      now,
      admin.name,
      String(currentVersion + 1),
    ]);

    // Unlock Sales record when refund is completed
    if (targetStatus === 'Completed' || targetStatus === 'Refund Completed') {
      const sIdx = sRows.slice(1).findIndex((s) => s[COL_S.invoiceNumber] === id);
      if (sIdx >= 0) {
        const sRow = [...sRows[sIdx + 1]];
        sRow[COL_S.fulfilmentStatus] = 'Normal';
        sRow[COL_S.saleStatus] = 'Return & Refund';

        await updateRow('sales', sIdx + 2, sRow);
      }
    }

    const dispText = disposition === 'Returned to Inventory'
      ? `restocked to ${restockDestination || 'Inventory Only'}`
      : 'sent to Damaged Products';
    const logMsg = `${admin.name} processed refund ${id} — item ${dispText}.`;

    await logActivity({ adminName: admin.name, action: 'updated', module: 'Return/Refund Management', moduleKey: 'return_refund', recordId: id });
    return Response.json({ success: true, version: String(currentVersion + 1), message: logMsg });
  } catch (err) { return Response.json({ error: 'Failed to update return/refund.', detail: (err as Error).message }, { status: 500 }); }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let admin;
  try { admin = await requireAuth(); } catch (e) { if (e instanceof Response) return e; return Response.json({ error: 'Auth required.' }, { status: 401 }); }
  try {
    const rows = await readAllRows('return_refund');
    const idx = rows.slice(1).findIndex((r) => r[COL_RET.invoiceNumber] === id);
    if (idx === -1) return Response.json({ error: 'Return/refund record not found.' }, { status: 404 });
    await deleteRow('return_refund', idx + 2);
    await logActivity({ adminName: admin.name, action: 'deleted', module: 'Return/Refund Management', moduleKey: 'return_refund', recordId: id });
    return Response.json({ success: true });
  } catch (err) { return Response.json({ error: 'Failed to delete return/refund.', detail: (err as Error).message }, { status: 500 }); }
}
