/**
 * app/api/damaged-products/route.ts
 *
 * GET  /api/damaged-products — list all damaged product records
 * POST /api/damaged-products — add a manual damaged product entry
 */

import { requireAuth } from '@/lib/auth';
import { readAllRows, appendRows } from '@/lib/google/moduleSheet';
import { validate, DamagedProductSchema } from '@/lib/validation';
import { logActivity } from '@/lib/activityLogger';
import { recordInventoryHistory } from '@/lib/inventoryHistory';
import { recordSalesLog, formatItemListWithSummary } from '@/lib/salesLogger';

export const dynamic = 'force-dynamic';

const COL = {
  sno:           0,
  invoiceNumber: 1,
  itemName:      2,
  size:          3,
  quantity:      4,
  customerName:  5,
  reasonNotes:   6,
  createdAt:     7,
  createdBy:     8,
  updatedAt:     9,
  updatedBy:     10,
};

export async function GET() {
  try { await requireAuth(); }
  catch (e) { if (e instanceof Response) return e; return Response.json({ error: 'Authentication required.' }, { status: 401 }); }

  try {
    const rows = await readAllRows('damaged_products');
    const damagedProducts = rows.slice(1).map((row, i) => ({
      rowIndex:      i + 2,
      sno:           row[COL.sno]           ?? '',
      invoiceNumber: row[COL.invoiceNumber] ?? '',
      itemName:      row[COL.itemName]      ?? '',
      size:          row[COL.size]          ?? '',
      quantity:      parseInt(row[COL.quantity] ?? '0', 10) || 0,
      customerName:  row[COL.customerName]  ?? '',
      reasonNotes:   row[COL.reasonNotes]   ?? '',
      createdAt:     row[COL.createdAt]     ?? '',
      createdBy:     row[COL.createdBy]     ?? '',
      updatedAt:     row[COL.updatedAt]     ?? '',
      updatedBy:     row[COL.updatedBy]     ?? '',
    })).filter((d) => d.itemName);

    return Response.json({ damagedProducts: damagedProducts.reverse() });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return Response.json({ error: "Couldn't load damaged products.", detail: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  let admin;
  try { admin = await requireAuth(); }
  catch (e) { if (e instanceof Response) return e; return Response.json({ error: 'Authentication required.' }, { status: 401 }); }

  try {
    const body = await request.json();
    const { valid, data, errors } = validate(DamagedProductSchema, body);
    if (!valid) return Response.json({ error: 'Validation failed', errors }, { status: 400 });

    const { invoiceNumber, itemName, size, quantity, customerName, reasonNotes } = data!;
    const rows = await readAllRows('damaged_products');
    const sno = String(rows.length);
    const now = new Date().toISOString();

    await appendRows('damaged_products', [[
      sno,
      invoiceNumber ?? '',
      itemName,
      size,
      String(quantity),
      customerName ?? '',
      reasonNotes ?? 'Manual entry by admin',
      now,
      admin.name,
      now,
      admin.name,
    ]]);

    // Record Damaged Disposal audit trail entry
    await recordInventoryHistory({
      itemName,
      size,
      quantityChange: -quantity,
      affectedSheet: 'Inventory',
      transactionType: 'Damaged Disposal',
      relatedInvoiceNumber: invoiceNumber,
      resultingBalance: 0,
      createdBy: admin.name,
      notes: reasonNotes || 'Manual damaged product entry',
    });

    const logMsg = `${admin.name} logged ${quantity} piece(s) of ${itemName} (${size}) as damaged${invoiceNumber ? ` from invoice ${invoiceNumber}` : ''}.`;
    await logActivity({
      adminName: admin.name,
      action: 'created',
      module: 'Damaged Products Management',
      moduleKey: 'damaged_products',
      recordId: itemName,
    });

    const itemSummaryText = formatItemListWithSummary([{ itemName, size, qty: quantity }], false).itemText;
    const damagedSalesLogMsg = `Admin ${admin.name} logged damaged product(s): ${itemSummaryText}, linked to invoice ${invoiceNumber || 'N/A'} for customer ${customerName || 'N/A'}. This item arrived via direct manual entry. Notes: ${reasonNotes || 'None provided'}. Created at ${now}.`;

    await recordSalesLog({
      module: 'Damaged Products',
      operation: 'Create',
      relatedInvoiceNumber: invoiceNumber,
      message: damagedSalesLogMsg,
      adminName: admin.name,
    });

    return Response.json({ success: true, message: logMsg }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return Response.json({ error: "Couldn't create damaged product record.", detail: message }, { status: 500 });
  }
}
