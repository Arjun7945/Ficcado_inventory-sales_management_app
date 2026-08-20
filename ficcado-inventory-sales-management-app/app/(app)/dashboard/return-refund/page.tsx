'use client';

/**
 * app/(app)/dashboard/return-refund/page.tsx
 * Return & Refund Management — Part 4 Implementation.
 *
 * Full list view of Return & Refund tickets.
 * Links each record to its dedicated processing page at /dashboard/return-refund/[id].
 * Old inline modal implementation removed entirely per B2.A directive.
 */

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import LoadingGecko from '@/components/LoadingGecko';
import ErrorMessage, { parseApiError } from '@/components/ErrorMessage';
import MobileBackButton from '@/components/MobileBackButton';
import StatusBadge from '@/components/StatusBadge';

interface ReturnRecord {
  rowIndex:           number;
  invoiceNumber:      string;
  verificationStatus: string;
  refundStatus:       string;
  refundAmount:       string;
  refundCompletedAt:  string;
  transactionId:      string;
  modeOfRefund:       string;
  disposition:        string;
  restockDestination: string;
  returnedItems:      string;
  returnedSizes:      string;
  returnedQty:        string;
  createdAt:          string;
  createdBy:          string;
  version:            string;
}

export default function ReturnRefundPage() {
  const [records, setRecords]   = useState<ReturnRecord[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<{ message: string } | null>(null);
  const [success, setSuccess]   = useState<string | null>(null);
  const [search, setSearch]     = useState('');
  const [deleting, setDeleting] = useState<string | null>(null);

  async function loadRecords() {
    setLoading(true);
    try {
      const res = await fetch('/api/return-refund');
      const data = await res.json();
      if (!res.ok) { setError(parseApiError(data)); return; }
      setRecords(data.records ?? []);
    } catch { setError({ message: "Couldn't load return/refund records." }); }
    finally { setLoading(false); }
  }

  useEffect(() => { loadRecords(); }, []);

  async function handleDelete(r: ReturnRecord) {
    if (!confirm(`Delete return/refund record for '${r.invoiceNumber}'?`)) return;
    setDeleting(r.invoiceNumber);
    try {
      const res = await fetch(`/api/return-refund/${encodeURIComponent(r.invoiceNumber)}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) { setError(parseApiError(data)); return; }
      setSuccess(`Return/Refund record for ${r.invoiceNumber} deleted.`);
      loadRecords();
    } catch { setError({ message: "Couldn't delete record." }); }
    finally { setDeleting(null); }
  }

  const filtered = records.filter((r) =>
    !search || r.invoiceNumber?.toLowerCase().includes(search.toLowerCase()) ||
    r.returnedItems?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <MobileBackButton />

      <div className="page-header">
        <div>
          <h1 className="page-title">Returns & Refunds</h1>
          <div className="page-subtitle">Manage return processing and refund tracking — {records.length} record{records.length !== 1 ? 's' : ''}</div>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={loadRecords} disabled={loading}>
          ⟳ Refresh
        </button>
      </div>

      {error && <ErrorMessage message={error.message} variant="error" onDismiss={() => setError(null)} />}
      {success && <ErrorMessage message={success} variant="success" onDismiss={() => setSuccess(null)} />}

      {/* Search */}
      <div className="card" style={{ padding: '10px 14px', marginBottom: 16 }}>
        <input
          type="text"
          className="form-input"
          placeholder="Search by invoice number or item name…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* ── Mobile Card List View ────────────────────────────────────────── */}
      <div className="mobile-only">
        {loading ? (
          <div className="card" style={{ padding: 36, textAlign: 'center' }}>
            <LoadingGecko label="Loading return/refund tickets…" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="card empty-state">
            <div style={{ fontSize: 28 }}>↩</div>
            <div className="empty-state-title">No return/refund records</div>
          </div>
        ) : (
          <div className="mobile-card-list">
            {filtered.map((r) => {
              const isDone = r.refundStatus === 'Completed' || r.refundStatus === 'Refund Completed';
              return (
                <div key={r.invoiceNumber} className="mobile-data-card">
                  <div className="mobile-data-card-header">
                    <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, color: 'var(--color-brand-primary)', fontSize: 14 }}>
                      {r.invoiceNumber}
                    </span>
                    <span className={`badge ${isDone ? 'badge-success' : 'badge-warning'}`}>
                      {r.refundStatus}
                    </span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>
                      Items: {r.returnedItems || 'Pending Selection'}
                    </div>
                    <div style={{ fontWeight: 700, fontSize: 14, fontFamily: 'var(--font-display)', color: 'var(--color-error)' }}>
                      ₹{(parseFloat(String(r.refundAmount || '0').replace(/[^0-9.]/g, '')) || 0).toLocaleString('en-IN')}
                    </div>
                  </div>

                  {r.verificationStatus && (
                    <div style={{ fontSize: 12, color: 'var(--color-ink-muted)' }}>
                      Verification: <span className="badge badge-neutral">{r.verificationStatus}</span>
                    </div>
                  )}

                  <div className="mobile-data-card-actions">
                    <Link href={`/dashboard/return-refund/${encodeURIComponent(r.invoiceNumber)}`} className="btn btn-primary btn-sm" style={{ flex: 1, justifyContent: 'center', textDecoration: 'none' }}>
                      Manage Ticket →
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Desktop Table View ─────────────────────────────────────────── */}
      <div className="desktop-only card" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 48, textAlign: 'center' }}>
            <LoadingGecko label="Loading return and refund records…" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <div style={{ fontSize: 28 }}>↩</div>
            <div className="empty-state-title">No return/refund records</div>
            <div style={{ fontSize: 13, color: 'var(--color-ink-muted)' }}>
              Sales marked as &quot;Return/Refund Requested&quot; will automatically appear here for processing.
            </div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Invoice #</th>
                  <th>Verification</th>
                  <th>Refund Status</th>
                  <th>Amount</th>
                  <th>Returned Item(s)</th>
                  <th>Disposition</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, i) => {
                  const isDone = r.refundStatus === 'Completed' || r.refundStatus === 'Refund Completed';
                  return (
                    <tr key={i}>
                      <td>
                        <Link
                          href={`/dashboard/return-refund/${encodeURIComponent(r.invoiceNumber)}`}
                          style={{
                            fontWeight: 700,
                            color: 'var(--color-brand-primary)',
                            fontFamily: 'var(--font-display)',
                            textDecoration: 'none',
                          }}
                        >
                          {r.invoiceNumber}
                        </Link>
                      </td>
                      <td>
                        <StatusBadge status={r.verificationStatus || 'Pending'} />
                      </td>
                      <td>
                        <StatusBadge status={r.refundStatus} />
                      </td>
                      <td style={{ fontWeight: 600 }} className="tabular-nums">
                        ₹{(parseFloat(String(r.refundAmount || '0').replace(/[^0-9.]/g, '')) || 0).toLocaleString('en-IN')}
                      </td>
                      <td>
                        {r.returnedItems ? (
                          <div>
                            <div style={{ fontWeight: 500 }}>{r.returnedItems}</div>
                            {r.returnedSizes && <div style={{ fontSize: 11, color: 'var(--color-ink-muted)' }}>Sizes: {r.returnedSizes}</div>}
                          </div>
                        ) : (
                          <span style={{ color: 'var(--color-ink-muted)', fontSize: 12 }}>—</span>
                        )}
                      </td>
                      <td>{r.disposition ? <span className="badge badge-info">{r.disposition}</span> : '—'}</td>
                      <td>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <Link
                            href={`/dashboard/return-refund/${encodeURIComponent(r.invoiceNumber)}`}
                            className="btn btn-secondary btn-sm"
                          >
                            Manage Return / Refund →
                          </Link>
                          <button
                            className="btn btn-danger btn-sm"
                            onClick={() => handleDelete(r)}
                            disabled={deleting === r.invoiceNumber}
                          >
                            {deleting === r.invoiceNumber ? '…' : 'Delete'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

