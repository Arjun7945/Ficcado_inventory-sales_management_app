/**
 * app/api/inventory-history/route.ts
 * GET /api/inventory-history — list all audit trail records from Inventory History Tracker sheet
 */

import { requireAuth } from '@/lib/auth';
import { readAllRows } from '@/lib/google/moduleSheet';

export const dynamic = 'force-dynamic';

const COL = {
  sno:                  0,
  itemName:             1,
  size:                 2,
  quantityChange:       3,
  affectedSheet:        4,
  handler:              5,
  transactionType:      6,
  relatedInvoiceNumber: 7,
  resultingBalance:     8,
  createdAt:            9,
  createdBy:            10,
  notes:                11,
};

export async function GET() {
  try { await requireAuth(); }
  catch (e) { if (e instanceof Response) return e; return Response.json({ error: 'Authentication required.' }, { status: 401 }); }

  try {
    const rows = await readAllRows('inventory_history');
    const history = rows.slice(1).map((row, i) => ({
      rowIndex:             i + 2,
      sno:                  row[COL.sno]                  ?? String(i + 1),
      itemName:             row[COL.itemName]             ?? '',
      size:                 row[COL.size]                 ?? '',
      quantityChange:       row[COL.quantityChange]       ?? '0',
      affectedSheet:        row[COL.affectedSheet]        ?? 'Inventory',
      handler:              row[COL.handler]              ?? '',
      transactionType:      row[COL.transactionType]      ?? 'Manual Adjustment',
      relatedInvoiceNumber: row[COL.relatedInvoiceNumber] ?? '',
      resultingBalance:     row[COL.resultingBalance]     ?? '0',
      createdAt:            row[COL.createdAt]            ?? '',
      createdBy:            row[COL.createdBy]            ?? '',
      notes:                row[COL.notes]                ?? '',
    })).filter((h) => h.itemName);

    return Response.json({ history });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return Response.json({ error: "Couldn't load inventory history.", detail: message }, { status: 500 });
  }
}
