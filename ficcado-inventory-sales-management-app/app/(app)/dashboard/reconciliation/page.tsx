'use client';

/**
 * app/(app)/dashboard/reconciliation/page.tsx
 * Dedicated Stock Reconciliation Page.
 *
 * Compares Total Main Inventory Stock against Total Warehouse Allocated Stock
 * per item and size variant, flagging over-allocations or discrepancies.
 */

import { useEffect, useState } from 'react';
import LoadingGecko from '@/components/LoadingGecko';
import ErrorMessage, { parseApiError } from '@/components/ErrorMessage';

interface ReconItem {
  itemName:       string;
  size:           string;
  inventoryTotal: number;
  warehouseTotal: number;
  difference:     number;
  mismatch:       boolean;
}

interface Stats {
  totalTracked:    number;
  totalReconciled: number;
  totalMismatches: number;
}

export default function ReconciliationPage() {
  const [items, setItems]       = useState<ReconItem[]>([]);
  const [stats, setStats]       = useState<Stats>({ totalTracked: 0, totalReconciled: 0, totalMismatches: 0 });
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<{ message: string } | null>(null);
  const [search, setSearch]     = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'mismatches' | 'reconciled'>('all');

  async function loadData() {
    setLoading(true);
    try {
      const res = await fetch('/api/reconciliation');
      const data = await res.json();
      if (!res.ok) { setError(parseApiError(data)); return; }
      setItems(data.recon || []);
      setStats(data.stats || { totalTracked: 0, totalReconciled: 0, totalMismatches: 0 });
    } catch {
      setError({ message: "Couldn't load stock reconciliation data." });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadData(); }, []);

  const filtered = items.filter((item) => {
    const q = search.toLowerCase();
    const matchesSearch = !q || item.itemName.toLowerCase().includes(q) || item.size.toLowerCase().includes(q);
    const matchesFilter =
      filterMode === 'all' ? true :
      filterMode === 'mismatches' ? item.mismatch :
      !item.mismatch;
    return matchesSearch && matchesFilter;
  });

  if (loading) return <LoadingGecko size="full" label="Loading stock reconciliation details…" />;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Stock Reconciliation</h1>
          <div className="page-subtitle">Verify total main inventory stock against allocated warehouse stock</div>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={loadData}>↻ Refresh Data</button>
      </div>

      {error && <ErrorMessage message={error.message} variant="error" onDismiss={() => setError(null)} />}

      {/* Summary KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 20 }}>
        <div className="card" style={{ padding: '16px 20px' }}>
          <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-ink-muted)', marginBottom: 6 }}>
            Tracked Item Variants
          </div>
          <div style={{ fontSize: 24, fontWeight: 700, fontFamily: 'var(--font-display)', color: 'var(--color-ink)' }}>
            {stats.totalTracked}
          </div>
        </div>

        <div className="card" style={{ padding: '16px 20px', borderLeft: '4px solid #2e7d32' }}>
          <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-ink-muted)', marginBottom: 6 }}>
            Reconciled Stock Variants
          </div>
          <div style={{ fontSize: 24, fontWeight: 700, fontFamily: 'var(--font-display)', color: '#2e7d32' }}>
            {stats.totalReconciled}
          </div>
        </div>

        <div className="card" style={{ padding: '16px 20px', borderLeft: '4px solid #e53935' }}>
          <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-ink-muted)', marginBottom: 6 }}>
            Stock Discrepancies / Mismatches
          </div>
          <div style={{ fontSize: 24, fontWeight: 700, fontFamily: 'var(--font-display)', color: stats.totalMismatches > 0 ? '#e53935' : 'var(--color-ink)' }}>
            {stats.totalMismatches}
          </div>
        </div>
      </div>

      {/* Filters & Search */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <div className="search-bar" style={{ flex: 1, minWidth: 260 }}>
          <span style={{ color: 'var(--color-ink-muted)' }}>⌕</span>
          <input
            type="text"
            placeholder="Search item name or size..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div style={{ display: 'flex', gap: 6, background: 'rgba(0,0,0,0.04)', padding: 4, borderRadius: 8 }}>
          <button
            className={`btn btn-sm ${filterMode === 'all' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setFilterMode('all')}
          >
            All Items ({items.length})
          </button>
          <button
            className={`btn btn-sm ${filterMode === 'mismatches' ? 'btn-danger' : 'btn-ghost'}`}
            onClick={() => setFilterMode('mismatches')}
          >
            Mismatches Only ({stats.totalMismatches})
          </button>
          <button
            className={`btn btn-sm ${filterMode === 'reconciled' ? 'btn-secondary' : 'btn-ghost'}`}
            onClick={() => setFilterMode('reconciled')}
          >
            Reconciled Only ({stats.totalReconciled})
          </button>
        </div>
      </div>

      {/* Reconciliation Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {filtered.length === 0 ? (
          <div className="empty-state">
            <div style={{ fontSize: 28 }}>⚖</div>
            <div className="empty-state-title">No reconciliation entries match filter</div>
            <div style={{ fontSize: 13, color: 'var(--color-ink-muted)' }}>
              Change your search term or filter selection to view stock reconciliation status.
            </div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Item Name</th>
                  <th>Size Variant</th>
                  <th>Main Inventory Total</th>
                  <th>Warehouse Allocated Total</th>
                  <th>Unallocated Balance</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item, i) => (
                  <tr key={i} style={item.mismatch ? { background: 'rgba(229,57,53,0.06)' } : {}}>
                    <td style={{ fontWeight: 600 }}>{item.itemName}</td>
                    <td><span className="badge badge-neutral">{item.size}</span></td>
                    <td className="tabular-nums" style={{ fontWeight: 600 }}>{item.inventoryTotal} piece(s)</td>
                    <td className="tabular-nums">{item.warehouseTotal} piece(s)</td>
                    <td className="tabular-nums" style={{ fontWeight: 700 }}>
                      {item.difference} piece(s)
                    </td>
                    <td>
                      {item.mismatch ? (
                        <span className="badge badge-error">
                          ⚠ Mismatch (Exceeds main stock by {Math.abs(item.difference)} piece(s))
                        </span>
                      ) : (
                        <span className="badge badge-success">
                          ✓ Reconciled ({item.difference} unallocated)
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
