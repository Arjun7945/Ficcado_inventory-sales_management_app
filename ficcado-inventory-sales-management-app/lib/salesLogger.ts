/**
 * lib/salesLogger.ts
 *
 * Dedicated narrative audit log for Sales Log sheet (`sales_log`).
 * Captures detailed Create, Update, and Delete operations across:
 * - Items Management
 * - Sales Management
 * - Replacement Management
 * - Return/Refund Management
 * - Damaged Products
 *
 * Adheres strictly to Part 5 Section 3.A General Rules and narrative message templates.
 */

import { readAllRows, appendRows } from '@/lib/google/moduleSheet';
import { formatRowFromHeaderMap } from '@/lib/google/headerUtils';

export interface SalesLogEntryInput {
  module: 'Items' | 'Sales' | 'Replacement' | 'Return/Refund' | 'Damaged Products';
  operation: 'Create' | 'Update' | 'Delete';
  relatedInvoiceNumber?: string; // Optional for Items or direct actions
  message: string;
  adminName: string;
}

/**
 * Record a narrative log entry into the `sales_log` sheet.
 * Fails gracefully (logs console error) so main business logic is never blocked.
 */
export async function recordSalesLog(input: SalesLogEntryInput): Promise<void> {
  try {
    const { module, operation, relatedInvoiceNumber = '', message, adminName } = input;
    const rows = await readAllRows('sales_log');
    const headerRow = rows[0] || [
      'S.No', 'Module', 'Operation', 'Related Invoice Number',
      'Log Message', 'Created At', 'Created By', 'Updated At', 'Updated By'
    ];

    const sno = String(rows.length);
    const now = new Date().toISOString();

    const logObj: Record<string, string> = {
      'S.No':                   sno,
      'Module':                 module,
      'Operation':              operation,
      'Related Invoice Number': relatedInvoiceNumber,
      'Log Message':            message,
      'Created At':             now,
      'Created By':             adminName,
      'Updated At':             now,
      'Updated By':             adminName,
    };

    await appendRows('sales_log', [formatRowFromHeaderMap(logObj, headerRow)]);
  } catch (err) {
    console.error('[recordSalesLog] Failed to record sales log:', err);
  }
}

/** Helper formatters for narrative log messages */

export function formatPrice(val: number | string): string {
  const num = typeof val === 'number' ? val : (parseFloat(String(val)) || 0);
  return `Rs: ${num.toLocaleString('en-IN')}`;
}

export function formatStockLocation(loc?: string): string {
  if (!loc || loc === 'Take from Inventory' || loc === 'Main Inventory' || loc === 'Inventory Only') {
    return 'Main Inventory (Unassigned Main Stock)';
  }
  if (loc.includes('warehouse') || loc.includes("'s warehouse")) {
    return loc;
  }
  return `${loc}'s warehouse`;
}

export interface ItemLineForLog {
  itemName: string;
  size: string;
  unitPrice?: number;
  qty: number;
}

/**
 * Groups raw item objects by name, size, and price into aggregated ItemLineForLog entries with total quantities.
 */
export function groupItemLines(rawItems: any[]): ItemLineForLog[] {
  const map = new Map<string, ItemLineForLog>();
  for (const item of rawItems) {
    const name = (item.itemName ?? item.name ?? '').trim();
    const sz = (item.size ?? 'M').trim();
    const q = parseInt(item.qty ?? item.quantity ?? '1', 10) || 1;
    const pr = parseFloat(item.unitPrice ?? item.price ?? '0') || 0;
    if (!name) continue;

    const key = `${name.toLowerCase()}:${sz.toLowerCase()}:${pr}`;
    const existing = map.get(key);
    if (existing) {
      existing.qty += q;
    } else {
      map.set(key, { itemName: name, size: sz, unitPrice: pr, qty: q });
    }
  }
  return Array.from(map.values());
}

/**
 * Parses comma-separated string columns into aggregated ItemLineForLog entries.
 */
export function parseAndGroupCommaSeparatedItems(
  itemNamesStr = '',
  sizesStr = '',
  pricesStr = '',
  quantitiesStr = ''
): ItemLineForLog[] {
  const names = (itemNamesStr || '').split(',').map((n) => n.trim()).filter(Boolean);
  const sizes = (sizesStr || '').split(',').map((s) => s.trim()).filter(Boolean);
  const prices = (pricesStr || '').split(',').map((p) => parseFloat(p.trim()) || 0);
  const qtys = (quantitiesStr || '').split(',').map((q) => parseInt(q.trim(), 10) || 1);

  const raw: any[] = [];
  for (let i = 0; i < names.length; i++) {
    raw.push({
      itemName: names[i],
      size: sizes[i] ?? sizes[0] ?? 'M',
      unitPrice: prices[i] ?? (prices.length === 1 ? prices[0] : 0),
      qty: qtys[i] ?? 1,
    });
  }

  return groupItemLines(raw);
}

/**
 * Formats a list of item lines with (Qty: N) and appends "so in total X items and Y pieces".
 * Example:
 * "camera- blue (S) (Rs: 350) (Qty: 1), maharajas- black (S) (Rs: 500) (Qty: 1) so in total 2 items and 2 pieces"
 */
export function formatItemListWithSummary(
  items: ItemLineForLog[],
  includePrice = true
): { itemText: string; totalItems: number; totalPieces: number } {
  if (items.length === 0) {
    return { itemText: 'None so in total 0 items and 0 pieces', totalItems: 0, totalPieces: 0 };
  }

  const formattedLines = items.map((it) => {
    const priceStr = includePrice && it.unitPrice !== undefined && it.unitPrice > 0
      ? ` (${formatPrice(it.unitPrice)})`
      : '';
    return `${it.itemName} (${it.size})${priceStr} (Qty: ${it.qty})`;
  });

  const totalItems = items.length;
  const totalPieces = items.reduce((sum, it) => sum + (it.qty || 1), 0);

  const itemText = `${formattedLines.join(', ')} so in total ${totalItems} items and ${totalPieces} pieces`;
  return { itemText, totalItems, totalPieces };
}
