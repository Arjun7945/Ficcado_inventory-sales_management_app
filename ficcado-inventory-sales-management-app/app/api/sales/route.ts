/**
 * app/api/sales/route.ts
 * GET  /api/sales — list all sales & inventory/admin dropdowns (+ customer email join)
 * POST /api/sales — create new sale, deduct stock, upsert customer_info record
 */

import { requireAuth } from '@/lib/auth';
import { readAllRows, appendRows, updateRow, bustSalesLogPreviewCache } from '@/lib/google/moduleSheet';
import { validate, SalesSchema } from '@/lib/validation';
import { logActivity } from '@/lib/activityLogger';
import { recordInventoryHistory } from '@/lib/inventoryHistory';
import { recordSalesLog, formatPrice, formatStockLocation, groupItemLines, formatItemListWithSummary } from '@/lib/salesLogger';
import { updateSearchIndex } from '@/lib/google/searchIndex';
import { formatISTDateTime } from '@/lib/dateUtils';

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

const COL_INV = { sno: 0, itemName: 1, size: 2, qty: 3, addedBy: 4, updatedAt: 5, updatedBy: 6, createdAt: 7 };
const COL_W   = { sno: 0, location: 1, handler: 2, itemName: 3, size: 4, qty: 5, createdBy: 6, createdAt: 7, updatedBy: 8, updatedAt: 9 };

// Customer Info column indices
const COL_CI = {
  sno:               0,
  customerName:      1,
  phoneNumber:       2,
  address:           3,
  emailId:           4,
  totalOrders:       5,
  invoiceNumbers:    6,
  createdAt:         7,
  createdBy:         8,
  updatedAt:         9,
  updatedBy:         10,
};

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

/**
 * Upsert a customer_info row for the given phone number.
 * Creates a new row if no match, or updates the existing row.
 * Silently skips if customer_info module is not yet configured.
 */
async function upsertCustomerInfo(params: {
  phone: string;
  name: string;
  address: string;
  email: string;
  invoiceNumber: string;
  adminName: string;
}): Promise<void> {
  const { phone, name, address, email, invoiceNumber, adminName } = params;
  try {
    const ciRows = await readAllRows('customer_info');
    const now = new Date().toISOString();

    // Find existing row by phone (skip header row)
    const existingIdx = ciRows.slice(1).findIndex(
      (r) => (r[COL_CI.phoneNumber] ?? '').trim() === phone.trim()
    );

    if (existingIdx < 0) {
      // New customer — append row
      const sno = String(ciRows.length); // 1-based, header is row 1
      await appendRows('customer_info', [[
        sno,
        name,
        phone,
        address,
        email,
        '1',
        invoiceNumber,
        now,
        adminName,
        now,
        adminName,
      ]]);
    } else {
      // Existing customer — update
      const rowIndex = existingIdx + 2; // +1 for header, +1 for 1-based
      const existing = ciRows[existingIdx + 1];
      const currentOrders = parseInt(existing[COL_CI.totalOrders] ?? '0', 10) || 0;
      const existingInvoices = (existing[COL_CI.invoiceNumbers] ?? '').trim();
      const newInvoices = existingInvoices
        ? existingInvoices + ', ' + invoiceNumber
        : invoiceNumber;

      await updateRow('customer_info', rowIndex, [
        existing[COL_CI.sno],
        existing[COL_CI.customerName] || name,
        existing[COL_CI.phoneNumber],
        existing[COL_CI.address] || address,
        existing[COL_CI.emailId] || email,
        String(currentOrders + 1),
        newInvoices,
        existing[COL_CI.createdAt] ?? now,
        existing[COL_CI.createdBy] ?? adminName,
        now,
        adminName,
      ]);
    }
  } catch {
    // customer_info module may not be configured yet — skip silently
  }
}

export async function GET(request: Request) {
  try {
    await requireAuth();
  } catch (authErr) {
    if (authErr instanceof Response) return authErr;
    return Response.json({ error: 'Authentication required.' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const targetModule = searchParams.get('module') || 'sales';

    const [salesRows, invRows, adminRows, wRows] = await Promise.all([
      readAllRows(targetModule),
      readAllRows('inventory'),
      readAllRows('admin_info'),
      readAllRows('warehouse'),
    ]);

    const EXPECTED_HEADERS = [
      'S.No', 'Invoice Number', 'Sale Status', 'Customer Name', 'Customer Phone Number', 'Customer Address',
      'Total Number of Items Purchased', 'Item(s) Name(s)', 'Size(s) Chosen', 'Item Prices', 'Total Amount',
      'Payment Status', 'Mode of Payment', 'Transaction ID', 'Created At', 'Created By (Admin)',
      'Updated At', 'Updated By', 'Version', 'Delivery Status', 'Delivery Charge Toggle',
      'Delivery Charge Amount', 'Fulfilment Request Status', 'Fulfilment Source', 'Sale Closed By',
      'Discount', 'Customer Email'
    ];

    // Auto-initialize header cells for new columns if not present
    if (salesRows.length > 0) {
      const headerRow = [...salesRows[0]];
      let needsUpdate = false;
      EXPECTED_HEADERS.forEach((h, idx) => {
        if (headerRow[idx] !== h) {
          headerRow[idx] = h;
          needsUpdate = true;
        }
      });
      if (needsUpdate) updateRow('sales', 1, headerRow).catch(() => {});
    }

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
      saleClosedBy:         row[COL.saleClosedBy]         ?? '',
      discount:             parseFloat(row[COL.discount]  ?? '0') || 0,
      customerEmail:        row[COL.customerEmail]        ?? '',
      itemPrices:           row[COL.itemPrices]           ?? '',
    })).filter((s) => s.invoiceNumber);

    // Live inventory stock items
    const inventoryStock = invRows.slice(1).map((r) => ({
      itemName: (r[COL_INV.itemName] ?? '').trim(),
      size:     (r[COL_INV.size] ?? '').trim(),
      qty:      parseInt(r[COL_INV.qty] ?? '0', 10) || 0,
    })).filter((inv) => inv.itemName && inv.size && inv.qty > 0);

    // Collect all unique handlers (both Admin Handlers and Custom Handlers) who hold active warehouse stock (qty > 0)
    const activeHandlerMap = new Map<string, string>();
    const warehouseStock: Record<string, number> = {};

    for (const r of wRows.slice(1)) {
      const handler = (r[COL_W.handler] ?? '').trim();
      const itemName = (r[COL_W.itemName] ?? '').trim();
      const size = (r[COL_W.size] ?? '').trim();
      const qty = parseInt(r[COL_W.qty] ?? '0', 10) || 0;
      if (handler && qty > 0) {
        if (!activeHandlerMap.has(handler.toLowerCase())) {
          activeHandlerMap.set(handler.toLowerCase(), handler);
        }
      }
      if (handler && itemName && size) {
        const key = `${handler}:${itemName}:${size}`;
        warehouseStock[key] = (warehouseStock[key] || 0) + qty;
      }
    }

    const activeHandlersList = Array.from(activeHandlerMap.values());

    return Response.json({ sales: sales.reverse(), inventoryStock, admins: activeHandlersList, handlers: activeHandlersList, warehouseStock });


  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return Response.json(
      { error: "Couldn't load sales data.", detail: message },
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
      customerEmail, discount,
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

              await recordInventoryHistory({
                itemName: req.itemName,
                size: req.size,
                quantityChange: -deduct,
                affectedSheet: 'Warehouse',
                handler: fulfilmentSource,
                transactionType: 'Sale Deduction',
                relatedInvoiceNumber: invoiceNumber,
                resultingBalance: newWQty,
                createdBy: admin.name,
                notes: `Sale ${invoiceNumber} fulfilled from ${fulfilmentSource}'s warehouse`,
              });
            }
          }
        }
      }
    }

    // 4. Save Sales row
    const sno = String(salesRows.length);

    // Expand items and sizes to reflect exact quantities per item piece
    const expandedItemNames: string[] = [];
    const expandedSizes: string[] = [];

    if (Array.isArray(body.items) && body.items.length > 0) {
      for (const item of body.items) {
        const itName = (item.itemName ?? '').trim();
        const sz = (item.size ?? 'M').trim();
        const q = parseInt(item.qty ?? '1', 10) || 1;
        if (itName && sz) {
          for (let k = 0; k < q; k++) {
            expandedItemNames.push(itName);
            expandedSizes.push(sz);
          }
        }
      }
    } else {
      for (const req of Object.values(itemSizeRequests)) {
        for (let k = 0; k < req.qty; k++) {
          expandedItemNames.push(req.itemName);
          expandedSizes.push(req.size);
        }
      }
    }

    const itemNamesStr = expandedItemNames.length > 0
      ? expandedItemNames.join(', ')
      : (Array.isArray(itemNames) ? itemNames.join(', ') : String(itemNames || ''));
    const sizesChosenStr = expandedSizes.length > 0
      ? expandedSizes.join(', ')
      : (Array.isArray(sizesChosen) ? sizesChosen.join(', ') : String(sizesChosen || ''));

    const isCompletedOnCreation = paymentStatus === 'Paid' && deliveryStatus === 'Order Delivered Successfully';
    const effectiveSaleStatus = saleStatus ?? (isCompletedOnCreation ? 'Purchase Satisfied & Order Completed' : 'Not Provided / Order Only Placed');
    const saleClosedByValue = (isCompletedOnCreation || effectiveSaleStatus.includes('Purchase Satisfied')) ? admin.name : '';

    // Fetch catalog prices as fallback if unit prices not explicitly sent
    const itemCatalogRows = await readAllRows('items');
    const catalogPriceMap: Record<string, number> = {};
    for (const r of itemCatalogRows.slice(1)) {
      const name = (r[1] ?? '').trim().toLowerCase();
      const price = parseFloat(r[3] ?? '0') || 0;
      if (name && price > 0) catalogPriceMap[name] = price;
    }

    const expandedPrices: number[] = [];
    if (Array.isArray(body.items) && body.items.length > 0) {
      for (const item of body.items) {
        const itName = (item.itemName ?? '').trim();
        const sz = (item.size ?? 'M').trim();
        const q = parseInt(item.qty ?? '1', 10) || 1;
        const p = parseFloat(item.unitPrice ?? item.price ?? catalogPriceMap[itName.toLowerCase()] ?? '0') || 0;
        if (itName && sz) {
          for (let k = 0; k < q; k++) {
            expandedPrices.push(p);
          }
        }
      }
    } else {
      for (const req of Object.values(itemSizeRequests)) {
        const p = catalogPriceMap[req.itemName.toLowerCase()] || 0;
        for (let k = 0; k < req.qty; k++) {
          expandedPrices.push(p);
        }
      }
    }

    const itemPricesStr = expandedPrices.length > 0 ? expandedPrices.join(', ') : '';

    await appendRows('sales', [[
      sno,
      invoiceNumber,
      effectiveSaleStatus,
      customerName,
      customerPhoneNumber,
      customerAddress,
      String(totalNumberOfItems),
      itemNamesStr,
      sizesChosenStr,
      itemPricesStr,
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
      saleClosedByValue,
      String(discount ?? 0),
      customerEmail ?? '',
    ]]);

    // 5. Upsert customer_info record (same transaction, silently skips if module not configured)
    await upsertCustomerInfo({
      phone:         customerPhoneNumber,
      name:          customerName,
      address:       customerAddress,
      email:         customerEmail ?? '',
      invoiceNumber,
      adminName:     admin.name,
    });

    // 5b. Phase 64: Update search index with new invoice number + customer info (silent)
    const newRowIndex = salesRows.length + 1; // header=row1, new row appended after existing
    Promise.all([
      updateSearchIndex('sales', newRowIndex, invoiceNumber),
      updateSearchIndex('sales', newRowIndex, customerName),
      updateSearchIndex('sales', newRowIndex, customerPhoneNumber),
    ]).catch(() => {}); // fire-and-forget, never block the sale response

    // 6. Enhanced Activity Logging & Sales Log Audit
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

    // Generate narrative Sales Log entry
    const groupedLogItems = groupItemLines(
      Array.isArray(body.items) && body.items.length > 0
        ? body.items
        : Object.values(itemSizeRequests).map((r) => ({
            itemName: r.itemName,
            size: r.size,
            qty: r.qty,
            unitPrice: catalogPriceMap[r.itemName.toLowerCase()] || 0,
          }))
    );
    const { itemText } = formatItemListWithSummary(groupedLogItems, true);

    const deliveryText = deliveryChargeToggle && deliveryChargeAmount > 0
      ? `charged Rs: ${deliveryChargeAmount} as delivery charge`
      : `was not charged delivery charge (FREE DELIVERY)`;

    const salesLogMsg = `Admin ${admin.name} have created a new sale ${invoiceNumber}, for customer ${customerName}, on items ${itemText}. The items were taken from ${formatStockLocation(fulfilmentSource)}. Customer was given a discount of Rs: ${discount || 0}, and customer ${deliveryText}. The final total amount was ${formatPrice(totalAmount)}. The sale was created at ${formatISTDateTime(now)}.`;

    await recordSalesLog({
      module: 'Sales',
      operation: 'Create',
      relatedInvoiceNumber: invoiceNumber,
      message: salesLogMsg,
      adminName: admin.name,
    });
    bustSalesLogPreviewCache();

    return Response.json({
      success: true,
      invoiceNumber,
      message: logMsg,
      sale: {
        invoiceNumber,
        customerName,
        customerEmail: customerEmail ?? '',
        totalAmount,
        discount: discount ?? 0,
        paymentStatus,
        modeOfPayment,
        transactionId,
        saleStatus: effectiveSaleStatus,
        deliveryStatus,
        saleClosedBy: saleClosedByValue,
      },
    }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return Response.json({ error: "Couldn't create sale record.", detail: message }, { status: 500 });
  }
}
