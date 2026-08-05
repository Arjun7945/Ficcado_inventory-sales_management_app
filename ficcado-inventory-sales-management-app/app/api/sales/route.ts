/**
 * app/api/sales/route.ts
 *
 * GET  /api/sales         — list all sales + live stock dropdown data
 * POST /api/sales         — create a new sale with handler-aware stock deductions
 */

import { requireAuth } from '@/lib/auth';
import { readAllRows, appendRows, updateRow } from '@/lib/google/moduleSheet';
import { validate, SalesSchema } from '@/lib/validation';
import { logActivity } from '@/lib/activityLogger';
import { recordInventoryHistory } from '@/lib/inventoryHistory';

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
  totalAmount:          9,
  paymentStatus:        10,
  modeOfPayment:        11,
  transactionId:        12,
  createdAt:            13,
  createdBy:            14,
  updatedAt:            15,
  updatedBy:            16,
  version:              17,
  deliveryStatus:       18,
  deliveryChargeToggle: 19,
  deliveryChargeAmount: 20,
  fulfilmentStatus:     21,
  fulfilmentSource:     22,
};

const COL_INV = { sno: 0, itemName: 1, size: 2, qty: 3, addedBy: 4, updatedAt: 5, updatedBy: 6, createdAt: 7 };
const COL_W   = { sno: 0, location: 1, handler: 2, itemName: 3, size: 4, qty: 5, createdBy: 6, createdAt: 7, updatedBy: 8, updatedAt: 9 };

/** Generate the next FIC- invoice number based on existing rows. */
async function generateInvoiceNumber(rows: string[][]): Promise<string> {
  let maxNum = 0;
  for (let i = 1; i < rows.length; i++) {
    const inv = rows[i][COL.invoiceNumber] ?? '';
    const match = inv.match(/^FIC-(\d+)$/);
    if (match) {
      const n = parseInt(match[1], 10);
      if (n > maxNum) maxNum = n;
    }
  }
  return `FIC-${maxNum + 1}`;
}

export async function GET() {
  try {
    await requireAuth();
  } catch (authErr) {
    if (authErr instanceof Response) return authErr;
    return Response.json({ error: 'Authentication required.' }, { status: 401 });
  }

  try {
    const [salesRows, invRows, wRows, adminRows] = await Promise.all([
      readAllRows('sales'),
      readAllRows('inventory'),
      readAllRows('warehouse'),
      readAllRows('admin_info'),
    ]);

    const sales = salesRows.slice(1).map((row, i) => ({
      rowIndex:             i + 2,
      sno:                  row[COL.sno]                  ?? '',
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
    })).filter((s) => s.invoiceNumber);

    // Live inventory stock items (item + size + available qty)
    const inventoryStock = invRows.slice(1).map((r) => ({
      itemName: (r[COL_INV.itemName] ?? '').trim(),
      size:     (r[COL_INV.size] ?? '').trim(),
      qty:      parseInt(r[COL_INV.qty] ?? '0', 10) || 0,
    })).filter((inv) => inv.itemName && inv.size && inv.qty > 0);

    // Registered handlers (admins)
    const admins = adminRows.slice(1).map((r) => (r[1] ?? '').trim()).filter(Boolean);

    // Warehouse stock per handler: `${handler}:${itemName}:${size}` -> qty
    const warehouseStock: Record<string, number> = {};
    for (const r of wRows.slice(1)) {
      const handler = (r[COL_W.handler] ?? '').trim();
      const itemName = (r[COL_W.itemName] ?? '').trim();
      const size = (r[COL_W.size] ?? '').trim();
      const qty = parseInt(r[COL_W.qty] ?? '0', 10) || 0;
      if (handler && itemName && size) {
        const key = `${handler}:${itemName}:${size}`;
        warehouseStock[key] = (warehouseStock[key] || 0) + qty;
      }
    }

    return Response.json({ sales, inventoryStock, admins, warehouseStock });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return Response.json(
      { error: "Couldn't load sales data. Check Sheet Configuration for 'sales'.", detail: message },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  let admin;
  try {
    admin = await requireAuth();
  } catch (authErr) {
    if (authErr instanceof Response) return authErr;
    return Response.json({ error: 'Authentication required.' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { valid, data, errors } = validate(SalesSchema, body);

    if (!valid) {
      const detailMsg = errors ? Object.values(errors).filter(Boolean).join('. ') : 'Validation failed';
      return Response.json({ error: detailMsg || 'Validation failed', errors }, { status: 400 });
    }

    const {
      customerName, customerPhoneNumber, customerAddress,
      totalNumberOfItems, itemNames, sizesChosen,
      totalAmount, paymentStatus, modeOfPayment,
      transactionId, saleStatus, deliveryStatus,
      deliveryChargeToggle, deliveryChargeAmount,
      fulfilmentStatus, fulfilmentSource,
    } = data!;

    const [salesRows, invRows, wRows] = await Promise.all([
      readAllRows('sales'),
      readAllRows('inventory'),
      readAllRows('warehouse'),
    ]);

    // Parse items & sizes list
    const itemSizeRequests: Record<string, { itemName: string; size: string; qty: number }> = {};

    if (Array.isArray(body.items) && body.items.length > 0) {
      for (const item of body.items) {
        const itName = (item.itemName ?? '').trim();
        const sz = (item.size ?? 'M').trim();
        const q = parseInt(item.qty ?? '1', 10) || 1;
        if (itName && sz) {
          const key = `${itName}:${sz}`;
          if (!itemSizeRequests[key]) {
            itemSizeRequests[key] = { itemName: itName, size: sz, qty: 0 };
          }
          itemSizeRequests[key].qty += q;
        }
      }
    } else {
      const itemNamesArr = Array.isArray(itemNames) ? itemNames : [itemNames];
      const sizesChosenArr = Array.isArray(sizesChosen) ? sizesChosen : [sizesChosen];

      for (let i = 0; i < itemNamesArr.length; i++) {
        const itName = itemNamesArr[i].trim();
        const sz = (sizesChosenArr[i] || sizesChosenArr[0] || 'M').trim();
        const key = `${itName}:${sz}`;
        if (!itemSizeRequests[key]) {
          itemSizeRequests[key] = { itemName: itName, size: sz, qty: 0 };
        }
        itemSizeRequests[key].qty += 1;
      }
    }

    // 1. Validate Inventory Stock
    for (const req of Object.values(itemSizeRequests)) {
      const invRow = invRows.slice(1).find(
        (r) => r[COL_INV.itemName]?.toLowerCase() === req.itemName.toLowerCase() && r[COL_INV.size] === req.size
      );
      const invQty = invRow ? (parseInt(invRow[COL_INV.qty] ?? '0', 10) || 0) : 0;

      if (invQty < req.qty) {
        return Response.json(
          { error: `Not enough stock in Inventory for ${req.itemName} (${req.size}). Only ${invQty} piece(s) available.` },
          { status: 400 }
        );
      }

      // 2. If a handler is selected, validate Warehouse stock held by that handler
      if (fulfilmentSource !== 'Take from Inventory') {
        const handlerHeldQty = wRows.slice(1).reduce((sum, r) => {
          if (
            (r[COL_W.handler] ?? '').trim() === fulfilmentSource.trim() &&
            (r[COL_W.itemName] ?? '').trim().toLowerCase() === req.itemName.toLowerCase() &&
            (r[COL_W.size] ?? '').trim() === req.size
          ) {
            return sum + (parseInt(r[COL_W.qty] ?? '0', 10) || 0);
          }
          return sum;
        }, 0);

        if (handlerHeldQty < req.qty) {
          return Response.json(
            { error: `${fulfilmentSource}'s warehouse only holds ${handlerHeldQty} piece(s) of ${req.itemName}, size ${req.size}.` },
            { status: 400 }
          );
        }
      }
    }

    // 3. Deduct stock & log audit entries
    const invoiceNumber = await generateInvoiceNumber(salesRows);
    const now = new Date().toISOString();

    for (const req of Object.values(itemSizeRequests)) {
      // Deduct from Inventory
      const invIdx = invRows.slice(1).findIndex(
        (r) => r[COL_INV.itemName]?.toLowerCase() === req.itemName.toLowerCase() && r[COL_INV.size] === req.size
      );

      if (invIdx >= 0) {
        const rowIndex = invIdx + 2;
        const row = invRows[invIdx + 1];
        const currentInvQty = parseInt(row[COL_INV.qty] ?? '0', 10) || 0;
        const newInvQty = Math.max(0, currentInvQty - req.qty);

        await updateRow('inventory', rowIndex, [
          row[COL_INV.sno], req.itemName, req.size, String(newInvQty),
          row[COL_INV.addedBy] ?? admin.name, now, admin.name, row[COL_INV.createdAt] ?? now,
        ]);

        await recordInventoryHistory({
          itemName: req.itemName,
          size: req.size,
          quantityChange: -req.qty,
          affectedSheet: 'Inventory',
          transactionType: 'Sale Deduction',
          relatedInvoiceNumber: invoiceNumber,
          resultingBalance: newInvQty,
          createdBy: admin.name,
          notes: `Sale ${invoiceNumber} created (${customerName})`,
        });
      }

      // Deduct from Warehouse if handler specified
      if (fulfilmentSource !== 'Take from Inventory') {
        let remainingToDeduct = req.qty;
        let totalHandlerRemaining = 0;

        for (let i = 1; i < wRows.length; i++) {
          const r = wRows[i];
          if (
            (r[COL_W.handler] ?? '').trim() === fulfilmentSource.trim() &&
            (r[COL_W.itemName] ?? '').trim().toLowerCase() === req.itemName.toLowerCase() &&
            (r[COL_W.size] ?? '').trim() === req.size
          ) {
            const currentWQty = parseInt(r[COL_W.qty] ?? '0', 10) || 0;
            if (currentWQty > 0 && remainingToDeduct > 0) {
              const deduct = Math.min(currentWQty, remainingToDeduct);
              const newWQty = currentWQty - deduct;
              remainingToDeduct -= deduct;

              await updateRow('warehouse', i + 1, [
                r[COL_W.sno], r[COL_W.location], r[COL_W.handler], r[COL_W.itemName],
                r[COL_W.size], String(newWQty), r[COL_W.createdBy], r[COL_W.createdAt],
                admin.name, now,
              ]);
            }
            totalHandlerRemaining += (parseInt(r[COL_W.qty] ?? '0', 10) || 0) - (remainingToDeduct === 0 ? req.qty : 0);
          }
        }

        await recordInventoryHistory({
          itemName: req.itemName,
          size: req.size,
          quantityChange: -req.qty,
          affectedSheet: 'Warehouse',
          handler: fulfilmentSource,
          transactionType: 'Sale Deduction',
          relatedInvoiceNumber: invoiceNumber,
          resultingBalance: Math.max(0, totalHandlerRemaining),
          createdBy: admin.name,
          notes: `Sale ${invoiceNumber} fulfilled from ${fulfilmentSource}'s warehouse`,
        });
      }
    }

    // 4. Save Sales row
    const sno = String(salesRows.length);
    const itemNamesStr = Array.isArray(itemNames) ? itemNames.join(', ') : (itemNames || Array.from(new Set(Object.values(itemSizeRequests).map((i) => i.itemName))).join(', '));
    const sizesChosenStr = Array.isArray(sizesChosen) ? sizesChosen.join(', ') : (sizesChosen || Object.values(itemSizeRequests).map((i) => i.size).join(', '));

    await appendRows('sales', [[
      sno,
      invoiceNumber,
      saleStatus ?? (paymentStatus === 'Paid' && deliveryStatus === 'Order Delivered Successfully' ? 'Purchase Satisfied & Order Completed' : 'Not Provided / Order Only Placed'),
      customerName,
      customerPhoneNumber,
      customerAddress,
      String(totalNumberOfItems),
      itemNamesStr,
      sizesChosenStr,
      String(totalAmount),
      paymentStatus,
      modeOfPayment,
      transactionId ?? '',
      now,
      admin.name,
      now,
      admin.name,
      '1',
      deliveryStatus ?? 'Packed & Ready for Shipment',
      String(deliveryChargeToggle ?? false),
      String(deliveryChargeAmount ?? 0),
      fulfilmentStatus ?? 'Normal',
      fulfilmentSource ?? 'Take from Inventory',
    ]]);

    // 5. Enhanced Activity Logging (Section 2.8)
    const itemsSummary = Object.values(itemSizeRequests).map((r) => `${r.qty} piece(s) of ${r.itemName} (${r.size})`).join(', ');
    const sourceText = fulfilmentSource === 'Take from Inventory' ? 'unassigned inventory' : `${fulfilmentSource}'s warehouse`;
    const logMsg = `${admin.name} created sale ${invoiceNumber} — ${itemsSummary}, fulfilled from ${sourceText}.`;

    await logActivity({
      adminName:  admin.name,
      action:     'created',
      module:     'Sales Management',
      moduleKey:  'sales',
      recordId:   invoiceNumber,
    });

    return Response.json(
      { success: true, invoiceNumber, message: logMsg },
      { status: 201 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[sales POST]', message);
    return Response.json(
      { error: "Couldn't create the sale. Check your connection and try again.", detail: message },
      { status: 500 }
    );
  }
}
