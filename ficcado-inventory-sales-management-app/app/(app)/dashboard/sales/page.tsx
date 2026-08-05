'use client';

/**
 * app/(app)/dashboard/sales/page.tsx
 *
 * Sales Management — full list view with:
 * - Search, filter by payment status / sale status
 * - New sale modal
 * - Invoice badges + status badges
 * - FIC- invoice numbers prominently displayed
 */

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import LoadingGecko from '@/components/LoadingGecko';
import ErrorMessage, { parseApiError } from '@/components/ErrorMessage';
import NewSaleModal from './NewSaleModal';

interface Sale {
  rowIndex:       number;
  invoiceNumber:  string;
  saleStatus:     string;
  customerName:   string;
  customerPhone:  string;
  customerAddress:string;
  totalItems:     string;
  itemNames:      string;
  sizes:          string;
  totalAmount:    string;
  paymentStatus:  string;
  modeOfPayment:  string;
  transactionId:  string;
  createdAt:      string;
  createdBy:      string;
  updatedAt:      string;
}

const PAYMENT_BADGE: Record<string, string> = {
  'Paid':     'badge-success',
  'Not Paid': 'badge-error',
  'Credit':   'badge-warning',
};

const STATUS_BADGE: Record<string, string> = {
  'Purchase Satisfied': 'badge-success',
  'Return & Refund':    'badge-error',
  'Replacement Completed & Purchase Satisfied': 'badge-info',
};

export default function SalesPage() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ message: string } | null>(null);
  const [search, setSearch] = useState('');
  const [filterPayment, setFilterPayment] = useState('');
  const [showModal, setShowModal] = useState(false);

  async function loadSales() {
    setLoading(true);
    try {
      const res = await fetch('/api/sales');
      const data = await res.json();
      if (!res.ok) { setError(parseApiError(data)); return; }
      setSales(data.sales ?? []);
    } catch {
      setError({ message: "Couldn't load sales. Check your connection." });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadSales(); }, []);

  const filtered = sales.filter((s) => {
    const q = search.toLowerCase();
    const matchSearch = !q || s.invoiceNumber.toLowerCase().includes(q) ||
      s.customerName.toLowerCase().includes(q) || s.customerPhone.includes(q);
    const matchPayment = !filterPayment || s.paymentStatus === filterPayment;
    return matchSearch && matchPayment;
  });

  if (loading) return <LoadingGecko size="full" label="Loading sales…" />;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Sales</h1>
          <div className="page-subtitle">{filtered.length} of {sales.length} records</div>
        </div>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>
          + New Sale
        </button>
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
        <button className="btn btn-ghost btn-sm" onClick={loadSales}>↻ Refresh</button>
      </div>

      {/* Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {filtered.length === 0 ? (
          <div className="empty-state">
            <div style={{ fontSize: 28 }}>◆</div>
            <div className="empty-state-title">No sales yet</div>
            <div style={{ fontSize: 13, color: 'var(--color-ink-muted)' }}>
              {search || filterPayment ? 'Try clearing the filters.' : 'Click "+ New Sale" to record your first sale.'}
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
                  <th>Date</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((sale) => (
                  <tr key={sale.invoiceNumber}>
                    <td>
                      <span style={{
                        fontFamily: 'var(--font-display)',
                        fontWeight: 700,
                        color: 'var(--color-brand-primary)',
                        fontSize: 13,
                      }}>
                        {sale.invoiceNumber}
                      </span>
                    </td>
                    <td>
                      <div style={{ fontWeight: 500 }}>{sale.customerName}</div>
                      <div style={{ fontSize: 12, color: 'var(--color-ink-muted)' }}>{sale.customerPhone}</div>
                    </td>
                    <td>
                      <div className="truncate" style={{ maxWidth: 160 }} title={sale.itemNames}>
                        {sale.itemNames}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--color-ink-muted)' }}>{sale.sizes}</div>
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
                    <td style={{ fontSize: 12, color: 'var(--color-ink-muted)' }}>
                      {sale.createdAt ? new Date(sale.createdAt).toLocaleDateString('en-IN') : '—'}
                    </td>
                    <td>
                      <Link
                        href={`/dashboard/sales/${sale.invoiceNumber}`}
                        className="btn btn-icon btn-sm"
                        title="View / Edit"
                      >
                        →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && (
        <NewSaleModal
          onClose={() => setShowModal(false)}
          onSuccess={() => { setShowModal(false); loadSales(); }}
        />
      )}
    </div>
  );
}
