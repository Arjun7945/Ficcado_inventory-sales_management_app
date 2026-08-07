/**
 * app/api/dashboard/stats/route.ts
 * GET /api/dashboard/stats
 * Returns today's sales count, revenue, total items, low stock count,
 * pending replacements, and pending refunds.
 */

import { requireAuth } from '@/lib/auth';
import { readAllRows } from '@/lib/google/moduleSheet';

export const dynamic = 'force-dynamic';

const SALES_COL = { saleDate: 14, totalAmount: 10, saleStatus: 2 };       // Created At (Col O / Index 14), Total Amount (Col K / Index 10), Sale Status (Col C / Index 2)
const REPLACEMENT_COL = { invoiceStatus: 7 };
const RETURN_COL = { refundStatus: 3 };
const INVENTORY_COL = { quantity: 3 }; // Total Quantity Available

async function safeRead(moduleKey: string): Promise<string[][]> {
  try {
    return await readAllRows(moduleKey);
  } catch {
    return [];
  }
}

export async function GET() {
  try {
    await requireAuth();
  } catch (authErr) {
    if (authErr instanceof Response) return authErr;
    return Response.json({ error: 'Authentication required.' }, { status: 401 });
  }

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
    for (const row of salesRows.slice(1)) {
      const createdAt = (row[SALES_COL.saleDate] ?? '').trim();
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
        const amount = parseFloat((row[SALES_COL.totalAmount] ?? '0').replace(/[^0-9.]/g, ''));
        if (!isNaN(amount)) todayRevenue += amount;
      }
    }

    // Total items
    const totalItems = Math.max(0, itemsRows.length - 1);

    // Low stock (quantity == 0 in inventory)
    let lowStockCount = 0;
    for (const row of inventoryRows.slice(1)) {
      const qty = parseInt(row[INVENTORY_COL.quantity] ?? '0', 10);
      if (!isNaN(qty) && qty === 0) lowStockCount++;
    }

    // Pending replacements
    let pendingReplacement = 0;
    for (const row of replacementRows.slice(1)) {
      if ((row[REPLACEMENT_COL.invoiceStatus] ?? '').toLowerCase().includes('pending')) {
        pendingReplacement++;
      }
    }

    // Pending refunds
    let pendingRefunds = 0;
    for (const row of refundRows.slice(1)) {
      const status = row[RETURN_COL.refundStatus] ?? '';
      if (status.toLowerCase().includes('pending') || status.toLowerCase() === '') {
        pendingRefunds++;
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
      { error: "Couldn't load dashboard stats. Some sheets may not be configured yet.", detail: message },
      { status: 500 }
    );
  }
}
