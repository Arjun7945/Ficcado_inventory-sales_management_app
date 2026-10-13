/**
 * app/api/inventory-history/route.ts
 *
 * GET /api/inventory-history — list audit trail records from Inventory History Tracker sheet.
 *
 * Phase 63: Supports ?page=N&pageSize=50 (server-side paginated, newest-first).
 * Backward-compatible: no page param = full read for internal callers.
 */

import { requireAuth } from '@/lib/auth';
import { readAllRows, readRowsPage } from '@/lib/google/moduleSheet';

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

function rowToRecord(row: string[], i: number) {
  return {
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
  };
}

export async function GET(request: Request) {
  try { await requireAuth(); }
  catch (e) { if (e instanceof Response) return e; return Response.json({ error: 'Authentication required.' }, { status: 401 }); }

  try {
    const { searchParams } = new URL(request.url);
    const pageParam     = searchParams.get('page');
    const pageSizeParam = searchParams.get('pageSize');
    const itemFilter    = searchParams.get('item')?.toLowerCase();

    // ── Phase 63: Paginated mode (newest-first) ───────────────────────────────
    if (pageParam && !itemFilter) {
      const page     = Math.max(1, parseInt(pageParam, 10) || 1);
      const pageSize = Math.min(200, Math.max(1, parseInt(pageSizeParam ?? '50', 10) || 50));

      const paged = await readRowsPage('inventory_history', page, pageSize, /* fromEnd= */ true);
      const history = paged.rows
        .map((row, i) => rowToRecord(row, (page - 1) * pageSize + i))
        .filter((h) => h.itemName);

      return Response.json({
        history,
        pagination: {
          page:       paged.page,
          pageSize:   paged.pageSize,
          total:      paged.total,
          totalPages: paged.totalPages,
        },
      });
    }

    // ── Full-read path (filtered queries or internal callers) ─────────────────
    const rows = await readAllRows('inventory_history');
    let history = rows.slice(1).map((row, i) => rowToRecord(row, i)).filter((h) => h.itemName);

    if (itemFilter) {
      history = history.filter((h) => h.itemName.toLowerCase().includes(itemFilter));
    }

    // Newest first for full reads too
    history.reverse();

    return Response.json({ history });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return Response.json({ error: "Couldn't load inventory history.", detail: message }, { status: 500 });
  }
}
