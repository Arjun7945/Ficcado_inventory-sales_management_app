/**
 * app/api/reports/payment-transactions/route.ts
 *
 * Unified Payment Transactions Ledger API (Part 9 — Phase 87 & 88).
 * Derives PAY-#### (Sales payments) and REF-#### (Completed Return/Refund transactions)
 * into a single chronological ledger with live summary metrics and CSV export.
 */

import { getAuthSession } from '@/lib/auth';
import { readAllRows } from '@/lib/google/moduleSheet';
import { buildHeaderMap, getCellByHeader } from '@/lib/google/headerUtils';

export const dynamic = 'force-dynamic';

export interface PaymentTransactionItem {
  paymentId:        string;    // PAY-0001 or REF-0001
  type:             'sale' | 'refund';
  invoiceNumber:    string;    // FIC-####
  customerName:     string;
  customerPhone?:   string;
  orderDate:        string;    // ISO string
  orderAmount:      number;
  paymentMethod:    string;    // UPI, Card, Cash, Refund (UPI)...
  rawMode:          string;    // Cash, UPI, Card...
  transactionId:    string;    // — if blank
  paymentDate:      string;    // ISO string
  paymentStatus:    'Paid' | 'Refunded' | 'Pending';
  receivedBy:       string;
  remarks:          string;
  history:          Array<{
                      date:          string;
                      amount:        number;
                      method:        string;
                      transactionId: string;
                    }>;
}

export async function GET(request: Request) {
  const auth = await getAuthSession();
  if ('errorResponse' in auth) return auth.errorResponse;

  try {
    const { searchParams } = new URL(request.url);
    const statusFilter     = searchParams.get('status') || 'All'; // All, Paid, Refunded, Pending
    const methodFilter     = searchParams.get('paymentMethod') || 'All';
    const startDate        = searchParams.get('startDate');
    const endDate          = searchParams.get('endDate');
    const search           = (searchParams.get('search') || '').trim().toLowerCase();
    const format           = searchParams.get('format') || 'json';

    const [salesRows, retRows] = await Promise.all([
      readAllRows('sales'),
      readAllRows('return_refund'),
    ]);

    const transactions: PaymentTransactionItem[] = [];

    // ── 1. Derive PAY-#### records from Sales Management ────────────────────
    if (salesRows.length > 1) {
      const sMap = buildHeaderMap(salesRows[0]);
      let payCounter = 1;

      for (const row of salesRows.slice(1)) {
        const invNo = getCellByHeader(row, sMap, 'Invoice Number');
        if (!invNo) continue;

        const custName   = getCellByHeader(row, sMap, 'Customer Name');
        const custPhone  = getCellByHeader(row, sMap, 'Customer Phone Number');
        const totalAmt   = parseFloat(getCellByHeader(row, sMap, 'Total Amount', '0')) || 0;
        const pStatus    = getCellByHeader(row, sMap, 'Payment Status', 'Paid');
        const pMode      = getCellByHeader(row, sMap, 'Mode of Payment', 'Cash');
        const rawTxnId   = getCellByHeader(row, sMap, 'Transaction ID');
        const createdAt  = getCellByHeader(row, sMap, 'Created At') || new Date().toISOString();
        const createdBy  = getCellByHeader(row, sMap, 'Created By (Admin)');
        const recBy      = getCellByHeader(row, sMap, 'Received By') || (pStatus === 'Paid' ? createdBy : '');
        const remarks    = getCellByHeader(row, sMap, 'Remarks');

        const effectiveStatus: 'Paid' | 'Pending' = pStatus === 'Paid' ? 'Paid' : 'Pending';
        const displayTxn = (pMode !== 'Cash' && rawTxnId && rawTxnId !== 'N/A' && rawTxnId.trim())
          ? rawTxnId.trim()
          : '—';

        const payId = `PAY-${String(payCounter).padStart(4, '0')}`;
        payCounter++;

        transactions.push({
          paymentId:     payId,
          type:          'sale',
          invoiceNumber: invNo,
          customerName:  custName,
          customerPhone: custPhone,
          orderDate:     createdAt,
          orderAmount:   totalAmt,
          paymentMethod: pMode === 'N/A' ? 'Unspecified' : (pMode || 'Cash'),
          rawMode:       pMode,
          transactionId: displayTxn,
          paymentDate:   createdAt,
          paymentStatus: effectiveStatus,
          receivedBy:    recBy || createdBy || 'System',
          remarks:       remarks || '—',
          history: [
            {
              date:          createdAt,
              amount:        totalAmt,
              method:        pMode === 'N/A' ? 'Cash' : (pMode || 'Cash'),
              transactionId: displayTxn,
            },
          ],
        });
      }
    }

    // ── 2. Derive REF-#### records from Completed Return/Refund ─────────────
    if (retRows.length > 1) {
      const rMap = buildHeaderMap(retRows[0]);
      let refCounter = 1;

      for (const row of retRows.slice(1)) {
        const invNo   = getCellByHeader(row, rMap, 'Invoice Number');
        const rStatus = getCellByHeader(row, rMap, 'Refund Status');
        if (!invNo || (rStatus !== 'Completed' && rStatus !== 'Approved')) continue;

        const custName   = getCellByHeader(row, rMap, 'Customer Name') || 'Customer';
        const custPhone  = getCellByHeader(row, rMap, 'Customer Phone Number');
        const rawRef     = getCellByHeader(row, rMap, 'Refund Amount');
        const priceCharged = getCellByHeader(row, rMap, 'Price Charged (Returned Items)');
        let refAmt = parseFloat(rawRef.replace(/[^0-9.]/g, '')) || 0;
        if (refAmt === 0 && priceCharged) {
          const parts = priceCharged.split(',').map((p) => parseFloat(p.replace(/[^0-9.]/g, '')) || 0);
          refAmt = parts.reduce((a, b) => a + b, 0);
        }
        const mode       = getCellByHeader(row, rMap, 'Mode of Refund', 'Cash');
        const rawTxnId   = getCellByHeader(row, rMap, 'Transaction ID');
        const completedAt = getCellByHeader(row, rMap, 'Refund Completed Date & Time') || getCellByHeader(row, rMap, 'Created At');
        const closedBy   = getCellByHeader(row, rMap, 'Closed By') || getCellByHeader(row, rMap, 'Created By');
        const reason     = getCellByHeader(row, rMap, 'Reason for Return');

        const displayTxn = (mode !== 'Cash' && rawTxnId && rawTxnId !== 'N/A' && rawTxnId.trim())
          ? rawTxnId.trim()
          : '—';

        const refId = `REF-${String(refCounter).padStart(4, '0')}`;
        refCounter++;

        transactions.push({
          paymentId:     refId,
          type:          'refund',
          invoiceNumber: invNo,
          customerName:  custName,
          customerPhone: custPhone,
          orderDate:     completedAt,
          orderAmount:   refAmt,
          paymentMethod: `Refund (${mode || 'Cash'})`,
          rawMode:       mode,
          transactionId: displayTxn,
          paymentDate:   completedAt,
          paymentStatus: 'Refunded',
          receivedBy:    closedBy || 'System',
          remarks:       reason ? `Return Reason: ${reason}` : 'Completed Return & Refund',
          history: [
            {
              date:          completedAt,
              amount:        refAmt,
              method:        `Refund (${mode || 'Cash'})`,
              transactionId: displayTxn,
            },
          ],
        });
      }
    }

    // ── 3. Apply Filters ───────────────────────────────────────────────────
    let filtered = transactions;

    // Status filter
    if (statusFilter !== 'All') {
      filtered = filtered.filter((t) => t.paymentStatus.toLowerCase() === statusFilter.toLowerCase());
    }

    // Method filter
    if (methodFilter !== 'All') {
      filtered = filtered.filter((t) =>
        t.paymentMethod.toLowerCase().includes(methodFilter.toLowerCase()) ||
        t.rawMode.toLowerCase() === methodFilter.toLowerCase()
      );
    }

    // Date range filter
    if (startDate) {
      const startMs = new Date(startDate).getTime();
      filtered = filtered.filter((t) => new Date(t.paymentDate).getTime() >= startMs);
    }
    if (endDate) {
      const endMs = new Date(endDate).getTime() + 86400000 - 1; // end of day
      filtered = filtered.filter((t) => new Date(t.paymentDate).getTime() <= endMs);
    }

    // Search filter
    if (search) {
      filtered = filtered.filter((t) =>
        t.invoiceNumber.toLowerCase().includes(search) ||
        t.customerName.toLowerCase().includes(search) ||
        t.paymentId.toLowerCase().includes(search)
      );
    }

    // Sort newest first
    filtered.sort((a, b) => new Date(b.paymentDate).getTime() - new Date(a.paymentDate).getTime());

    // ── 4. Compute Live Summary Metrics ─────────────────────────────────────
    const totalCount = filtered.length;
    const countPaid     = filtered.filter((t) => t.paymentStatus === 'Paid').length;
    const countRefunded = filtered.filter((t) => t.paymentStatus === 'Refunded').length;
    const countPending  = filtered.filter((t) => t.paymentStatus === 'Pending').length;

    const paymentSummary = {
      totalCount,
      paid: { count: countPaid, pct: totalCount ? Math.round((countPaid / totalCount) * 100) : 0 },
      refunded: { count: countRefunded, pct: totalCount ? Math.round((countRefunded / totalCount) * 100) : 0 },
      pending: { count: countPending, pct: totalCount ? Math.round((countPending / totalCount) * 100) : 0 },
    };

    // Payment Method Summary breakdown
    const methodTotalsMap: Record<string, number> = {};
    let totalVolumeAmt = 0;

    filtered.forEach((t) => {
      const methodKey = t.paymentMethod || 'Other';
      methodTotalsMap[methodKey] = (methodTotalsMap[methodKey] || 0) + t.orderAmount;
      totalVolumeAmt += t.orderAmount;
    });

    const paymentMethodSummary = Object.entries(methodTotalsMap).map(([method, amount]) => ({
      method,
      amount,
      pct: totalVolumeAmt ? Math.round((amount / totalVolumeAmt) * 100) : 0,
    })).sort((a, b) => b.amount - a.amount);

    // ── 5. Return CSV or JSON ──────────────────────────────────────────────
    if (format === 'csv') {
      const csvHeaders = ['Payment ID', 'Invoice No.', 'Customer Name', 'Order Date', 'Amount (Rs)', 'Payment Method', 'Transaction ID', 'Payment Date', 'Payment Status', 'Received By', 'Remarks'];
      const csvRows = filtered.map((t) => [
        t.paymentId,
        t.invoiceNumber,
        `"${t.customerName.replace(/"/g, '""')}"`,
        t.orderDate,
        t.orderAmount,
        `"${t.paymentMethod}"`,
        `"${t.transactionId}"`,
        t.paymentDate,
        t.paymentStatus,
        `"${t.receivedBy}"`,
        `"${t.remarks.replace(/"/g, '""')}"`,
      ]);

      const csvContent = [csvHeaders.join(','), ...csvRows.map((r) => r.join(','))].join('\n');
      return new Response(csvContent, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': 'attachment; filename="ficcado_payment_transactions.csv"',
        },
      });
    }

    return Response.json({
      transactions: filtered,
      summary: {
        paymentSummary,
        paymentMethodSummary,
        totalVolumeAmount: totalVolumeAmt,
      },
    });

  } catch (err: any) {
    return Response.json({ error: 'Failed to generate payment transactions ledger.', detail: err?.message }, { status: 500 });
  }
}
