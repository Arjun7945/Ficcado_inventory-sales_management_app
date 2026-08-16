'use client';

/**
 * app/(app)/dashboard/reports/profitability/page.tsx
 *
 * Profitability & Payment Transactions Page (Phases 86–88 — B7 & Part 9 B1-B2).
 *
 * User Customizations:
 * 1. Default section is ALWAYS "Payment Transactions".
 * 2. Clicking Invoice Number opens `/dashboard/sales/[id]` (the manage/edit page).
 * 3. The Financial KPI Summary section (Timeframe selector + Net Profit, Revenue, COGS, Expenses, Vendor Payments, Unpaid Dues cards)
 *    is rendered prominently at the top for Payment Transactions as well.
 */

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import LoadingGecko from '@/components/LoadingGecko';
import ErrorMessage, { parseApiError } from '@/components/ErrorMessage';
import { formatISTDateTime } from '@/lib/dateUtils';

interface ItemBreakdown {
  itemName:     string;
  quantitySold: number;
  revenue:      number;
  cogs:         number;
  grossProfit:  number;
}

interface ReportSummary {
  paidRevenue:          number;
  unpaidDues:           number;
  totalSalesCount:      number;
  paidSalesCount:       number;
  cogs:                 number;
  grossProfit:          number;
  grossMarginPct:       number;
  operationalExpenses:  number;
  vendorPayments:       number;
  totalExpenses:        number;
  netProfit:            number;
  netMarginPct:         number;
}

interface PaymentTxn {
  paymentId:     string;
  type:          'sale' | 'refund';
  invoiceNumber: string;
  customerName:  string;
  customerPhone?: string;
  orderDate:     string;
  orderAmount:   number;
  paymentMethod: string;
  rawMode:       string;
  transactionId: string;
  paymentDate:   string;
  paymentStatus: 'Paid' | 'Refunded' | 'Pending';
  receivedBy:    string;
  remarks:       string;
  history: Array<{
    date:          string;
    amount:        number;
    method:        string;
    transactionId: string;
  }>;
}

interface PaymentTxnSummary {
  paymentSummary: {
    totalCount: number;
    paid:     { count: number; pct: number };
    refunded: { count: number; pct: number };
    pending:  { count: number; pct: number };
  };
  paymentMethodSummary: Array<{
    method: string;
    amount: number;
    pct:    number;
  }>;
  totalVolumeAmount: number;
}

export default function ProfitabilityReportPage() {
  // Requirement 1: Default to Payment Transactions view all the time
  const [activeTab, setActiveTab] = useState<'payment_transactions' | 'product_breakdown'>('payment_transactions');

  // Timeframe selector state (shared across KPIs and ledger)
  const [timeframe, setTimeframe] = useState<'daily' | 'weekly' | 'monthly' | 'custom'>('monthly');
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate]     = useState(() => new Date().toISOString().slice(0, 10));

  // Profitability report KPIs state
  const [loadingProf, setLoadingProf]     = useState(true);
  const [errorProf, setErrorProf]         = useState<{ message: string } | null>(null);
  const [summary, setSummary]             = useState<ReportSummary | null>(null);
  const [items, setItems]                 = useState<ItemBreakdown[]>([]);
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  // Payment Transactions state
  const [transactions, setTransactions]   = useState<PaymentTxn[]>([]);
  const [txnSummary, setTxnSummary]       = useState<PaymentTxnSummary | null>(null);
  const [loadingTxns, setLoadingTxns]     = useState(false);
  const [errorTxns, setErrorTxns]         = useState<{ message: string } | null>(null);

  // Filters for Payment Transactions
  const [statusFilter, setStatusFilter]   = useState('All');
  const [methodFilter, setMethodFilter]   = useState('All');
  const [searchQuery, setSearchQuery]     = useState('');
  const [selectedTxn, setSelectedTxn]     = useState<PaymentTxn | null>(null);

  // ── Fetch Profitability KPI Data ──────────────────────────────────────────
  const fetchProfitability = useCallback(async () => {
    setLoadingProf(true);
    setErrorProf(null);

    let url = `/api/reports/profitability?timeframe=${timeframe}&format=json`;
    if (timeframe === 'custom') {
      url += `&startDate=${startDate}&endDate=${endDate}`;
    }

    try {
      const res  = await fetch(url);
      const data = await res.json();
      if (!res.ok) { setErrorProf(parseApiError(data)); return; }
      setSummary(data.summary);
      setItems(data.itemBreakdown || []);
    } catch {
      setErrorProf({ message: "Couldn't load financial summary KPIs." });
    } finally {
      setLoadingProf(false);
    }
  }, [timeframe, startDate, endDate]);

  // ── Fetch Payment Transactions Ledger Data ────────────────────────────────
  const fetchPaymentTransactions = useCallback(async () => {
    setLoadingTxns(true);
    setErrorTxns(null);

    let url = `/api/reports/payment-transactions?status=${encodeURIComponent(statusFilter)}&paymentMethod=${encodeURIComponent(methodFilter)}&search=${encodeURIComponent(searchQuery)}`;
    
    // Sync timeframe date filter when timeframe is custom or preset
    if (timeframe === 'custom') {
      if (startDate) url += `&startDate=${encodeURIComponent(startDate)}`;
      if (endDate)   url += `&endDate=${encodeURIComponent(endDate)}`;
    } else if (timeframe === 'daily') {
      const todayStr = new Date().toISOString().slice(0, 10);
      url += `&startDate=${encodeURIComponent(todayStr)}&endDate=${encodeURIComponent(todayStr)}`;
    } else if (timeframe === 'weekly') {
      const d = new Date();
      d.setDate(d.getDate() - 7);
      url += `&startDate=${encodeURIComponent(d.toISOString().slice(0, 10))}`;
    } else if (timeframe === 'monthly') {
      const d = new Date();
      const firstDay = new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
      url += `&startDate=${encodeURIComponent(firstDay)}`;
    }

    try {
      const res  = await fetch(url);
      const data = await res.json();
      if (!res.ok) { setErrorTxns(parseApiError(data)); return; }
      setTransactions(data.transactions || []);
      setTxnSummary(data.summary || null);
    } catch {
      setErrorTxns({ message: "Couldn't load payment transactions." });
    } finally {
      setLoadingTxns(false);
    }
  }, [statusFilter, methodFilter, searchQuery, timeframe, startDate, endDate]);

  // Fetch both KPI summary and payment transactions on load and timeframe updates
  useEffect(() => {
    fetchProfitability();
    fetchPaymentTransactions();
  }, [fetchProfitability, fetchPaymentTransactions]);

  async function handleDownloadPdf() {
    setDownloadingPdf(true);
    try {
      let url = `/api/reports/profitability?timeframe=${timeframe}&format=pdf`;
      if (timeframe === 'custom') {
        url += `&startDate=${startDate}&endDate=${endDate}`;
      }
      const res  = await fetch(url);
      const blob = await res.blob();
      const a    = document.createElement('a');
      a.href     = URL.createObjectURL(blob);
      a.download = `ficcado_profitability_${timeframe}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch {
      alert('Failed to download PDF report.');
    } finally {
      setDownloadingPdf(false);
    }
  }

  function handleExportCsv() {
    let url = `/api/reports/payment-transactions?format=csv&status=${encodeURIComponent(statusFilter)}&paymentMethod=${encodeURIComponent(methodFilter)}&search=${encodeURIComponent(searchQuery)}`;
    if (timeframe === 'custom') {
      if (startDate) url += `&startDate=${encodeURIComponent(startDate)}`;
      if (endDate)   url += `&endDate=${encodeURIComponent(endDate)}`;
    }
    window.open(url, '_blank');
  }

  const netProfit = summary?.netProfit ?? 0;
  const isProfitable = netProfit >= 0;

  return (
    <div>
      <div className="page-header" style={{ marginBottom: 16 }}>
        <div>
          <h1 className="page-title">Payment Transactions & Financial Ledger</h1>
          <div className="page-subtitle">Track revenue, expenses, net profit, and manage all payment transactions</div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => { fetchProfitability(); fetchPaymentTransactions(); }} disabled={loadingProf || loadingTxns}>
            ⟳ Refresh
          </button>
          <button className="btn btn-primary btn-sm" onClick={handleExportCsv} disabled={loadingTxns}>
            📥 Export CSV
          </button>
          <button className="btn btn-ghost btn-sm" onClick={handleDownloadPdf} disabled={downloadingPdf || loadingProf}>
            {downloadingPdf ? <LoadingGecko size="inline" label="PDF…" /> : '📄 PDF Report'}
          </button>
        </div>
      </div>

      {/* ── REQUIREMENT 3: REPORT TIMEFRAME SELECTOR & FINANCIAL KPI CARDS SECTION (From attached image) ──────── */}
      <div className="card" style={{ padding: '12px 18px', marginBottom: 20 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-ink-muted)' }}>Report Timeframe:</span>
            <div style={{ display: 'flex', gap: 6 }}>
              {(['daily', 'weekly', 'monthly', 'custom'] as const).map((tf) => (
                <button
                  key={tf}
                  type="button"
                  className={`btn btn-sm ${timeframe === tf ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => setTimeframe(tf)}
                  style={{ textTransform: 'capitalize', fontWeight: 600 }}
                >
                  {tf === 'daily' ? 'Today' : tf === 'weekly' ? 'Last 7 Days' : tf === 'monthly' ? 'This Month' : 'Custom Dates'}
                </button>
              ))}
            </div>
          </div>

          {timeframe === 'custom' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="date"
                className="form-input"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                style={{ width: 145, fontSize: 13 }}
              />
              <span style={{ fontSize: 12, color: 'var(--color-ink-muted)' }}>to</span>
              <input
                type="date"
                className="form-input"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                style={{ width: 145, fontSize: 13 }}
              />
            </div>
          )}
        </div>
      </div>

      {/* KPI Cards Grid (Directly matching attached image) */}
      {loadingProf ? (
        <div className="card" style={{ padding: 24, textAlign: 'center', marginBottom: 20 }}>
          <LoadingGecko label="Calculating financial KPIs…" />
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 20 }}>
          {/* Net Profit Card (Hero) */}
          <div className="card" style={{
            padding: '14px 16px',
            background: isProfitable ? 'rgba(47,125,79,0.06)' : 'rgba(176,64,58,0.06)',
            border: `1.5px solid ${isProfitable ? 'var(--color-success)' : 'var(--color-error)'}`,
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: isProfitable ? 'var(--color-success)' : 'var(--color-error)', letterSpacing: 0.5 }}>
              NET PROFIT / LOSS
            </div>
            <div style={{ fontSize: 24, fontWeight: 800, color: isProfitable ? 'var(--color-success)' : 'var(--color-error)', marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>
              ₹{netProfit.toLocaleString('en-IN')}
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--color-ink-muted)', marginTop: 2 }}>
              Net Margin: <strong>{summary?.netMarginPct}%</strong>
            </div>
          </div>

          {/* Gross Revenue */}
          <div className="card" style={{ padding: '14px 16px' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-ink-muted)', textTransform: 'uppercase' }}>
              Gross Revenue (Paid Sales)
            </div>
            <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--color-brand-primary)', marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>
              ₹{(summary?.paidRevenue ?? 0).toLocaleString('en-IN')}
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--color-ink-muted)', marginTop: 2 }}>
              {summary?.paidSalesCount ?? 0} paid order(s)
            </div>
          </div>

          {/* COGS */}
          <div className="card" style={{ padding: '14px 16px' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-ink-muted)', textTransform: 'uppercase' }}>
              Cost of Goods Sold (COGS)
            </div>
            <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--color-error)', marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>
              ₹{(summary?.cogs ?? 0).toLocaleString('en-IN')}
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--color-ink-muted)', marginTop: 2 }}>
              Derived from Cost Price
            </div>
          </div>

          {/* Gross Profit */}
          <div className="card" style={{ padding: '14px 16px' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-ink-muted)', textTransform: 'uppercase' }}>
              Gross Profit
            </div>
            <div style={{ fontSize: 20, fontWeight: 700, color: (summary?.grossProfit ?? 0) >= 0 ? 'var(--color-success)' : 'var(--color-error)', marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>
              ₹{(summary?.grossProfit ?? 0).toLocaleString('en-IN')}
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--color-ink-muted)', marginTop: 2 }}>
              Gross Margin: <strong>{summary?.grossMarginPct}%</strong>
            </div>
          </div>

          {/* Operational Expenses */}
          <div className="card" style={{ padding: '14px 16px' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-ink-muted)', textTransform: 'uppercase' }}>
              Operational Expenses
            </div>
            <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--color-error)', marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>
              ₹{(summary?.operationalExpenses ?? 0).toLocaleString('en-IN')}
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--color-ink-muted)', marginTop: 2 }}>
              From Expense Management
            </div>
          </div>

          {/* Vendor Payments */}
          <div className="card" style={{ padding: '14px 16px' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-ink-muted)', textTransform: 'uppercase' }}>
              Vendor Payments
            </div>
            <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--color-error)', marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>
              ₹{(summary?.vendorPayments ?? 0).toLocaleString('en-IN')}
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--color-ink-muted)', marginTop: 2 }}>
              From Vendor Payment Log
            </div>
          </div>

          {/* Total Expenses */}
          <div className="card" style={{ padding: '14px 16px' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-ink-muted)', textTransform: 'uppercase' }}>
              Total Expenses
            </div>
            <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--color-error)', marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>
              ₹{(summary?.totalExpenses ?? 0).toLocaleString('en-IN')}
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--color-ink-muted)', marginTop: 2 }}>
              COGS + Operational + Vendor
            </div>
          </div>

          {/* Pending Dues */}
          <div className="card" style={{ padding: '14px 16px' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-ink-muted)', textTransform: 'uppercase' }}>
              Unpaid / Pending Dues
            </div>
            <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--color-warning)', marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>
              ₹{(summary?.unpaidDues ?? 0).toLocaleString('en-IN')}
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--color-ink-muted)', marginTop: 2 }}>
              Pending collection
            </div>
          </div>
        </div>
      )}

      {/* View Switcher Tabs (Default: Payment Transactions) */}
      <div className="card" style={{ padding: '8px 12px', marginBottom: 20, background: 'var(--color-bg)' }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            className={`btn ${activeTab === 'payment_transactions' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setActiveTab('payment_transactions')}
            style={{ fontWeight: 700, borderRadius: 6 }}
          >
            💳 Payment Transactions
          </button>
          <button
            type="button"
            className={`btn ${activeTab === 'product_breakdown' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setActiveTab('product_breakdown')}
            style={{ fontWeight: 700, borderRadius: 6 }}
          >
            📦 Product-Level Profitability Breakdown
          </button>
        </div>
      </div>

      {/* ── TAB 1 (DEFAULT): PAYMENT TRANSACTIONS LEDGER ─────────────────────── */}
      {activeTab === 'payment_transactions' && (
        <>
          {errorTxns && <ErrorMessage message={errorTxns.message} onDismiss={() => setErrorTxns(null)} />}

          {/* Filter Bar */}
          <div className="card" style={{ padding: '14px 18px', marginBottom: 20 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
                {/* Search Box */}
                <input
                  type="text"
                  className="form-input"
                  placeholder="Search invoice number or customer…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{ width: 230, fontSize: 13 }}
                />

                {/* Status Filter */}
                <select
                  className="form-select"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  style={{ width: 140, fontSize: 13 }}
                >
                  <option value="All">All Statuses</option>
                  <option value="Paid">Paid</option>
                  <option value="Refunded">Refunded</option>
                  <option value="Pending">Pending</option>
                </select>

                {/* Payment Method Filter */}
                <select
                  className="form-select"
                  value={methodFilter}
                  onChange={(e) => setMethodFilter(e.target.value)}
                  style={{ width: 160, fontSize: 13 }}
                >
                  <option value="All">All Payment Methods</option>
                  <option value="Cash">Cash</option>
                  <option value="UPI">UPI</option>
                  <option value="Card">Card</option>
                  <option value="Bank Transfer">Bank Transfer</option>
                  <option value="Refund">Refund</option>
                </select>
              </div>

              {(statusFilter !== 'All' || methodFilter !== 'All' || searchQuery) && (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => { setStatusFilter('All'); setMethodFilter('All'); setSearchQuery(''); }}
                  style={{ fontSize: 12 }}
                >
                  Clear Filters
                </button>
              )}
            </div>
          </div>

          {/* Payment Transactions Table */}
          <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 24 }}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--color-border)', fontWeight: 700, fontSize: 15, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>💳 Payment Transactions Ledger</span>
              <span style={{ fontSize: 12, color: 'var(--color-ink-muted)', fontWeight: 400 }}>
                {transactions.length} transaction(s) listed
              </span>
            </div>

            {loadingTxns ? (
              <div style={{ padding: 48, textAlign: 'center' }}>
                <LoadingGecko label="Loading payment ledger…" />
              </div>
            ) : transactions.length === 0 ? (
              <div style={{ padding: 48, textAlign: 'center', color: 'var(--color-ink-muted)', fontSize: 13 }}>
                No payment transactions found matching the selected filters.
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Payment ID</th>
                      <th>Invoice No.</th>
                      <th>Customer</th>
                      <th>Order Date</th>
                      <th style={{ textAlign: 'right' }}>Amount</th>
                      <th>Payment Method</th>
                      <th>Transaction ID</th>
                      <th>Payment Date</th>
                      <th>Status</th>
                      <th style={{ textAlign: 'center' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.map((t) => {
                      const isRefund = t.type === 'refund';
                      return (
                        <tr key={t.paymentId} style={{ background: isRefund ? 'rgba(176,64,58,0.03)' : undefined }}>
                          <td>
                            <span
                              className="badge"
                              style={{
                                fontWeight: 800,
                                background: isRefund ? 'rgba(176,64,58,0.12)' : 'rgba(43,98,198,0.1)',
                                color: isRefund ? 'var(--color-error)' : 'var(--color-brand-primary)',
                                border: `1px solid ${isRefund ? 'var(--color-error)' : 'var(--color-brand-primary)'}`,
                              }}
                            >
                              {t.paymentId}
                            </span>
                          </td>

                          {/* Requirement 2: Clicking Invoice Number opens single sale manage/edit page */}
                          <td style={{ fontWeight: 700 }}>
                            <Link
                              href={`/dashboard/sales/${encodeURIComponent(t.invoiceNumber)}`}
                              title={`Click to open sale management view for ${t.invoiceNumber}`}
                              style={{ color: 'var(--color-brand-primary)', textDecoration: 'underline' }}
                            >
                              {t.invoiceNumber}
                            </Link>
                          </td>

                          <td style={{ fontWeight: 600 }}>{t.customerName}</td>
                          <td style={{ fontSize: 12, color: 'var(--color-ink-muted)' }}>{formatISTDateTime(t.orderDate)}</td>
                          <td style={{ textAlign: 'right', fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: isRefund ? 'var(--color-error)' : 'var(--color-brand-primary)' }}>
                            {isRefund ? '-' : ''}₹{t.orderAmount.toLocaleString('en-IN')}
                          </td>
                          <td style={{ fontSize: 12.5 }}>
                            <span className="badge badge-neutral">{t.paymentMethod}</span>
                          </td>
                          <td style={{ fontSize: 12, fontFamily: 'monospace', color: 'var(--color-ink-muted)' }}>
                            {t.transactionId}
                          </td>
                          <td style={{ fontSize: 12, color: 'var(--color-ink-muted)' }}>{formatISTDateTime(t.paymentDate)}</td>
                          <td>
                            <span
                              className="badge"
                              style={{
                                fontWeight: 700,
                                background: t.paymentStatus === 'Paid' ? 'rgba(47,125,79,0.1)' : t.paymentStatus === 'Refunded' ? 'rgba(176,64,58,0.1)' : 'rgba(184,134,43,0.1)',
                                color: t.paymentStatus === 'Paid' ? 'var(--color-success)' : t.paymentStatus === 'Refunded' ? 'var(--color-error)' : 'var(--color-warning)',
                              }}
                            >
                              {t.paymentStatus}
                            </span>
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <button
                              className="btn btn-ghost btn-sm"
                              onClick={() => setSelectedTxn(t)}
                              title="View Payment Information"
                              style={{ fontSize: 13, padding: '3px 8px' }}
                            >
                              👁 View
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Live Summary Widgets (Payment Summary Donut & Payment Method Summary) */}
          {txnSummary && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
              {/* Payment Summary Widget */}
              <div className="card" style={{ padding: 20 }}>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 16, marginBottom: 6 }}>Payment Summary</h3>
                <div style={{ fontSize: 12.5, color: 'var(--color-ink-muted)', marginBottom: 14 }}>
                  Order status breakdown for currently filtered timeframe ({txnSummary.paymentSummary.totalCount} orders total)
                </div>

                {/* Progress Multi-Bar */}
                <div style={{ display: 'flex', height: 16, borderRadius: 8, overflow: 'hidden', background: '#E2DCC9', marginBottom: 16 }}>
                  <div style={{ width: `${txnSummary.paymentSummary.paid.pct}%`, background: 'var(--color-success)' }} title={`Paid: ${txnSummary.paymentSummary.paid.count} (${txnSummary.paymentSummary.paid.pct}%)`} />
                  <div style={{ width: `${txnSummary.paymentSummary.refunded.pct}%`, background: 'var(--color-error)' }} title={`Refunded: ${txnSummary.paymentSummary.refunded.count} (${txnSummary.paymentSummary.refunded.pct}%)`} />
                  <div style={{ width: `${txnSummary.paymentSummary.pending.pct}%`, background: 'var(--color-warning)' }} title={`Pending: ${txnSummary.paymentSummary.pending.count} (${txnSummary.paymentSummary.pending.pct}%)`} />
                </div>

                {/* Counts List */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, textAlign: 'center' }}>
                  <div style={{ padding: 10, background: 'rgba(47,125,79,0.06)', borderRadius: 6, border: '1px solid rgba(47,125,79,0.2)' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-success)', textTransform: 'uppercase' }}>Paid</div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--color-success)', marginTop: 2 }}>{txnSummary.paymentSummary.paid.count}</div>
                    <div style={{ fontSize: 11, color: 'var(--color-ink-muted)' }}>{txnSummary.paymentSummary.paid.pct}%</div>
                  </div>
                  <div style={{ padding: 10, background: 'rgba(176,64,58,0.06)', borderRadius: 6, border: '1px solid rgba(176,64,58,0.2)' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-error)', textTransform: 'uppercase' }}>Refunded</div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--color-error)', marginTop: 2 }}>{txnSummary.paymentSummary.refunded.count}</div>
                    <div style={{ fontSize: 11, color: 'var(--color-ink-muted)' }}>{txnSummary.paymentSummary.refunded.pct}%</div>
                  </div>
                  <div style={{ padding: 10, background: 'rgba(184,134,43,0.06)', borderRadius: 6, border: '1px solid rgba(184,134,43,0.2)' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-warning)', textTransform: 'uppercase' }}>Pending</div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--color-warning)', marginTop: 2 }}>{txnSummary.paymentSummary.pending.count}</div>
                    <div style={{ fontSize: 11, color: 'var(--color-ink-muted)' }}>{txnSummary.paymentSummary.pending.pct}%</div>
                  </div>
                </div>
              </div>

              {/* Payment Method Summary Widget */}
              <div className="card" style={{ padding: 20 }}>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 16, marginBottom: 6 }}>Payment Method Summary</h3>
                <div style={{ fontSize: 12.5, color: 'var(--color-ink-muted)', marginBottom: 14 }}>
                  Total monetary volume by payment mode (₹{txnSummary.totalVolumeAmount.toLocaleString('en-IN')} total)
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {txnSummary.paymentMethodSummary.map((m) => (
                    <div key={m.method}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, fontWeight: 600, marginBottom: 4 }}>
                        <span>{m.method}</span>
                        <span>₹{m.amount.toLocaleString('en-IN')} <span style={{ fontSize: 11, color: 'var(--color-ink-muted)', fontWeight: 400 }}>({m.pct}%)</span></span>
                      </div>
                      <div style={{ height: 8, background: '#E2DCC9', borderRadius: 4, overflow: 'hidden' }}>
                        <div
                          style={{
                            height: '100%',
                            width: `${m.pct}%`,
                            background: m.method.includes('Refund') ? 'var(--color-error)' : 'var(--color-brand-primary)',
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── TAB 2: PRODUCT-LEVEL PROFITABILITY BREAKDOWN ─────────────────────── */}
      {activeTab === 'product_breakdown' && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--color-border)', fontWeight: 700, fontSize: 15, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>📦 Product-Level Profitability Breakdown</span>
            <span style={{ fontSize: 12, color: 'var(--color-ink-muted)', fontWeight: 400 }}>
              {items.length} product(s) sold in selected period
            </span>
          </div>

          {items.length === 0 ? (
            <div style={{ padding: 36, textAlign: 'center', color: 'var(--color-ink-muted)', fontSize: 13 }}>
              No paid product sales recorded for this timeframe.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Product Name</th>
                    <th style={{ textAlign: 'center' }}>Quantity Sold</th>
                    <th style={{ textAlign: 'right' }}>Revenue (₹)</th>
                    <th style={{ textAlign: 'right' }}>COGS (₹)</th>
                    <th style={{ textAlign: 'right' }}>Gross Profit (₹)</th>
                    <th style={{ textAlign: 'right' }}>Margin %</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it) => {
                    const marginPct = it.revenue > 0 ? Math.round((it.grossProfit / it.revenue) * 1000) / 10 : 0;
                    return (
                      <tr key={it.itemName}>
                        <td style={{ fontWeight: 600 }}>{it.itemName}</td>
                        <td style={{ textAlign: 'center' }}>
                          <span className="badge badge-neutral" style={{ fontWeight: 700 }}>
                            {it.quantitySold} pcs
                          </span>
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--color-brand-primary)', fontVariantNumeric: 'tabular-nums' }}>
                          ₹{it.revenue.toLocaleString('en-IN')}
                        </td>
                        <td style={{ textAlign: 'right', color: 'var(--color-ink-muted)', fontVariantNumeric: 'tabular-nums' }}>
                          ₹{it.cogs.toLocaleString('en-IN')}
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 700, color: it.grossProfit >= 0 ? 'var(--color-success)' : 'var(--color-error)', fontVariantNumeric: 'tabular-nums' }}>
                          ₹{it.grossProfit.toLocaleString('en-IN')}
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 600, color: marginPct >= 0 ? 'var(--color-success)' : 'var(--color-error)' }}>
                          {marginPct}%
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── DETAIL PANEL MODAL ────────────────────────────────────────────────── */}
      {selectedTxn && (
        <div className="modal-backdrop" onClick={() => setSelectedTxn(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 640 }}>
            <div className="modal-header">
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="badge badge-primary" style={{ fontWeight: 800 }}>{selectedTxn.paymentId}</span>
                  <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 18, margin: 0 }}>Payment Information</h2>
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--color-ink-muted)', marginTop: 4 }}>
                  {/* Requirement 2: Clicking Invoice Number opens single sale manage/edit page */}
                  Invoice: <Link href={`/dashboard/sales/${encodeURIComponent(selectedTxn.invoiceNumber)}`} style={{ color: 'var(--color-brand-primary)', fontWeight: 700, textDecoration: 'underline' }}>{selectedTxn.invoiceNumber}</Link> • Customer: <strong>{selectedTxn.customerName}</strong>
                </div>
              </div>
              <button className="btn-icon" onClick={() => setSelectedTxn(null)}>×</button>
            </div>

            <div className="modal-body">
              {/* Payment Details Block */}
              <div className="card" style={{ background: 'var(--color-bg)', padding: 16, border: '1px solid var(--color-border)', marginBottom: 20 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  <div>
                    <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--color-ink-muted)', textTransform: 'uppercase' }}>Payment Method</div>
                    <div style={{ fontSize: 14, fontWeight: 600, marginTop: 2 }}>{selectedTxn.paymentMethod}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--color-ink-muted)', textTransform: 'uppercase' }}>Transaction ID</div>
                    <div style={{ fontSize: 14, fontFamily: 'monospace', fontWeight: 600, marginTop: 2 }}>{selectedTxn.transactionId}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--color-ink-muted)', textTransform: 'uppercase' }}>Payment Date</div>
                    <div style={{ fontSize: 13, marginTop: 2 }}>{formatISTDateTime(selectedTxn.paymentDate)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--color-ink-muted)', textTransform: 'uppercase' }}>Payment Status</div>
                    <div style={{ marginTop: 2 }}>
                      <span className="badge badge-success" style={{ fontWeight: 700 }}>{selectedTxn.paymentStatus}</span>
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--color-ink-muted)', textTransform: 'uppercase' }}>Received / Closed By</div>
                    <div style={{ fontSize: 13, fontWeight: 600, marginTop: 2 }}>{selectedTxn.receivedBy || 'System Admin'}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--color-ink-muted)', textTransform: 'uppercase' }}>Order Amount</div>
                    <div style={{ fontSize: 15, fontWeight: 800, color: selectedTxn.type === 'refund' ? 'var(--color-error)' : 'var(--color-brand-primary)', marginTop: 2 }}>
                      ₹{selectedTxn.orderAmount.toLocaleString('en-IN')}
                    </div>
                  </div>
                </div>

                {selectedTxn.remarks && selectedTxn.remarks !== '—' && (
                  <div style={{ marginTop: 14, paddingTop: 10, borderTop: '1px solid var(--color-border)' }}>
                    <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--color-ink-muted)', textTransform: 'uppercase' }}>Remarks / Notes</div>
                    <div style={{ fontSize: 13, fontStyle: 'italic', marginTop: 2, color: 'var(--color-ink)' }}>{selectedTxn.remarks}</div>
                  </div>
                )}
              </div>

              {/* Payment History Mini-Table */}
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 15, marginBottom: 10 }}>Payment History</h3>
              <div style={{ overflowX: 'auto', border: '1px solid var(--color-border)', borderRadius: 6 }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th style={{ textAlign: 'right' }}>Amount</th>
                      <th>Method</th>
                      <th>Transaction ID</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedTxn.history.map((h, i) => (
                      <tr key={i}>
                        <td style={{ fontSize: 12 }}>{formatISTDateTime(h.date)}</td>
                        <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--color-brand-primary)' }}>₹{h.amount.toLocaleString('en-IN')}</td>
                        <td style={{ fontSize: 12 }}>{h.method}</td>
                        <td style={{ fontSize: 12, fontFamily: 'monospace', color: 'var(--color-ink-muted)' }}>{h.transactionId}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={2} style={{ textAlign: 'right', fontWeight: 800, padding: '10px 12px', borderTop: '2px solid var(--color-border)' }}>
                        Total Received: ₹{selectedTxn.history.reduce((sum, h) => sum + h.amount, 0).toLocaleString('en-IN')}
                      </td>
                      <td colSpan={2} style={{ borderTop: '2px solid var(--color-border)' }}></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            <div className="modal-footer" style={{ justifyContent: 'space-between' }}>
              <Link
                href={`/dashboard/sales/${encodeURIComponent(selectedTxn.invoiceNumber)}`}
                className="btn btn-primary btn-sm"
              >
                ✎ Open Manage Order ({selectedTxn.invoiceNumber})
              </Link>
              <button className="btn btn-ghost" onClick={() => setSelectedTxn(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
