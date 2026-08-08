/**
 * app/api/dashboard/stats/route.ts
 * GET /api/dashboard/stats
 * Returns today's sales count, revenue, total items, low stock count,
 * pending replacements, and pending refunds.
 * Refactored with getAuthSession and position-independent header mapping.
 */

import { getAuthSession } from '@/lib/auth';
import { readAllRows } from '@/lib/google/moduleSheet';
import { buildHeaderMap, getCellByHeader } from '@/lib/google/headerUtils';

export const dynamic = 'force-dynamic';

async function safeRead(moduleKey: string): Promise<string[][]> {
  try {
    return await readAllRows(moduleKey);
  } catch {
    return [];
  }
}

export async function GET() {
  const auth = await getAuthSession();
  if ('errorResponse' in auth) return auth.errorResponse;

  try {
    const now = new Date();
    const todayISO = now.toISOString().slice(0, 10); // YYYY-MM-DD
    const todayLocal = now.toLocaleDateString('en-CA'); // YYYY-MM-DD local

    const [salesRows, itemsRows, inventoryRows, replacementRows, refundRows] = await Promise.all([
      safeRead('sales'),
      safeRead('items'),
      safeRead('inventory'),
      safeRead('replacement'),
      safeRead('return_refund'),
    ]);

    // Today's sales & revenue calculation
    let todaySales = 0;
    let todayRevenue = 0;

    if (salesRows.length > 0) {
      const sMap = buildHeaderMap(salesRows[0]);
      for (const row of salesRows.slice(1)) {
        const createdAt = getCellByHeader(row, sMap, 'Created At');
        if (!createdAt) continue;

        let isToday = false;
        if (createdAt.startsWith(todayISO) || createdAt.startsWith(todayLocal)) {
          isToday = true;
        } else {
          const dateObj = new Date(createdAt);
          if (!isNaN(dateObj.getTime())) {
            const isoDate = dateObj.toISOString().slice(0, 10);
            const localDate = dateObj.toLocaleDateString('en-CA');
            if (isoDate === todayISO || localDate === todayLocal) {
              isToday = true;
            }
          }
        }

        if (isToday) {
          todaySales++;
          const amountStr = getCellByHeader(row, sMap, 'Total Amount');
          const amount = parseFloat(amountStr.replace(/[^0-9.]/g, '')) || 0;
          todayRevenue += amount;
        }
      }
    }

    // Total items
    const totalItems = Math.max(0, itemsRows.length - 1);

    // Low stock (quantity == 0 in inventory)
    let lowStockCount = 0;
    if (inventoryRows.length > 0) {
      const invMap = buildHeaderMap(inventoryRows[0]);
      for (const row of inventoryRows.slice(1)) {
        const qtyStr = getCellByHeader(row, invMap, 'Total Quantity Available', '0');
        const qty = parseInt(qtyStr, 10);
        if (!isNaN(qty) && qty === 0) lowStockCount++;
      }
    }

    // Pending replacements
    let pendingReplacement = 0;
    if (replacementRows.length > 0) {
      const repMap = buildHeaderMap(replacementRows[0]);
      for (const row of replacementRows.slice(1)) {
        const status = getCellByHeader(row, repMap, 'Invoice Status');
        if (status.toLowerCase().includes('pending') || status.toLowerCase().includes('approved') || status.toLowerCase().includes('dispatched')) {
          pendingReplacement++;
        }
      }
    }

    // Pending refunds
    let pendingRefunds = 0;
    if (refundRows.length > 0) {
      const refMap = buildHeaderMap(refundRows[0]);
      for (const row of refundRows.slice(1)) {
        const status = getCellByHeader(row, refMap, 'Refund Status');
        if (status.toLowerCase().includes('pending') || status === '') {
          pendingRefunds++;
        }
      }
    }

    return Response.json({
      stats: {
        todaySales,
        todayRevenue,
        totalItems,
        lowStockCount,
        pendingReplacement,
        pendingRefunds,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return Response.json(
      { error: "Couldn't load dashboard stats.", detail: message },
      { status: 500 }
    );
  }
}
