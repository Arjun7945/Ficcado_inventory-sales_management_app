/**
 * lib/inventoryHistory.ts
 *
 * Helper SDK for logging audit trail entries into the Inventory History Tracker sheet (moduleKey: 'inventory_history').
 * Every quantity change in Inventory or Warehouse writes a row here.
 */

import { appendRows } from './google/moduleSheet';

export interface InventoryHistoryRecord {
  itemName:             string;
  size:                 string;
  quantityChange:       number; // Signed number, e.g. -2 or +5
  affectedSheet:        'Inventory' | 'Warehouse';
  handler?:             string; // Admin name if Warehouse, blank if Inventory
  transactionType:      | 'Sale Deduction'
                        | 'Replacement — Old Item Restock'
                        | 'Replacement — New Item Deduction'
                        | 'Refund Restock'
                        | 'Warehouse Allocation'
                        | 'Warehouse Deallocation'
                        | 'Damaged Disposal'
                        | 'Manual Adjustment';
  relatedInvoiceNumber?: string;
  resultingBalance:     number;
  createdBy:            string;
  notes?:               string;
}

/**
 * Appends a row to the Inventory History Tracker sheet.
 * Silently catches errors if logging fails so primary operations aren't blocked,
 * but logs error details to console.
 */
export async function recordInventoryHistory(record: InventoryHistoryRecord): Promise<void> {
  try {
    const now = new Date().toISOString();
    const formattedQuantity = record.quantityChange > 0 ? `+${record.quantityChange}` : `${record.quantityChange}`;

    await appendRows('inventory_history', [
      [
        '', // S.No — auto calculated or blank
        record.itemName,
        record.size,
        formattedQuantity,
        record.affectedSheet,
        record.handler ?? '',
        record.transactionType,
        record.relatedInvoiceNumber ?? '',
        record.resultingBalance,
        now,
        record.createdBy,
        record.notes ?? '',
      ],
    ]);
  } catch (err) {
    console.error('[InventoryHistory] Failed to record history entry:', err, record);
  }
}
