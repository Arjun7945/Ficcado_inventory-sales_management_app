/**
 * app/api/reconciliation/route.ts
 *
 * GET /api/reconciliation
 * Dedicated API endpoint for Inventory vs. Warehouse Stock Reconciliation.
 * Position-independent header mapping.
 */

import { requireAuth } from '@/lib/auth';
import { readAllRows } from '@/lib/google/moduleSheet';
import { buildHeaderMap, getCellByHeader } from '@/lib/google/headerUtils';

export const dynamic = 'force-dynamic';

export async function GET() {
  try { await requireAuth(); }
  catch (e) { if (e instanceof Response) return e; return Response.json({ error: 'Authentication required.' }, { status: 401 }); }

  try {
    const [invRows, wRows] = await Promise.all([
      readAllRows('inventory'),
      readAllRows('warehouse'),
    ]);

    const invHeaderMap = buildHeaderMap(invRows[0] ?? []);
    const wHeaderMap   = buildHeaderMap(wRows[0] ?? []);

    // Parse Main Inventory stock: key -> { itemName, size, qty }
    const invMap: Record<string, { itemName: string; size: string; qty: number }> = {};
    for (const r of invRows.slice(1)) {
      const name = getCellByHeader(r, invHeaderMap, 'Item Name').trim();
      const size = getCellByHeader(r, invHeaderMap, 'Size').trim();
      const qty  = parseInt(getCellByHeader(r, invHeaderMap, 'Total Quantity Available', getCellByHeader(r, invHeaderMap, 'Quantity', '0')), 10) || 0;
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
      const name = getCellByHeader(r, wHeaderMap, 'Item Name').trim();
      const size = getCellByHeader(r, wHeaderMap, 'Size').trim();
      const qty  = parseInt(getCellByHeader(r, wHeaderMap, 'Quantity', '0'), 10) || 0;
      if (name && size) {
        const normKey = `${name.toLowerCase()}:${size.toUpperCase()}`;
        if (!wMap[normKey]) {
          wMap[normKey] = { itemName: name, size: size.toUpperCase(), qty: 0 };
        }
        wMap[normKey].qty += qty;
      }
    }

    const allKeys = new Set([...Object.keys(invMap), ...Object.keys(wMap)]);

    const recon = Array.from(allKeys).map((normKey) => {
      const invObj = invMap[normKey];
      const wObj   = wMap[normKey];

      const itemName = invObj?.itemName || wObj?.itemName || '';
      const size     = invObj?.size     || wObj?.size     || '';
      const inventoryTotal = invObj?.qty || 0;
      const warehouseTotal = wObj?.qty   || 0;
      const difference     = inventoryTotal - warehouseTotal;
      const mismatch       = warehouseTotal > inventoryTotal;

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
