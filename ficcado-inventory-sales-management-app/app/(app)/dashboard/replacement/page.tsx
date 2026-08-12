'use client';

/**
 * app/(app)/dashboard/replacement/page.tsx
 * Clean, High-Speed Replacement Directory Page.
 *
 * Displays all active replacement records with full details:
 * Original Purchased Items, Exchanged Items, Issued Replacement Items, Total Amount,
 * Stock Source, Disposition, and Status with quick navigation to dedicated handling page.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import LoadingGecko from '@/components/LoadingGecko';
import ErrorMessage, { parseApiError } from '@/components/ErrorMessage';
import MobileBackButton from '@/components/MobileBackButton';

interface ReplacementRecord {
  rowIndex:                            number;
  invoiceNumber:                       string;
  totalItems:                          string;
  lastItems:                           string;
  lastSizes:                           string;
  newItems:                            string;
  newSizes:                            string;
  invoiceStatus:                       string;
  disposition:                         string;
  restockDestination:                  string;
  removedItemFromLastPurchase?:         string;
  sizesOfRemovedItemFromLastPurchase?:  string;
  numberOfRemovedItemFromLastPurchase?: string;
  newFinalItemsSelected?:               string;
  newFinalItemsSizes?:                  string;
  numberOfNewFinalItems?:               string;
  newFinalItemsPricesEach?:             string;
  newFinalItemsTotalAmount?:            string;
  newStockSource?:                      string;
  createdAt:                           string;
  createdBy:                           string;
  version:                             string;
}

function formatSizesWithCounts(sizesStr: string): string {
  if (!sizesStr) return '—';
  const sizes = sizesStr.split(',').map((s) => s.trim()).filter(Boolean);
  const countsMap: Record<string, number> = {};
  sizes.forEach((sz) => {
    countsMap[sz] = (countsMap[sz] || 0) + 1;
  });
  return Object.entries(countsMap)
    .map(([sz, count]) => (count > 1 ? `${sz}(x${count})` : sz))
    .join(', ');
}

export default function ReplacementPage() {
  const [replacements, setReplacements] = useState<ReplacementRecord[]>([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState<{ message: string } | null>(null);
  const [search, setSearch]             = useState('');
  const [deleting, setDeleting]         = useState<string | null>(null);

  async function loadReplacements() {
    setLoading(true);
    try {
      const res  = await fetch('/api/replacement');
      const data = await res.json();
      if (!res.ok) { setError(parseApiError(data)); return; }
      setReplacements(data.replacements ?? []);
    } catch {
      setError({ message: "Couldn't load replacements." });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadReplacements(); }, []);

  async function handleDelete(invoiceNumber: string) {
    if (!confirm(`Delete replacement record for invoice '${invoiceNumber}'?`)) return;
    setDeleting(invoiceNumber);
    try {
      const res = await fetch(`/api/replacement/${encodeURIComponent(invoiceNumber)}`, { method: 'DELETE' });
      if (!res.ok) {
        const d = await res.json();
        setError(parseApiError(d));
        return;
      }
      loadReplacements();
    } catch {
      setError({ message: "Couldn't delete replacement record." });
    } finally {
      setDeleting(null);
    }
  }

  const filtered = replacements.filter((r) => {
    const q = search.toLowerCase();
    return (
      r.invoiceNumber.toLowerCase().includes(q) ||
      r.lastItems.toLowerCase().includes(q) ||
      (r.newFinalItemsSelected || r.newItems || '').toLowerCase().includes(q) ||
      r.invoiceStatus.toLowerCase().includes(q) ||
      (r.removedItemFromLastPurchase || '').toLowerCase().includes(q)
    );
  });

  return (
    <div>
      <MobileBackButton />

      <div className="page-header" style={{ marginBottom: 20 }}>
        <div>
          <h1 className="page-title">Replacement Management</h1>
          <div style={{ fontSize: 13, color: 'var(--color-ink-muted)', marginTop: 4 }}>
            Track, manage, and complete customer replacement requests & stock transfers
          </div>
        </div>
      </div>

      {error && <ErrorMessage message={error.message} variant="error" onDismiss={() => setError(null)} />}

      <div style={{ marginBottom: 16 }}>
        <input
          type="text"
          className="form-input"
          placeholder="Search by invoice #, item name, or status…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ maxWidth: 360 }}
        />
      </div>

      {/* ── Mobile Card List View ────────────────────────────────────────── */}
      <div className="mobile-only">
        {loading ? (
          <div className="card" style={{ padding: 36, textAlign: 'center' }}>
            <LoadingGecko label="Loading replacement tickets…" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="card empty-state">
            <div style={{ fontSize: 28 }}>⟳</div>
            <div className="empty-state-title">No replacements found</div>
          </div>
        ) : (
          <div className="mobile-card-list">
            {filtered.map((r) => {
              const isDone = r.invoiceStatus === 'Satisfied / Completed Order';
              return (
                <div key={r.invoiceNumber} className="mobile-data-card">
                  <div className="mobile-data-card-header">
                    <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, color: 'var(--color-brand-primary)', fontSize: 14 }}>
                      {r.invoiceNumber}
                    </span>
                    <span className={`badge ${isDone ? 'badge-success' : 'badge-warning'}`}>
                      {r.invoiceStatus}
                    </span>
                  </div>

                  <div style={{ fontSize: 13, fontWeight: 500 }}>
                    Original: {r.lastItems} ({r.lastSizes})
                  </div>

                  {r.removedItemFromLastPurchase && (
                    <div style={{ fontSize: 12, color: 'var(--color-error)' }}>
                      Exchanged Item: {r.removedItemFromLastPurchase} ({r.sizesOfRemovedItemFromLastPurchase})
                    </div>
                  )}

                  <div style={{ fontSize: 12, color: 'var(--color-success)' }}>
                    Replacement: {r.newItems || r.newFinalItemsSelected || 'Pending Selection'}
                  </div>

                  <div className="mobile-data-card-actions">
                    <Link href={`/dashboard/replacement/${encodeURIComponent(r.invoiceNumber)}`} className="btn btn-primary btn-sm" style={{ flex: 1, justifyContent: 'center', textDecoration: 'none' }}>
                      Manage / Update Stepper →
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
          <div style={{ padding: 40 }}><LoadingGecko size="full" label="Loading replacements data…" /></div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--color-ink-muted)' }}>
            No replacement records found.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Invoice #</th>
                  <th>Original Purchase</th>
                  <th>Exchanged Item(s)</th>
                  <th>New Replacement Item(s)</th>
                  <th>Customer's Final Basket Total</th>
                  <th>Disposition</th>
                  <th>Stock Source</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, i) => {
                  const isDone = r.invoiceStatus === 'Satisfied / Completed Order';
                  return (
                    <tr key={i}>
                      <td style={{ fontWeight: 700, color: 'var(--color-brand-primary)', fontFamily: 'var(--font-display)' }}>
                        <Link href={`/dashboard/replacement/${encodeURIComponent(r.invoiceNumber)}`} style={{ textDecoration: 'none', color: 'var(--color-brand-primary)' }}>
                          {r.invoiceNumber}
                        </Link>
                      </td>
                      <td>
                        <div>{r.lastItems}</div>
                        <div style={{ color: 'var(--color-ink-muted)', fontSize: 11 }}>
                          Sizes: {formatSizesWithCounts(r.lastSizes)} ({r.totalItems || '1'} pcs)
                        </div>
                      </td>
                      <td>
                        <div>{r.removedItemFromLastPurchase || '—'}</div>
                        {r.sizesOfRemovedItemFromLastPurchase && (
                          <div style={{ color: 'var(--color-ink-muted)', fontSize: 11 }}>
                            Size: {r.sizesOfRemovedItemFromLastPurchase} (Qty: {r.numberOfRemovedItemFromLastPurchase || '1'})
                          </div>
                        )}
                      </td>
                      <td>
                        <div>{r.newItems || r.newFinalItemsSelected || '—'}</div>
                        {(r.newSizes || r.newFinalItemsSizes) && (
                          <div style={{ color: 'var(--color-ink-muted)', fontSize: 11 }}>
                            Size: {r.newSizes || r.newFinalItemsSizes} (Qty: {r.numberOfNewFinalItems || '1'})
                          </div>
                        )}
                      </td>
                      <td style={{ fontWeight: 700, color: 'var(--color-brand-primary)' }}>
                        {r.newFinalItemsTotalAmount ? `₹${r.newFinalItemsTotalAmount}` : '—'}
                      </td>
                      <td>{r.disposition ? <span className="badge badge-info">{r.disposition}</span> : '—'}</td>
                      <td>{r.newStockSource ? <span className="badge badge-neutral">{r.newStockSource}</span> : '—'}</td>
                      <td>
                        <span className={`badge ${isDone ? 'badge-success' : 'badge-warning'}`}>
                          {r.invoiceStatus}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <Link href={`/dashboard/replacement/${encodeURIComponent(r.invoiceNumber)}`} className="btn btn-secondary btn-sm" style={{ textDecoration: 'none' }}>
                            Manage / Update
                          </Link>
                          <button className="btn btn-danger btn-sm" onClick={() => handleDelete(r.invoiceNumber)} disabled={deleting === r.invoiceNumber}>
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

