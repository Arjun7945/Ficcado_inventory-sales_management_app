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

    // Today & Overall sales calculation
    let todaySales = 0;
    let todayRevenue = 0;
    let todayUnpaidRevenue = 0;
    let todayUnpaidSales = 0;
    let todayItemsSold = 0;

    let overallSales = 0;
    let overallRevenue = 0;
    let overallUnpaidRevenue = 0;
    let overallUnpaidSales = 0;

    if (salesRows.length > 0) {
      const sMap = buildHeaderMap(salesRows[0]);
      for (const row of salesRows.slice(1)) {
        const createdAt = getCellByHeader(row, sMap, 'Created At');
        const amountStr = getCellByHeader(row, sMap, 'Total Amount');
        const amount = parseFloat(amountStr.replace(/[^0-9.]/g, '')) || 0;
        const totalItemsCount = parseInt(getCellByHeader(row, sMap, 'Total Number of Items Purchased', '1'), 10) || 1;
        const paymentStatus = (getCellByHeader(row, sMap, 'Payment Status') || '').trim();
        const isPaid = paymentStatus.toLowerCase() === 'paid';

        overallSales++;
        if (isPaid) {
          overallRevenue += amount;
        } else {
          overallUnpaidRevenue += amount;
          overallUnpaidSales++;
        }

        if (createdAt) {
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
            todayItemsSold += totalItemsCount;
            if (isPaid) {
              todayRevenue += amount;
            } else {
              todayUnpaidRevenue += amount;
              todayUnpaidSales++;
            }
          }
        }
      }
    }

    // Total catalog items
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
    let pendingReplacementToday = 0;
    let totalPendingReplacements = 0;
    if (replacementRows.length > 0) {
      const repMap = buildHeaderMap(replacementRows[0]);
      for (const row of replacementRows.slice(1)) {
        const status = getCellByHeader(row, repMap, 'Invoice Status');
        const isPending = status.toLowerCase().includes('pending') || status.toLowerCase().includes('approved') || status.toLowerCase().includes('dispatched');
        if (isPending) {
          totalPendingReplacements++;
          const createdAt = getCellByHeader(row, repMap, 'Created At');
          if (createdAt && (createdAt.startsWith(todayISO) || createdAt.startsWith(todayLocal))) {
            pendingReplacementToday++;
          }
        }
      }
    }

    // Pending refunds
    let pendingRefundsToday = 0;
    let totalPendingRefunds = 0;
    if (refundRows.length > 0) {
      const refMap = buildHeaderMap(refundRows[0]);
      for (const row of refundRows.slice(1)) {
        const status = getCellByHeader(row, refMap, 'Refund Status');
        const isPending = status.toLowerCase().includes('pending') || status === '' || status === 'Approved';
        if (isPending) {
          totalPendingRefunds++;
          const createdAt = getCellByHeader(row, refMap, 'Created At');
          if (createdAt && (createdAt.startsWith(todayISO) || createdAt.startsWith(todayLocal))) {
            pendingRefundsToday++;
          }
        }
      }
    }

    return Response.json({
      stats: {
        todaySales,
        todayRevenue,
        todayUnpaidRevenue,
        todayUnpaidSales,
        todayItemsSold,
        totalItems,
        lowStockCount,
        pendingReplacement: pendingReplacementToday,
        pendingRefunds: pendingRefundsToday,
        overallSales,
        overallRevenue,
        overallUnpaidRevenue,
        overallUnpaidSales,
        totalPendingReplacements,
        totalPendingRefunds,
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
