'use client';

/**
 * app/(app)/dashboard/inventory-history/page.tsx
 * Inventory History Tracker UI (Part 2).
 *
 * Audit trail showing every stock deduction, addition, allocation, deallocation,
 * replacement restock, refund restock, and damaged disposal with running balances.
 */

import { useEffect, useState } from 'react';
import LoadingGecko from '@/components/LoadingGecko';
import ErrorMessage, { parseApiError } from '@/components/ErrorMessage';

interface HistoryRecord {
  rowIndex:             number;
  sno:                  string;
  itemName:             string;
  size:                 string;
  quantityChange:       string;
  affectedSheet:        string;
  handler:              string;
  transactionType:      string;
  relatedInvoiceNumber: string;
  resultingBalance:     string;
  createdAt:            string;
  createdBy:            string;
  notes:                string;
}

const TRANSACTION_BADGE: Record<string, string> = {
  'Sale Deduction':                   'badge-error',
  'Replacement — Old Item Restock':   'badge-success',
  'Replacement — New Item Deduction': 'badge-warning',
  'Refund Restock':                   'badge-success',
  'Warehouse Allocation':             'badge-info',
  'Warehouse Deallocation':           'badge-neutral',
  'Damaged Disposal':                 'badge-error',
  'Manual Adjustment':                'badge-neutral',
};

export default function InventoryHistoryPage() {
  const [history, setHistory]       = useState<HistoryRecord[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<{ message: string } | null>(null);
  const [search, setSearch]         = useState('');
  const [filterType, setFilterType] = useState('');

  async function loadData() {
    setLoading(true);
    try {
      const res = await fetch('/api/inventory-history');
      const data = await res.json();
      if (!res.ok) { setError(parseApiError(data)); return; }
      setHistory((data.history ?? []).reverse()); // newest first
    } catch {
      setError({ message: "Couldn't load inventory history." });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadData(); }, []);

  const filtered = history.filter((h) => {
    const q = search.toLowerCase();
    const matchSearch = !q ||
      h.itemName.toLowerCase().includes(q) ||
      h.relatedInvoiceNumber.toLowerCase().includes(q) ||
      h.handler.toLowerCase().includes(q) ||
      h.createdBy.toLowerCase().includes(q) ||
      h.notes.toLowerCase().includes(q);
    const matchType = !filterType || h.transactionType === filterType;
    return matchSearch && matchType;
  });

  if (loading) return <LoadingGecko size="full" label="Loading audit history…" />;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Inventory History Tracker</h1>
          <div className="page-subtitle">Audit trail of stock changes — {filtered.length} transaction{filtered.length !== 1 ? 's' : ''}</div>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={loadData}>↻ Refresh</button>
      </div>

      {error && <ErrorMessage message={error.message} variant="error" onDismiss={() => setError(null)} />}

      {/* Filter / Search */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <div className="search-bar" style={{ flex: 1, minWidth: 220 }}>
          <span style={{ color: 'var(--color-ink-muted)' }}>⌕</span>
          <input
            type="text"
            placeholder="Search item, invoice, handler, admin..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          className="form-select"
          style={{ width: 220 }}
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
        >
          <option value="">All Transaction Types</option>
          <option value="Sale Deduction">Sale Deduction</option>
          <option value="Replacement — Old Item Restock">Replacement — Old Item Restock</option>
          <option value="Replacement — New Item Deduction">Replacement — New Item Deduction</option>
          <option value="Refund Restock">Refund Restock</option>
          <option value="Warehouse Allocation">Warehouse Allocation</option>
          <option value="Warehouse Deallocation">Warehouse Deallocation</option>
          <option value="Damaged Disposal">Damaged Disposal</option>
          <option value="Manual Adjustment">Manual Adjustment</option>
        </select>
      </div>

      {/* Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {filtered.length === 0 ? (
          <div className="empty-state">
            <div style={{ fontSize: 28 }}>📊</div>
            <div className="empty-state-title">No inventory history logs</div>
            <div style={{ fontSize: 13, color: 'var(--color-ink-muted)' }}>
              Stock transactions across sales, warehouse allocations, replacements, and refunds will appear here automatically.
            </div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Item & Size</th>
                  <th>Quantity Change</th>
                  <th>Transaction Type</th>
                  <th>Affected Sheet</th>
                  <th>Handler / Location</th>
                  <th>Invoice #</th>
                  <th>Resulting Balance</th>
                  <th>Admin</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((h, i) => {
                  const changeNum = parseFloat(h.quantityChange) || 0;
                  const isPositive = changeNum > 0;
                  return (
                    <tr key={i}>
                      <td style={{ fontSize: 12, color: 'var(--color-ink-muted)', whiteSpace: 'nowrap' }}>
                        {h.createdAt ? new Date(h.createdAt).toLocaleString('en-IN') : '—'}
                      </td>
                      <td>
                        <div style={{ fontWeight: 600 }}>{h.itemName}</div>
                        <span className="badge badge-neutral" style={{ fontSize: 10 }}>{h.size}</span>
                      </td>
                      <td className="tabular-nums">
                        <span className={`badge ${isPositive ? 'badge-success' : 'badge-error'}`} style={{ fontWeight: 700 }}>
                          {h.quantityChange} piece(s)
                        </span>
                      </td>
                      <td>
                        <span className={`badge ${TRANSACTION_BADGE[h.transactionType] ?? 'badge-neutral'}`} style={{ fontSize: 11 }}>
                          {h.transactionType}
                        </span>
                      </td>
                      <td>
                        <span className="badge badge-info">{h.affectedSheet}</span>
                      </td>
                      <td>{h.handler ? `👤 ${h.handler}` : '—'}</td>
                      <td>
                        {h.relatedInvoiceNumber ? (
                          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, color: 'var(--color-brand-primary)' }}>
                            {h.relatedInvoiceNumber}
                          </span>
                        ) : '—'}
                      </td>
                      <td className="tabular-nums" style={{ fontWeight: 700 }}>
                        {h.resultingBalance} piece(s)
                      </td>
                      <td style={{ fontSize: 12 }}>{h.createdBy}</td>
                      <td style={{ fontSize: 12, color: 'var(--color-ink-muted)', maxWidth: 180 }} className="truncate" title={h.notes}>
                        {h.notes || '—'}
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
