'use client';

/**
 * app/(app)/dashboard/sales/page.tsx
 *
 * Sales Management — full list view with:
 * - Search, filter by payment status / sale status
 * - New sale modal
 * - Invoice badges + status badges
 * - FIC- invoice numbers prominently displayed
 * - Part 3: Download Invoice button + Send Gmail Confirmation button per row
 */

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import LoadingGecko from '@/components/LoadingGecko';
import ErrorMessage, { parseApiError } from '@/components/ErrorMessage';
import MobileBackButton from '@/components/MobileBackButton';
import { formatISTDateTime } from '@/lib/dateUtils';

interface Sale {
  rowIndex:             number;
  invoiceNumber:        string;
  saleStatus:           string;
  customerName:         string;
  customerPhone:        string;
  customerAddress:      string;
  totalItems:           string;
  itemNames:            string;
  sizes:                string;
  totalAmount:          string;
  paymentStatus:        string;
  modeOfPayment:        string;
  transactionId:        string;
  createdAt:            string;
  createdBy:            string;
  updatedAt:            string;
  saleClosedBy?:        string;
  discount:             number;
  customerEmail:        string;
}

const PAYMENT_BADGE: Record<string, string> = {
  'Paid':     'badge-success',
  'Not Paid': 'badge-error',
  'Credit':   'badge-warning',
};

const STATUS_BADGE: Record<string, string> = {
  'Purchase Satisfied':                         'badge-success',
  'Purchase Satisfied & Order Completed':       'badge-success',
  'Not Provided / Order Only Placed':           'badge-neutral',
  'Payment Pending':                            'badge-warning',
  'Return & Refund':                            'badge-error',
  'Replacement Completed & Purchase Satisfied': 'badge-info',
};

const NO_EMAIL_MSG = 'No email on file for this customer — add one via phone lookup or edit the customer record.';

export default function SalesPage() {
  const [sales, setSales]           = useState<Sale[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<{ message: string } | null>(null);
  const [search, setSearch]         = useState('');
  const [filterPayment, setFilterPayment] = useState('');
  const [selectedModule, setSelectedModule] = useState('sales');

  // Per-row action states: key = invoiceNumber
  const [sendingEmail, setSendingEmail]   = useState<Record<string, boolean>>({});
  const [rowFeedback, setRowFeedback]     = useState<Record<string, { type: 'success' | 'error'; message: string }>>({});

  async function loadSales(mod = selectedModule) {
    setLoading(true);
    try {
      const url = mod && mod !== 'sales' ? `/api/sales?module=${encodeURIComponent(mod)}` : '/api/sales';
      const res = await fetch(url);
      const data = await res.json();
      if (!res.ok) { setError(parseApiError(data)); return; }
      setSales(data.sales ?? []);
    } catch {
      setError({ message: "Couldn't load sales. Check your connection." });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadSales(selectedModule); }, [selectedModule]);

  const filtered = sales.filter((s) => {
    const q = search.toLowerCase();
    const matchSearch = !q || s.invoiceNumber.toLowerCase().includes(q) ||
      s.customerName.toLowerCase().includes(q) || s.customerPhone.includes(q);
    const matchPayment = !filterPayment || s.paymentStatus === filterPayment;
    return matchSearch && matchPayment;
  });

  function handleDownloadInvoice(invoiceNumber: string) {
    window.open(`/api/invoice/${encodeURIComponent(invoiceNumber)}/pdf`, '_blank');
  }

  function getWhatsAppUrl(sale: Sale) {
    const cleanPhone = sale.customerPhone.replace(/\D/g, '');
    const phoneWithCountry = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;
    const msg = `Hello ${sale.customerName}, here are your Ficcado order details for Invoice #${sale.invoiceNumber}. Total Amount: ₹${sale.totalAmount}. Thank you for shopping with us!`;
    return `https://wa.me/${phoneWithCountry}?text=${encodeURIComponent(msg)}`;
  }

  async function handleSendConfirmation(sale: Sale) {
    const inv = sale.invoiceNumber;
    setSendingEmail((prev) => ({ ...prev, [inv]: true }));
    setRowFeedback((prev) => { const n = { ...prev }; delete n[inv]; return n; });

    try {
      const res = await fetch(`/api/sales/${encodeURIComponent(inv)}/send-confirmation`, {
        method: 'POST',
      });
      const data = await res.json();

      if (!res.ok) {
        const errorMsg = data.detail ? `${data.error} (${data.detail})` : (data.error ?? 'Failed to send email.');
        setRowFeedback((prev) => ({
          ...prev,
          [inv]: { type: 'error', message: errorMsg },
        }));
      } else {
        setRowFeedback((prev) => ({
          ...prev,
          [inv]: { type: 'success', message: `Confirmation sent to ${data.sentTo}` },
        }));
      }
    } catch {
      setRowFeedback((prev) => ({
        ...prev,
        [inv]: { type: 'error', message: "Couldn't connect. Try again." },
      }));
    } finally {
      setSendingEmail((prev) => ({ ...prev, [inv]: false }));
    }
  }

  return (
    <div>
      <MobileBackButton />

      <div className="page-header">
        <div>
          <h1 className="page-title">Sales</h1>
          <div className="page-subtitle">{filtered.length} of {sales.length} records</div>
        </div>
        <Link href="/dashboard/sales/new" className="btn btn-primary">
          + New Sale
        </Link>
      </div>

      {error && <ErrorMessage message={error.message} variant="error" onDismiss={() => setError(null)} />}

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <div className="search-bar" style={{ flex: 1, minWidth: 200 }}>
          <span style={{ color: 'var(--color-ink-muted)' }}>⌕</span>
          <input
            type="text"
            placeholder="Search invoice, customer…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          className="form-select"
          style={{ width: 160 }}
          value={filterPayment}
          onChange={(e) => setFilterPayment(e.target.value)}
        >
          <option value="">All Payment Status</option>
          <option value="Paid">Paid</option>
          <option value="Not Paid">Not Paid</option>
          <option value="Credit">Credit</option>
        </select>
        <button className="btn btn-ghost btn-sm" onClick={() => loadSales(selectedModule)} disabled={loading}>↻ Refresh</button>
      </div>

      {/* ── Mobile Card List View ────────────────────────────────────────── */}
      <div className="mobile-only">
        {loading ? (
          <div className="card" style={{ padding: 36, textAlign: 'center' }}>
            <LoadingGecko label="Loading sales directory…" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="card empty-state">
            <div style={{ fontSize: 28 }}>◆</div>
            <div className="empty-state-title">No sales found</div>
            <div style={{ fontSize: 13, color: 'var(--color-ink-muted)' }}>
              {search || filterPayment ? 'Try clearing filters.' : 'Tap "+ New Sale" to record a sale.'}
            </div>
          </div>
        ) : (
          <div className="mobile-card-list">
            {filtered.map((sale) => (
              <div key={sale.invoiceNumber} className="mobile-data-card">
                <div className="mobile-data-card-header">
                  <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, color: 'var(--color-brand-primary)', fontSize: 14 }}>
                    {sale.invoiceNumber}
                  </span>
                  <span className={`badge ${PAYMENT_BADGE[sale.paymentStatus] ?? 'badge-neutral'}`}>
                    {sale.paymentStatus}
                  </span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{sale.customerName}</div>
                    <div style={{ fontSize: 12, color: 'var(--color-ink-muted)' }}>📞 {sale.customerPhone}</div>
                    {sale.customerEmail && (
                      <div style={{ fontSize: 11, color: 'var(--color-ink-muted)' }}>✉ {sale.customerEmail}</div>
                    )}
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 700, fontSize: 15, fontFamily: 'var(--font-display)' }}>
                      ₹{parseFloat(sale.totalAmount || '0').toLocaleString('en-IN')}
                    </div>
                    {sale.discount > 0 && (
                      <div style={{ fontSize: 10, color: 'var(--color-error)' }}>−₹{sale.discount} disc.</div>
                    )}
                  </div>
                </div>

                <div style={{ fontSize: 12, color: 'var(--color-ink-muted)', marginTop: 2 }}>
                  <strong>Items:</strong> {sale.itemNames || '—'} ({sale.sizes || '—'})
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
                  <span className={`badge ${STATUS_BADGE[sale.saleStatus] ?? 'badge-neutral'}`} style={{ fontSize: 11 }}>
                    {sale.saleStatus}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--color-ink-muted)' }}>
                    {formatISTDateTime(sale.createdAt)}
                  </span>
                </div>

                {rowFeedback[sale.invoiceNumber] && (
                  <ErrorMessage
                    message={rowFeedback[sale.invoiceNumber].message}
                    variant={rowFeedback[sale.invoiceNumber].type === 'success' ? 'success' : 'error'}
                    onDismiss={() => setRowFeedback((prev) => { const n = { ...prev }; delete n[sale.invoiceNumber]; return n; })}
                  />
                )}

                {/* Mobile Quick Action Buttons */}
                <div className="mobile-data-card-actions">
                  <Link href={`/dashboard/sales/${sale.invoiceNumber}`} className="btn btn-ghost btn-sm" style={{ flex: 1, justifyContent: 'center' }}>
                    ✎ Edit / View
                  </Link>
                  <button onClick={() => handleDownloadInvoice(sale.invoiceNumber)} className="btn btn-ghost btn-sm" title="Download Invoice" style={{ color: 'var(--color-brand-primary)' }}>
                    ⬇ PDF
                  </button>
                  {sale.customerEmail ? (
                    <button onClick={() => handleSendConfirmation(sale)} disabled={sendingEmail[sale.invoiceNumber]} className="btn btn-ghost btn-sm" style={{ color: 'var(--color-success)' }}>
                      {sendingEmail[sale.invoiceNumber] ? '…' : '✉ Email'}
                    </button>
                  ) : null}
                  <a href={getWhatsAppUrl(sale)} target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-sm" style={{ color: '#25D366' }}>
                    💬 WA
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Desktop Table View ─────────────────────────────────────────── */}
      <div className="desktop-only card" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 48, textAlign: 'center' }}>
            <LoadingGecko label="Loading sales orders directory…" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <div style={{ fontSize: 28 }}>◆</div>
            <div className="empty-state-title">No sales yet</div>
            <div style={{ fontSize: 13, color: 'var(--color-ink-muted)' }}>
              {search || filterPayment ? 'Try clearing the filters.' : 'Click \"+ New Sale\" to record your first sale.'}
            </div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Customer</th>
                  <th>Items</th>
                  <th>Amount</th>
                  <th>Payment</th>
                  <th>Status</th>
                  <th>Closed By</th>
                  <th>Date</th>
                  <th style={{ minWidth: 120 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((sale) => (
                  <React.Fragment key={sale.invoiceNumber}>
                    <tr>
                      <td>
                        <span style={{
                          fontFamily: 'var(--font-display)',
                          fontWeight: 700,
                          color: 'var(--color-brand-primary)',
                          fontSize: 13,
                        }}>
                          {sale.invoiceNumber}
                        </span>
                        {sale.discount > 0 && (
                          <div style={{ fontSize: 10, color: 'var(--color-error)', marginTop: 2 }}>
                            −₹{sale.discount.toLocaleString('en-IN')} disc.
                          </div>
                        )}
                      </td>
                      <td>
                        <div style={{ fontWeight: 500 }}>{sale.customerName}</div>
                        <div style={{ fontSize: 12, color: 'var(--color-ink-muted)' }}>{sale.customerPhone}</div>
                        {sale.customerEmail && (
                          <div style={{ fontSize: 11, color: 'var(--color-ink-muted)' }}>✉ {sale.customerEmail}</div>
                        )}
                      </td>
                      <td>
                        {(() => {
                          const names = (sale.itemNames || '').split(',').map((n) => n.trim()).filter(Boolean);
                          const sizes = (sale.sizes || '').split(',').map((s) => s.trim()).filter(Boolean);
                          const map = new Map<string, { name: string; size: string; qty: number }>();
                          for (let i = 0; i < names.length; i++) {
                            const sz = sizes[i] ?? sizes[0] ?? '—';
                            const key = `${names[i]}:${sz}`;
                            const existing = map.get(key);
                            if (existing) {
                              existing.qty += 1;
                            } else {
                              map.set(key, { name: names[i], size: sz, qty: 1 });
                            }
                          }
                          const items = Array.from(map.values());
                          const itemSummary = items.map((i) => (i.qty > 1 ? `${i.name} (x${i.qty})` : i.name)).join(', ');
                          const sizeSummary = items.map((i) => (i.qty > 1 ? `${i.size} (x${i.qty})` : i.size)).join(', ');
                          return (
                            <>
                              <div className="truncate" style={{ maxWidth: 180 }} title={itemSummary || sale.itemNames}>
                                {itemSummary || sale.itemNames}
                              </div>
                              <div style={{ fontSize: 12, color: 'var(--color-ink-muted)' }}>{sizeSummary || sale.sizes}</div>
                            </>
                          );
                        })()}
                      </td>
                      <td className="tabular-nums" style={{ fontWeight: 600 }}>
                        ₹{parseFloat(sale.totalAmount || '0').toLocaleString('en-IN')}
                      </td>
                      <td>
                        <span className={`badge ${PAYMENT_BADGE[sale.paymentStatus] ?? 'badge-neutral'}`}>
                          {sale.paymentStatus}
                        </span>
                      </td>
                      <td>
                        <span className={`badge ${STATUS_BADGE[sale.saleStatus] ?? 'badge-neutral'}`}>
                          {sale.saleStatus}
                        </span>
                      </td>
                      <td>
                        {sale.saleClosedBy ? (
                          <span className="badge badge-success" style={{ fontSize: 11 }}>
                            👤 {sale.saleClosedBy}
                          </span>
                        ) : (
                          <span style={{ color: 'var(--color-ink-muted)', fontSize: 12 }}>—</span>
                        )}
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--color-ink-muted)' }}>
                        {formatISTDateTime(sale.createdAt)}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                          {/* View/Edit */}
                          <Link
                            href={`/dashboard/sales/${sale.invoiceNumber}`}
                            className="btn btn-icon btn-sm"
                            title="View / Edit"
                          >
                            →
                          </Link>

                          {/* Download Invoice */}
                          <button
                            className="btn btn-icon btn-sm"
                            title="Download Invoice PDF"
                            onClick={() => handleDownloadInvoice(sale.invoiceNumber)}
                            style={{ color: 'var(--color-brand-primary)' }}
                          >
                            ⬇
                          </button>

                          {/* Send Gmail Confirmation */}
                          {sale.customerEmail ? (
                            <button
                              className="btn btn-icon btn-sm"
                              title={`Send confirmation email to ${sale.customerEmail}`}
                              onClick={() => handleSendConfirmation(sale)}
                              disabled={sendingEmail[sale.invoiceNumber]}
                              style={{ color: 'var(--color-success)' }}
                            >
                              {sendingEmail[sale.invoiceNumber]
                                ? <LoadingGecko size="inline" label="" />
                                : '✉'}
                            </button>
                          ) : (
                            <button
                              className="btn btn-icon btn-sm"
                              title={NO_EMAIL_MSG}
                              disabled
                              style={{ color: 'var(--color-ink-muted)', cursor: 'not-allowed', opacity: 0.45 }}
                            >
                              ✉
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>

                    {/* Inline row feedback */}
                    {rowFeedback[sale.invoiceNumber] && (
                      <tr>
                        <td colSpan={9} style={{ padding: '4px 12px 8px' }}>
                          <ErrorMessage
                            message={rowFeedback[sale.invoiceNumber].message}
                            variant={rowFeedback[sale.invoiceNumber].type === 'success' ? 'success' : 'error'}
                            onDismiss={() =>
                              setRowFeedback((prev) => {
                                const n = { ...prev };
                                delete n[sale.invoiceNumber];
                                return n;
                              })
                            }
                          />
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
