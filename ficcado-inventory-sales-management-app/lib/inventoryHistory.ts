/**
 * lib/inventoryHistory.ts
 *
 * Helper SDK for logging audit trail entries into the Inventory History Tracker sheet (moduleKey: 'inventory_history').
 * Every quantity change in Inventory or Warehouse writes a row here.
 *
 * Header-mapped & Auto-Header synced formatting.
 */

import { appendRows, readAllRows, updateRow } from './google/moduleSheet';
import { formatRowFromHeaderMap } from './google/headerUtils';
import { MODULE_REGISTRY } from './google/moduleRegistry';

export interface InventoryHistoryRecord {
  itemName:             string;
  size:                 string;
  quantityChange:       number; // Signed number, e.g. -2 or +5
  affectedSheet:        'Inventory' | 'Warehouse';
  handler?:             string; // Admin name if Warehouse, blank if Inventory
  transactionType:      | 'Sale Deduction'
                        | 'Sale Addition'
                        | 'Replacement — Old Item Restock'
                        | 'Replacement — New Item Deduction'
                        | 'Refund Restock'
                        | 'Warehouse Allocation'
                        | 'Warehouse Deallocation'
                        | 'Damaged Disposal'
                        | 'Manual Adjustment';
  relatedInvoiceNumber?: string;
  resultingBalance?:    number | string;
  createdBy:            string;
  notes?:               string;
}

const EXPECTED_HEADERS = MODULE_REGISTRY.inventory_history.headers;

export async function recordInventoryHistory(record: InventoryHistoryRecord): Promise<void> {
  try {
    const now = new Date().toISOString();
    const formattedQuantity = record.quantityChange > 0 ? `+${record.quantityChange}` : `${record.quantityChange}`;

    const rows = await readAllRows('inventory_history').catch(() => []);
    if (rows.length === 0 || (rows[0] && rows[0].length < EXPECTED_HEADERS.length)) {
      await updateRow('inventory_history', 1, EXPECTED_HEADERS).catch(() => {});
    }

    const sno = String(Math.max(rows.length - 1, 0) + 1);

    const resultingBalanceVal = record.transactionType === 'Damaged Disposal'
      ? 'N/A — sent to Damaged Products, no Inventory/Warehouse change'
      : String(record.resultingBalance ?? '');

    const historyObj = {
      'S.No':                   sno,
      'Item Name':              record.itemName,
      'Size':                   record.size,
      'Quantity Change':        formattedQuantity,
      'Affected Sheet':         record.affectedSheet,
      'Handler (if Warehouse)': record.handler ?? '',
      'Transaction Type':       record.transactionType,
      'Related Invoice Number': record.relatedInvoiceNumber ?? '',
      'Resulting Balance':      resultingBalanceVal,
      'Created At':             now,
      'Created By':             record.createdBy,
      'Notes':                  record.notes ?? '',
    };

    const newRow = formatRowFromHeaderMap(historyObj, EXPECTED_HEADERS);
    await appendRows('inventory_history', [newRow]);
  } catch (err) {
    console.error('[InventoryHistory] Failed to record history entry:', err, record);
  }
}
