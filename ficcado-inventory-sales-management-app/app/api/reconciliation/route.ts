/**
 * app/api/reconciliation/route.ts
 *
 * GET /api/reconciliation
 * Dedicated API endpoint for Inventory vs. Warehouse Stock Reconciliation.
 * Compares total main inventory stock against allocated warehouse stock per item+size.
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

    // Parse Main Inventory stock: key -> { itemName, size, qty }
    const invMap: Record<string, { itemName: string; size: string; qty: number }> = {};
    for (const r of invRows.slice(1)) {
      const name = (r[COL_INV.itemName] ?? '').trim();
      const size = (r[COL_INV.size]     ?? '').trim();
      const qty  = parseInt(r[COL_INV.qty] ?? '0', 10) || 0;
      if (name && size) {
        const normKey = `${name.toLowerCase()}:${size.toUpperCase()}`;
        if (!invMap[normKey]) {
          invMap[normKey] = { itemName: name, size: size.toUpperCase(), qty: 0 };
        }
        invMap[normKey].qty += qty;
      }
    }

    // Parse Warehouse allocations: key -> total allocated qty
    const wMap: Record<string, { itemName: string; size: string; qty: number }> = {};
    for (const r of wRows.slice(1)) {
      const name = (r[COL_W.itemName] ?? '').trim();
      const size = (r[COL_W.size]     ?? '').trim();
      const qty  = parseInt(r[COL_W.qty] ?? '0', 10) || 0;
      if (name && size) {
        const normKey = `${name.toLowerCase()}:${size.toUpperCase()}`;
        if (!wMap[normKey]) {
          wMap[normKey] = { itemName: name, size: size.toUpperCase(), qty: 0 };
        }
        wMap[normKey].qty += qty;
      }
    }

    // Combine all unique keys from BOTH inventory and warehouse sheets
    const allKeys = new Set([...Object.keys(invMap), ...Object.keys(wMap)]);

    const recon = Array.from(allKeys).map((normKey) => {
      const invObj = invMap[normKey];
      const wObj   = wMap[normKey];

      const itemName = invObj?.itemName || wObj?.itemName || '';
      const size     = invObj?.size     || wObj?.size     || '';
      const inventoryTotal = invObj?.qty || 0;
      const warehouseTotal = wObj?.qty   || 0;
      const difference     = inventoryTotal - warehouseTotal;
      const mismatch       = warehouseTotal > inventoryTotal; // Over-allocated beyond main inventory

      return {
        itemName,
        size,
        inventoryTotal,
        warehouseTotal,
        difference,
        mismatch,
      };
    }).sort((a, b) => a.itemName.localeCompare(b.itemName) || a.size.localeCompare(b.size));

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
