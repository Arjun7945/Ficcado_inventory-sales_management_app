/**
 * app/api/reconciliation/route.ts
 *
 * GET /api/reconciliation
 * Dedicated API endpoint for Inventory vs. Warehouse Stock Reconciliation.
 * Compares total unassigned main inventory stock against allocated warehouse stock per item+size.
 */

import { requireAuth } from '@/lib/auth';
import { readAllRows } from '@/lib/google/moduleSheet';

export const dynamic = 'force-dynamic';

const COL_INV = { itemName: 1, size: 2, qty: 3 };
const COL_W   = { itemName: 3, size: 4, qty: 5 };

export async function GET() {
  try { await requireAuth(); }
  catch (e) { if (e instanceof Response) return e; return Response.json({ error: 'Authentication required.' }, { status: 401 }); }

  try {
    const [invRows, wRows] = await Promise.all([
      readAllRows('inventory'),
      readAllRows('warehouse'),
    ]);

    const invItems = invRows.slice(1).map((r) => ({
      itemName: (r[COL_INV.itemName] ?? '').trim(),
      size:     (r[COL_INV.size]     ?? '').trim(),
      qty:      parseInt(r[COL_INV.qty] ?? '0', 10) || 0,
    })).filter((i) => i.itemName);

    const wItems = wRows.slice(1).map((r) => ({
      itemName: (r[COL_W.itemName] ?? '').trim(),
      size:     (r[COL_W.size]     ?? '').trim(),
      qty:      parseInt(r[COL_W.qty] ?? '0', 10) || 0,
    })).filter((w) => w.itemName);

    // Aggregate warehouse qty by item+size
    const wMap: Record<string, number> = {};
    for (const w of wItems) {
      const key = `${w.itemName.toLowerCase()}:${w.size.toUpperCase()}`;
      wMap[key] = (wMap[key] || 0) + w.qty;
    }

    // Build reconciliation list
    const recon = invItems.map((inv) => {
      const key = `${inv.itemName.toLowerCase()}:${inv.size.toUpperCase()}`;
      const warehouseQty = wMap[key] || 0;
      const difference = inv.qty - warehouseQty;
      const mismatch = warehouseQty > inv.qty; // Warehouse allocated exceeds main inventory total

      return {
        itemName:       inv.itemName,
        size:           inv.size,
        inventoryTotal: inv.qty,
        warehouseTotal: warehouseQty,
        difference,
        mismatch,
      };
    });

    const totalTracked    = recon.length;
    const totalReconciled = recon.filter((r) => !r.mismatch).length;
    const totalMismatches = recon.filter((r) => r.mismatch).length;

    return Response.json({
      recon,
      stats: {
        totalTracked,
        totalReconciled,
        totalMismatches,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return Response.json({ error: "Couldn't load reconciliation data.", detail: message }, { status: 500 });
  }
}
