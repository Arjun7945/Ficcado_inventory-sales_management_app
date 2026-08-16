'use client';

/**
 * app/(app)/dashboard/reports/profitability/page.tsx
 *
 * Profitability & Financial Reporting Page (Phase 81 & 82 — B7.1).
 * Features:
 *  - Timeframe selector: Daily, Weekly, Monthly, Custom Range
 *  - Financial KPIs:
 *      • Net Profit / Loss & Net Margin %
 *      • Gross Revenue
 *      • Cost of Goods Sold (COGS)
 *      • Gross Profit
 *      • Operational Expenses (Expense Management)
 *      • Vendor Payments (Vendor Payment Log)
 *      • Total Expenses
 *      • Unpaid Dues
 *  - Per-Product Profitability Breakdown Table
 *  - Download PDF Report button
 */

import { useState, useEffect, useCallback } from 'react';
import LoadingGecko from '@/components/LoadingGecko';
import ErrorMessage, { parseApiError } from '@/components/ErrorMessage';

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

export default function ProfitabilityReportPage() {
  const [timeframe, setTimeframe] = useState<'daily' | 'weekly' | 'monthly' | 'custom'>('monthly');
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate]     = useState(() => new Date().toISOString().slice(0, 10));

  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<{ message: string } | null>(null);
  const [summary, setSummary]     = useState<ReportSummary | null>(null);
  const [items, setItems]         = useState<ItemBreakdown[]>([]);
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  const fetchReport = useCallback(async () => {
    setLoading(true);
    setError(null);

    let url = `/api/reports/profitability?timeframe=${timeframe}&format=json`;
    if (timeframe === 'custom') {
      url += `&startDate=${startDate}&endDate=${endDate}`;
    }

    try {
      const res  = await fetch(url);
      const data = await res.json();
      if (!res.ok) { setError(parseApiError(data)); return; }
      setSummary(data.summary);
      setItems(data.itemBreakdown || []);
    } catch {
      setError({ message: "Couldn't load profitability report." });
    } finally {
      setLoading(false);
    }
  }, [timeframe, startDate, endDate]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

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

  const netProfit = summary?.netProfit ?? 0;
  const isProfitable = netProfit >= 0;

  return (
    <div>
      <div className="page-header" style={{ marginBottom: 20 }}>
        <div>
          <h1 className="page-title">Profitability & Margin Analysis</h1>
          <div className="page-subtitle">Track revenue, cost of goods sold, operational expenses, vendor payments, and net profit margins</div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-ghost btn-sm" onClick={fetchReport} disabled={loading}>
            ⟳ Refresh
          </button>
          <button className="btn btn-primary" onClick={handleDownloadPdf} disabled={downloadingPdf || loading}>
            {downloadingPdf ? <LoadingGecko size="inline" label="Downloading PDF…" /> : '📄 Download PDF Report'}
          </button>
        </div>
      </div>

      {error && <ErrorMessage message={error.message} onDismiss={() => setError(null)} />}

      {/* Timeframe selector toolbar */}
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

      {/* KPI Cards Grid */}
      {loading ? (
        <div className="card" style={{ padding: 48, textAlign: 'center' }}>
          <LoadingGecko label="Calculating profit & loss metrics…" />
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 14, marginBottom: 24 }}>
            {/* Net Profit Card (Hero) */}
            <div className="card" style={{
              padding: '16px 20px',
              background: isProfitable ? 'rgba(47,125,79,0.06)' : 'rgba(176,64,58,0.06)',
              border: `1.5px solid ${isProfitable ? 'var(--color-success)' : 'var(--color-error)'}`,
            }}>
              <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color: isProfitable ? 'var(--color-success)' : 'var(--color-error)', letterSpacing: 0.5 }}>
                Net Profit / Loss
              </div>
              <div style={{ fontSize: 26, fontWeight: 800, color: isProfitable ? 'var(--color-success)' : 'var(--color-error)', marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>
                ₹{netProfit.toLocaleString('en-IN')}
              </div>
              <div style={{ fontSize: 12, color: 'var(--color-ink-muted)', marginTop: 2 }}>
                Net Margin: <strong>{summary?.netMarginPct}%</strong>
              </div>
            </div>

            {/* Gross Revenue */}
            <div className="card" style={{ padding: '16px 20px' }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-ink-muted)' }}>
                Gross Revenue (Paid Sales)
              </div>
              <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--color-brand-primary)', marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>
                ₹{(summary?.paidRevenue ?? 0).toLocaleString('en-IN')}
              </div>
              <div style={{ fontSize: 12, color: 'var(--color-ink-muted)', marginTop: 2 }}>
                From {summary?.paidSalesCount ?? 0} completed order(s)
              </div>
            </div>

            {/* COGS */}
            <div className="card" style={{ padding: '16px 20px' }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-ink-muted)' }}>
                Cost of Goods Sold (COGS)
              </div>
              <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--color-ink)', marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>
                ₹{(summary?.cogs ?? 0).toLocaleString('en-IN')}
              </div>
              <div style={{ fontSize: 12, color: 'var(--color-ink-muted)', marginTop: 2 }}>
                Item cost price × quantities sold
              </div>
            </div>

            {/* Gross Profit */}
            <div className="card" style={{ padding: '16px 20px' }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-ink-muted)' }}>
                Gross Profit
              </div>
              <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--color-success)', marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>
                ₹{(summary?.grossProfit ?? 0).toLocaleString('en-IN')}
              </div>
              <div style={{ fontSize: 12, color: 'var(--color-ink-muted)', marginTop: 2 }}>
                Gross Margin: <strong>{summary?.grossMarginPct}%</strong>
              </div>
            </div>

            {/* Operational Expenses */}
            <div className="card" style={{ padding: '16px 20px' }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-ink-muted)' }}>
                Operational Expenses
              </div>
              <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--color-error)', marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>
                ₹{(summary?.operationalExpenses ?? 0).toLocaleString('en-IN')}
              </div>
              <div style={{ fontSize: 12, color: 'var(--color-ink-muted)', marginTop: 2 }}>
                From Expense Management log
              </div>
            </div>

            {/* Vendor Payments */}
            <div className="card" style={{ padding: '16px 20px' }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-ink-muted)' }}>
                Vendor Payments
              </div>
              <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--color-error)', marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>
                ₹{(summary?.vendorPayments ?? 0).toLocaleString('en-IN')}
              </div>
              <div style={{ fontSize: 12, color: 'var(--color-ink-muted)', marginTop: 2 }}>
                From Vendor Payment Log
              </div>
            </div>

            {/* Total Expenses */}
            <div className="card" style={{ padding: '16px 20px' }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-ink-muted)' }}>
                Total Expenses
              </div>
              <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--color-error)', marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>
                ₹{(summary?.totalExpenses ?? 0).toLocaleString('en-IN')}
              </div>
              <div style={{ fontSize: 12, color: 'var(--color-ink-muted)', marginTop: 2 }}>
                COGS + Operational + Vendor
              </div>
            </div>

            {/* Pending Dues */}
            <div className="card" style={{ padding: '16px 20px' }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-ink-muted)' }}>
                Unpaid / Pending Dues
              </div>
              <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--color-warning)', marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>
                ₹{(summary?.unpaidDues ?? 0).toLocaleString('en-IN')}
              </div>
              <div style={{ fontSize: 12, color: 'var(--color-ink-muted)', marginTop: 2 }}>
                Pending collection
              </div>
            </div>
          </div>

          {/* Item Profitability Breakdown Table */}
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
        </>
      )}
    </div>
  );
}
