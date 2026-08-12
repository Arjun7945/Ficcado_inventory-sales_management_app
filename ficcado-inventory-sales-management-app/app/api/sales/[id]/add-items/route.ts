/**
 * app/api/sales/[id]/add-items/route.ts
 *
 * POST /api/sales/[id]/add-items
 *
 * Adds one or more new items to an existing sale.
 * Validates stock availability, deducts from inventory/warehouse,
 * updates the sale row with the expanded item list and new total,
 * records inventory history for each deducted item,
 * and writes a Sales Log entry.
 *
 * Body:
 * {
 *   items: Array<{ itemName: string; size: string; qty: number; unitPrice: number; fulfilmentSource: string; }>;
 * }
 *
 * fulfilmentSource is either 'Main Inventory' or an admin/handler name for warehouse deduction.
 *
 * Part 6 B2: New route.
 */

import { requireAuth } from '@/lib/auth';
import { readAllRows, updateRow } from '@/lib/google/moduleSheet';
import { buildHeaderMap, getCellByHeader, formatRowFromHeaderMap } from '@/lib/google/headerUtils';
import { calculateSaleTotalAmount } from '@/lib/salesPricing';
import { recordInventoryHistory } from '@/lib/inventoryHistory';
import { recordSalesLog, formatPrice } from '@/lib/salesLogger';

export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  let admin: Awaited<ReturnType<typeof requireAuth>>;
  try {
    admin = await requireAuth();
  } catch (authErr) {
    if (authErr instanceof Response) return authErr;
    return Response.json({ error: 'Authentication required.' }, { status: 401 });
  }

  const { id } = await params;

  try {
    const body = await request.json();
    const { items } = body as {
      items: Array<{ itemName: string; size: string; qty: number; unitPrice: number; fulfilmentSource: string }>;
    };

    if (!Array.isArray(items) || items.length === 0) {
      return Response.json(
        { error: 'At least one item is required to add to the sale.' },
        { status: 400 }
      );
    }

    // Validate each item field
    for (const item of items) {
      if (!item.itemName?.trim()) return Response.json({ error: 'Each item must have a name.' }, { status: 400 });
      if (!item.size?.trim())     return Response.json({ error: `Item "${item.itemName}" must have a size.` }, { status: 400 });
      if (!(item.qty > 0))        return Response.json({ error: `Quantity for "${item.itemName}" must be at least 1.` }, { status: 400 });
      if (!(item.unitPrice >= 0)) return Response.json({ error: `Unit price for "${item.itemName}" must be a non-negative number.` }, { status: 400 });
    }

    const now = new Date().toISOString();

    // Load all required sheets in parallel
    const [sRows, invRows, wRows] = await Promise.all([
      readAllRows('sales'),
      readAllRows('inventory'),
      readAllRows('warehouse'),
    ]);

    if (sRows.length === 0) {
      return Response.json({ error: `Sale '${id}' not found.` }, { status: 404 });
    }

    const sMap = buildHeaderMap(sRows[0]);
    const saleIdx = sRows.slice(1).findIndex(
      (row) => getCellByHeader(row, sMap, 'Invoice Number') === id
    );

    if (saleIdx === -1) {
      return Response.json({ error: `Sale '${id}' not found.` }, { status: 404 });
    }

    const saleRow         = sRows[saleIdx + 1];
    const saleRowIndex    = saleIdx + 2;
    const saleStatus      = getCellByHeader(saleRow, sMap, 'Sale Status');
    const fulfilmentStatus = getCellByHeader(saleRow, sMap, 'Fulfilment Request Status', 'Normal');

    // Prevent adding items to locked sales
    if (fulfilmentStatus !== 'Normal') {
      return Response.json(
        {
          error: `Cannot add items: this sale is locked under "${fulfilmentStatus}". Resolve the active replacement/refund request first.`,
        },
        { status: 400 }
      );
    }

    // Read current sale data
    const currentItemNames  = getCellByHeader(saleRow, sMap, 'Item(s) Name(s)');
    const currentSizes      = getCellByHeader(saleRow, sMap, 'Size(s) Chosen');
    const currentItemPrices = getCellByHeader(saleRow, sMap, 'Item Prices');
    const currentDiscount   = parseFloat(getCellByHeader(saleRow, sMap, 'Discount', '0')) || 0;
    const currentDeliveryToggle = getCellByHeader(saleRow, sMap, 'Delivery Charge Toggle') === 'true';
    const currentDeliveryAmt    = parseFloat(getCellByHeader(saleRow, sMap, 'Delivery Charge Amount', '0')) || 0;
    const currentVersion        = parseInt(getCellByHeader(saleRow, sMap, 'Version', '1'), 10);

    const invMap = buildHeaderMap(invRows[0] || []);
    const wMap   = buildHeaderMap(wRows[0]   || []);

    // ── Stock validation (pre-flight check) ─────────────────────────────────
    const stockErrors: string[] = [];

    for (const item of items) {
      const src = (item.fulfilmentSource || 'Main Inventory').trim();
      const isMainInventory = src === 'Main Inventory' || src === 'Inventory Only';

      if (isMainInventory) {
        const invIdx = invRows.slice(1).findIndex(
          (r) =>
            getCellByHeader(r, invMap, 'Item Name').toLowerCase() === item.itemName.toLowerCase() &&
            getCellByHeader(r, invMap, 'Size') === item.size
        );
        if (invIdx === -1) {
          stockErrors.push(`"${item.itemName}" (Size ${item.size}) is not in inventory.`);
          continue;
        }
        const available = parseInt(getCellByHeader(invRows[invIdx + 1], invMap, 'Total Quantity Available', '0'), 10) || 0;
        if (available < item.qty) {
          stockErrors.push(
            `Insufficient stock for "${item.itemName}" (Size ${item.size}): ${available} available, ${item.qty} requested.`
          );
        }
      } else {
        // Warehouse deduction
        const warehouseMatches = wRows.slice(1).filter(
          (r) =>
            getCellByHeader(r, wMap, 'Handler Name').trim().toLowerCase() === src.toLowerCase() &&
            getCellByHeader(r, wMap, 'Item Name').toLowerCase() === item.itemName.toLowerCase() &&
            getCellByHeader(r, wMap, 'Size') === item.size
        );
        const available = warehouseMatches.reduce(
          (sum, r) => sum + (parseInt(getCellByHeader(r, wMap, 'Quantity', '0'), 10) || 0),
          0
        );
        if (available < item.qty) {
          stockErrors.push(
            `Insufficient warehouse stock for "${item.itemName}" (Size ${item.size}) at handler "${src}": ${available} available, ${item.qty} requested.`
          );
        }
      }
    }

    if (stockErrors.length > 0) {
      return Response.json(
        { error: `Stock validation failed:\n• ${stockErrors.join('\n• ')}` },
        { status: 422 }
      );
    }

    // ── Perform stock deductions ─────────────────────────────────────────────
    // Re-read warehouse rows after potential concurrent updates — use fresh copies
    const freshInvRows = await readAllRows('inventory');
    const freshWRows   = await readAllRows('warehouse');
    const freshInvMap  = buildHeaderMap(freshInvRows[0] || []);
    const freshWMap    = buildHeaderMap(freshWRows[0]   || []);

    for (const item of items) {
      const src = (item.fulfilmentSource || 'Main Inventory').trim();
      const isMainInventory = src === 'Main Inventory' || src === 'Inventory Only';

      for (let deductQty = item.qty; deductQty > 0; ) {
        if (isMainInventory) {
          const invIdx = freshInvRows.slice(1).findIndex(
            (r) =>
              getCellByHeader(r, freshInvMap, 'Item Name').toLowerCase() === item.itemName.toLowerCase() &&
              getCellByHeader(r, freshInvMap, 'Size') === item.size
          );
          if (invIdx === -1) break;

          const invRow     = freshInvRows[invIdx + 1];
          const currentQty = parseInt(getCellByHeader(invRow, freshInvMap, 'Total Quantity Available', '0'), 10) || 0;
          const toDeduct   = Math.min(deductQty, currentQty);
          const newQty     = currentQty - toDeduct;
          deductQty       -= toDeduct;

          const invObj: Record<string, string> = {};
          freshInvRows[0].forEach((col, ci) => { invObj[col.trim()] = invRow[ci] ?? ''; });
          invObj['Total Quantity Available'] = String(newQty);
          invObj['Updated At']               = now;
          invObj['Updated By (Admin)']       = admin.name;

          await updateRow('inventory', invIdx + 2, formatRowFromHeaderMap(invObj, freshInvRows[0]));

          await recordInventoryHistory({
            itemName:             item.itemName,
            size:                 item.size,
            quantityChange:       -toDeduct,
            affectedSheet:        'Inventory',
            transactionType:      'Sale Addition',
            relatedInvoiceNumber: id,
            resultingBalance:     newQty,
            createdBy:            admin.name,
            notes:                `Added ${toDeduct} piece(s) to existing sale ${id}`,
          });
        } else {
          // Warehouse deduction — find the first warehouse row for this handler+item+size with qty > 0
          const wRows2 = await readAllRows('warehouse');
          const wMap2  = buildHeaderMap(wRows2[0] || []);
          const wIdx = wRows2.slice(1).findIndex(
            (r) =>
              getCellByHeader(r, wMap2, 'Handler Name').trim().toLowerCase() === src.toLowerCase() &&
              getCellByHeader(r, wMap2, 'Item Name').toLowerCase() === item.itemName.toLowerCase() &&
              getCellByHeader(r, wMap2, 'Size') === item.size &&
              (parseInt(getCellByHeader(r, wMap2, 'Quantity', '0'), 10) || 0) > 0
          );
          if (wIdx === -1) break;

          const wRow     = wRows2[wIdx + 1];
          const curWQty  = parseInt(getCellByHeader(wRow, wMap2, 'Quantity', '0'), 10) || 0;
          const toDeduct = Math.min(deductQty, curWQty);
          const newWQty  = curWQty - toDeduct;
          deductQty     -= toDeduct;

          const wObj: Record<string, string> = {};
          wRows2[0].forEach((col, ci) => { wObj[col.trim()] = wRow[ci] ?? ''; });
          wObj['Quantity']   = String(newWQty);
          wObj['Updated At'] = now;
          wObj['Updated By'] = admin.name;

          await updateRow('warehouse', wIdx + 2, formatRowFromHeaderMap(wObj, wRows2[0]));

          await recordInventoryHistory({
            itemName:             item.itemName,
            size:                 item.size,
            quantityChange:       -toDeduct,
            affectedSheet:        'Warehouse',
            handler:              src,
            transactionType:      'Sale Addition',
            relatedInvoiceNumber: id,
            resultingBalance:     newWQty,
            createdBy:            admin.name,
            notes:                `Added ${toDeduct} piece(s) to existing sale ${id} from ${src}'s warehouse`,
          });
        }
      }
    }

    // ── Build expanded item lists ────────────────────────────────────────────
    const existingNames  = currentItemNames  ? currentItemNames.split(',').map((s) => s.trim())  : [];
    const existingSizes  = currentSizes      ? currentSizes.split(',').map((s) => s.trim())      : [];
    const existingPrices = currentItemPrices ? currentItemPrices.split(',').map((s) => s.trim()) : [];

    const addedNames:  string[] = [];
    const addedSizes:  string[] = [];
    const addedPrices: string[] = [];

    for (const item of items) {
      for (let k = 0; k < item.qty; k++) {
        addedNames.push(item.itemName.trim());
        addedSizes.push(item.size.trim());
        addedPrices.push(String(item.unitPrice));
      }
    }

    const newItemNames  = [...existingNames,  ...addedNames].join(', ');
    const newSizes      = [...existingSizes,  ...addedSizes].join(', ');
    const newItemPrices = [...existingPrices, ...addedPrices].join(', ');
    const newTotalCount = String([...existingNames, ...addedNames].length);

    // ── Recalculate grand total using calculateSaleTotalAmount ───────────────
    const allPrices = [...existingPrices, ...addedPrices].map((p) => parseFloat(p) || 0);
    const subtotal  = allPrices.reduce((sum, p) => sum + p, 0);
    const pricing   = calculateSaleTotalAmount({
      items:                subtotal,
      discount:             currentDiscount,
      deliveryChargeToggle: currentDeliveryToggle,
      deliveryChargeAmount: currentDeliveryAmt,
    });

    // ── Update the sale row ──────────────────────────────────────────────────
    const updatedSaleObj: Record<string, string> = {};
    sRows[0].forEach((col, ci) => { updatedSaleObj[col.trim()] = saleRow[ci] ?? ''; });

    updatedSaleObj['Item(s) Name(s)']              = newItemNames;
    updatedSaleObj['Size(s) Chosen']               = newSizes;
    updatedSaleObj['Item Prices']                  = newItemPrices;
    updatedSaleObj['Total Number of Items Purchased'] = newTotalCount;
    updatedSaleObj['Total Amount']                 = String(pricing.grandTotal);
    updatedSaleObj['Updated At']                   = now;
    updatedSaleObj['Updated By']                   = admin.name;
    updatedSaleObj['Version']                      = String(currentVersion + 1);

    await updateRow('sales', saleRowIndex, formatRowFromHeaderMap(updatedSaleObj, sRows[0]));

    // ── Sales Log ────────────────────────────────────────────────────────────
    const addedSummary = items
      .map((i) => `${i.itemName} × ${i.qty} (Size ${i.size}) @ ${formatPrice(i.unitPrice)} each`)
      .join('; ');

    await recordSalesLog({
      module:               'Sales',
      operation:            'Update',
      relatedInvoiceNumber: id,
      message:              `Admin ${admin.name} added items to existing sale ${id}: ${addedSummary}. New order total: ${formatPrice(pricing.grandTotal)}.`,
      adminName:            admin.name,
    });

    return Response.json({
      success:     true,
      message:     `${addedNames.length} item(s) added to sale ${id}. New total: ${formatPrice(pricing.grandTotal)}.`,
      newTotal:    pricing.grandTotal,
      newItemCount: parseInt(newTotalCount, 10),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error(`[add-items] Invoice ${id}:`, message);
    return Response.json(
      { error: "Couldn't add items to sale. Check your connection and try again.", detail: message },
      { status: 500 }
    );
  }
}
