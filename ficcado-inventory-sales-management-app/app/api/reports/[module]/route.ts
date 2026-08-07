/**
 * app/api/reports/[module]/route.ts
 * GET — download Excel (.xlsx) report for a given module
 * Accepts optional ?from=YYYY-MM-DD&to=YYYY-MM-DD query params for date filtering
 */
import { requireAuth } from '@/lib/auth';
import { readAllRows } from '@/lib/google/moduleSheet';
import * as XLSX from 'xlsx';

export const dynamic = 'force-dynamic';

const MODULE_HEADERS: Record<string, string[]> = {
  items: ['S.No', 'Item Name', 'Item Type', 'Price', 'Available Sizes', 'Created By', 'Created At', 'Updated By', 'Updated At', 'Status'],
  inventory: ['S.No', 'Item Name', 'Size', 'Total Quantity Available', 'Added By', 'Updated At', 'Updated By', 'Created At'],
  warehouse: ['S.No', 'Warehouse Location', 'Handler Name', 'Item Name', 'Size', 'Quantity', 'Created By', 'Created At', 'Updated By', 'Updated At'],
  sales: ['S.No', 'Invoice Number', 'Sale Status', 'Customer Name', 'Customer Phone', 'Customer Address', 'Total Items', 'Item Names', 'Sizes Chosen', 'Item Prices', 'Total Amount', 'Payment Status', 'Mode of Payment', 'Transaction ID', 'Created At', 'Created By', 'Updated At', 'Updated By', 'Version', 'Delivery Status', 'Delivery Charge Toggle', 'Delivery Charge Amount', 'Fulfilment Status', 'Fulfilment Source', 'Sale Closed By', 'Discount', 'Customer Email'],
  replacement: ['S.No', 'Invoice Number', 'Total Items', 'Last Items', 'Last Sizes', 'New Items', 'New Sizes', 'Invoice Status', 'Disposition', 'Restock Destination', 'Created At', 'Created By', 'Updated At', 'Updated By', 'Version'],
  return_refund: ['S.No', 'Invoice Number', 'Verification Status', 'Refund Status', 'Refund Amount', 'Refund Completed At', 'Transaction ID', 'Mode of Refund', 'Disposition', 'Restock Destination', 'Created At', 'Created By', 'Updated At', 'Updated By'],
  customer_info: ['S.No', 'Customer Name', 'Phone Number', 'Address', 'Email ID', 'Total Orders', 'Invoice Numbers', 'Created At', 'Created By', 'Updated At', 'Updated By'],
  inventory_history: ['S.No', 'Item Name', 'Size', 'Quantity Change', 'Affected Sheet', 'Handler', 'Transaction Type', 'Related Invoice', 'Resulting Balance', 'Created By', 'Created At', 'Notes'],
  damaged_products: ['S.No', 'Invoice Number', 'Item Name', 'Size', 'Quantity', 'Customer Name', 'Reason Notes', 'Logged By', 'Logged At'],
  notes: ['S.No', 'Note Content', 'Created By', 'Created At', 'Updated By', 'Updated At'],
  activity_logs: ['S.No', 'Admin Name', 'Action', 'Module', 'Module Key', 'Record ID', 'Logged At', 'Message'],
};

const DISPLAY_NAMES: Record<string, string> = {
  items: 'Items Management',
  inventory: 'Inventory Management',
  warehouse: 'Warehouse Management',
  sales: 'Sales Management',
  replacement: 'Replacement Management',
  return_refund: 'Return & Refund Management',
  customer_info: 'Customer Information',
  inventory_history: 'Inventory History',
  damaged_products: 'Damaged Products',
  notes: 'Notes Management',
  activity_logs: 'Activity Logs',
};

export async function GET(request: Request, { params }: { params: Promise<{ module: string }> }) {
  const { module: moduleKey } = await params;
  try { await requireAuth(); } catch (e) { if (e instanceof Response) return e; return Response.json({ error: 'Auth required.' }, { status: 401 }); }

  if (!MODULE_HEADERS[moduleKey]) {
    return Response.json({ error: `Unknown module '${moduleKey}'. Valid modules: ${Object.keys(MODULE_HEADERS).join(', ')}.` }, { status: 400 });
  }

  try {
    const url = new URL(request.url);
    const from = url.searchParams.get('from');
    const to   = url.searchParams.get('to');

    const rows = await readAllRows(moduleKey);
    let dataRows = rows.slice(1); // skip header

    // Date filtering on the Created At column (index varies by module)
    const createdAtIdx: Record<string, number> = {
      items: 6,
      inventory: 7,
      warehouse: 7,
      sales: 13,
      replacement: 10,
      return_refund: 10,
      customer_info: 7,
      inventory_history: 10,
      damaged_products: 8,
      notes: 3,
      activity_logs: 6,
    };
    const dateCol = createdAtIdx[moduleKey];
    if (dateCol !== -1 && (from || to)) {
      dataRows = dataRows.filter((row) => {
        const dateStr = row[dateCol] || '';
        if (!dateStr) return true;
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return true;
        if (from && d < new Date(from + 'T00:00:00')) return false;
        if (to   && d > new Date(to   + 'T23:59:59')) return false;
        return true;
      });
    }

    // Build workbook
    const wb = XLSX.utils.book_new();
    const wsData = [MODULE_HEADERS[moduleKey], ...dataRows];
    const ws = XLSX.utils.aoa_to_sheet(wsData);

    // Style header row bold (xlsx-js-style not available; use colwidths for readability)
    const colWidths = MODULE_HEADERS[moduleKey].map((h) => ({ wch: Math.max(h.length + 2, 16) }));
    ws['!cols'] = colWidths;

    const sheetTitle = DISPLAY_NAMES[moduleKey] || moduleKey;
    XLSX.utils.book_append_sheet(wb, ws, sheetTitle.slice(0, 31)); // Excel tab max 31 chars

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    const dateStr = new Date().toISOString().split('T')[0];
    const filename = `Ficcado-${sheetTitle.replace(/\s+/g, '-')}-${dateStr}.xlsx`;

    return new Response(buf, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    return Response.json({ error: `Failed to generate report for '${moduleKey}'.`, detail: (err as Error).message }, { status: 500 });
  }
}
