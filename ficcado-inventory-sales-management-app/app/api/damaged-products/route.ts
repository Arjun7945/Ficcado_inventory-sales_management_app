/**
 * app/api/damaged-products/route.ts
 *
 * GET  /api/damaged-products — list all damaged product records (header-mapped)
 * POST /api/damaged-products — add a manual damaged product entry (header-mapped)
 */

import { requireAuth } from '@/lib/auth';
import { readAllRows, appendRows, updateRow } from '@/lib/google/moduleSheet';
import { buildHeaderMap, getCellByHeader, formatRowFromHeaderMap } from '@/lib/google/headerUtils';
import { validate, DamagedProductSchema } from '@/lib/validation';
import { logActivity } from '@/lib/activityLogger';
import { recordInventoryHistory } from '@/lib/inventoryHistory';
import { recordSalesLog, formatItemListWithSummary } from '@/lib/salesLogger';
import { MODULE_REGISTRY } from '@/lib/google/moduleRegistry';

export const dynamic = 'force-dynamic';

const EXPECTED_HEADERS = MODULE_REGISTRY.damaged_products.headers;

export async function GET() {
  try { await requireAuth(); }
  catch (e) { if (e instanceof Response) return e; return Response.json({ error: 'Authentication required.' }, { status: 401 }); }

  try {
    const rows = await readAllRows('damaged_products');
    if (rows.length === 0) {
      await updateRow('damaged_products', 1, EXPECTED_HEADERS).catch(() => {});
      return Response.json({ damagedProducts: [] });
    }

    if (rows[0] && rows[0].length < EXPECTED_HEADERS.length) {
      await updateRow('damaged_products', 1, EXPECTED_HEADERS).catch(() => {});
    }

    const headerMap = buildHeaderMap(rows[0]);
    const damagedProducts = rows.slice(1).map((row, i) => ({
      rowIndex:      i + 2,
      sno:           getCellByHeader(row, headerMap, 'S.No') || String(i + 1),
      invoiceNumber: getCellByHeader(row, headerMap, 'Invoice Number'),
      itemName:      getCellByHeader(row, headerMap, 'Item Name'),
      size:          getCellByHeader(row, headerMap, 'Size'),
      quantity:      parseInt(getCellByHeader(row, headerMap, 'Quantity', '0'), 10) || 0,
      customerName:  getCellByHeader(row, headerMap, 'Customer Name'),
      reasonNotes:   getCellByHeader(row, headerMap, 'Reason/Notes'),
      createdAt:     getCellByHeader(row, headerMap, 'Created At'),
      createdBy:     getCellByHeader(row, headerMap, 'Created By'),
      updatedAt:     getCellByHeader(row, headerMap, 'Updated At'),
      updatedBy:     getCellByHeader(row, headerMap, 'Updated By'),
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
    if (rows.length === 0 || (rows[0] && rows[0].length < EXPECTED_HEADERS.length)) {
      await updateRow('damaged_products', 1, EXPECTED_HEADERS).catch(() => {});
    }

    const sno = String(Math.max(rows.length - 1, 0) + 1);
    const now = new Date().toISOString();

    const damagedObj = {
      'S.No':           sno,
      'Invoice Number': invoiceNumber ?? '',
      'Item Name':      itemName,
      'Size':           size,
      'Quantity':       String(quantity),
      'Customer Name':  customerName ?? '',
      'Reason/Notes':   reasonNotes ?? 'Manual entry by admin',
      'Created At':     now,
      'Created By':     admin.name,
      'Updated At':     now,
      'Updated By':     admin.name,
    };

    const newRow = formatRowFromHeaderMap(damagedObj, EXPECTED_HEADERS);
    await appendRows('damaged_products', [newRow]);

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

    return Response.json({ success: true, message: 'Damaged product recorded.' }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return Response.json({ error: "Couldn't record damaged product.", detail: message }, { status: 500 });
  }
}
