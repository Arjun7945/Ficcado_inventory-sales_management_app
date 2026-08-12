'use client';

/**
 * app/(app)/dashboard/sales-log/page.tsx
 *
 * Sales Log Audit Trail page — view comprehensive narrative history
 * of all transactional events across Sales, Replacement, Return/Refund,
 * Damaged Products, and Items management modules.
 */

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import LoadingGecko from '@/components/LoadingGecko';
import ErrorMessage from '@/components/ErrorMessage';
import MobileBackButton from '@/components/MobileBackButton';

interface SalesLogItem {
  sno: string;
  module: string;
  operation: string;
  relatedInvoiceNumber: string;
  message: string;
  createdAt: string;
  createdBy: string;
}

const MODULE_OPTIONS = ['ALL', 'Sales', 'Replacement', 'Return/Refund', 'Damaged Products', 'Items'];

export default function SalesLogPage() {
  const [logs, setLogs] = useState<SalesLogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ message: string } | null>(null);

  const [selectedModule, setSelectedModule] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);

  async function fetchLogs(silent = false) {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (selectedModule !== 'ALL') params.set('module', selectedModule);
      if (searchQuery.trim()) params.set('search', searchQuery.trim());

      const res = await fetch(`/api/sales-log?${params.toString()}`);
      const data = await res.json();

      if (!res.ok) {
        if (!silent) setError({ message: data.error || 'Failed to fetch sales log.' });
        return;
      }

      setLogs(data.logs || []);

      // Mark sales log as read now
      localStorage.setItem('ficcado_last_read_sales_log_time', new Date().toISOString());
    } catch {
      if (!silent) setError({ message: 'Network error while loading sales log entries.' });
    } finally {
      if (!silent) setLoading(false);
    }
  }

  useEffect(() => {
    fetchLogs();

    // Setup 15-second polling for live updates
    pollTimerRef.current = setInterval(() => {
      fetchLogs(true);
    }, 15_000);

    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [selectedModule]);

  return (
    <div>
      <MobileBackButton />

      {/* Page Header */}
      <div className="page-header" style={{ marginBottom: 20 }}>
        <div>
          <h1 className="page-title" style={{ fontSize: 24, color: 'var(--color-brand-primary)' }}>
            Sales Log Audit Trail
          </h1>
          <div className="page-subtitle">
            Narrative transaction audit log — auto-refreshes every 15s
          </div>
        </div>

        <button className="btn btn-ghost btn-sm" onClick={() => fetchLogs()} disabled={loading}>
          ↻ Refresh Logs
        </button>
      </div>

      {error && <ErrorMessage message={error.message} variant="error" onDismiss={() => setError(null)} />}

      {/* Filter Bar */}
      <div className="card" style={{ marginBottom: 20, padding: 16 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'center' }}>
          <div style={{ flex: '1 1 240px' }}>
            <label className="form-label" style={{ fontSize: 12, marginBottom: 4 }}>Search Logs</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="text"
                className="form-input"
                placeholder="Search invoice #, admin, or log text…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') fetchLogs(); }}
              />
              <button className="btn btn-secondary btn-sm" onClick={() => fetchLogs()}>
                Search
              </button>
            </div>
          </div>

          <div style={{ width: 180 }}>
            <label className="form-label" style={{ fontSize: 12, marginBottom: 4 }}>Filter by Module</label>
            <select
              className="form-select"
              value={selectedModule}
              onChange={(e) => setSelectedModule(e.target.value)}
            >
              {MODULE_OPTIONS.map((mod) => (
                <option key={mod} value={mod}>
                  {mod === 'ALL' ? 'All Modules' : mod}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* ── Mobile Card List View ────────────────────────────────────────── */}
      <div className="mobile-only">
        {loading ? (
          <div className="card" style={{ padding: 36, textAlign: 'center' }}>
            <LoadingGecko label="Loading live Sales Log feed…" />
          </div>
        ) : logs.length === 0 ? (
          <div className="card empty-state">
            <div style={{ fontSize: 28 }}>📋</div>
            <div className="empty-state-title">No Sales Log Entries</div>
          </div>
        ) : (
          <div className="mobile-card-list">
            {logs.map((log) => (
              <div key={log.sno + log.createdAt} className="mobile-data-card">
                <div className="mobile-data-card-header">
                  <span className="badge badge-primary" style={{ fontSize: 11 }}>
                    {log.module}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--color-ink-muted)' }}>
                    {new Date(log.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>

                <div style={{ fontSize: 12.5, fontWeight: 600 }}>
                  {log.operation} {log.relatedInvoiceNumber ? `— Invoice ${log.relatedInvoiceNumber}` : ''}
                </div>

                <div style={{ fontSize: 12, color: 'var(--color-ink)', lineHeight: 1.4 }}>
                  {log.message}
                </div>

                <div style={{ fontSize: 11, color: 'var(--color-ink-muted)', marginTop: 4, display: 'flex', justifyContent: 'space-between' }}>
                  <span>By {log.createdBy}</span>
                  <span>{new Date(log.createdAt).toLocaleDateString('en-IN')}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Desktop Table View ─────────────────────────────────────────── */}
      <div className="desktop-only">
        {loading ? (
          <LoadingGecko size="full" label="Loading Sales Log audit trail…" />
        ) : logs.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--color-ink-muted)' }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>📋</div>
            <div style={{ fontWeight: 600, fontSize: 15 }}>No Sales Log Entries Found</div>
            <div style={{ fontSize: 13, marginTop: 4 }}>
              {selectedModule !== 'ALL' || searchQuery ? 'Try adjusting your filters or search terms.' : 'Sales log entries will appear automatically as transactional actions occur.'}
            </div>
          </div>
        ) : (
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table className="table" style={{ width: '100%', fontSize: 13 }}>
                <thead>
                  <tr>
                    <th style={{ width: 60, textAlign: 'center' }}>S.No</th>
                    <th style={{ width: 150 }}>Timestamp</th>
                    <th style={{ width: 130 }}>Module</th>
                    <th style={{ width: 100 }}>Operation</th>
                    <th style={{ width: 140 }}>Invoice #</th>
                    <th>Log Message</th>
                    <th style={{ width: 120 }}>Admin</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => {
                    const moduleBadgeColor =
                      log.module === 'Sales' ? 'badge-primary' :
                      log.module === 'Replacement' ? 'badge-warning' :
                      log.module === 'Return/Refund' ? 'badge-error' :
                      log.module === 'Damaged Products' ? 'badge-neutral' :
                      'badge-info';

                    return (
                      <tr key={log.sno + log.createdAt}>
                        <td style={{ textAlign: 'center', color: 'var(--color-ink-muted)' }}>{log.sno}</td>
                        <td style={{ whiteSpace: 'nowrap', fontSize: 12, color: 'var(--color-ink-muted)' }}>
                          {new Date(log.createdAt).toLocaleString('en-IN')}
                        </td>
                        <td>
                          <span className={`badge ${moduleBadgeColor}`} style={{ fontSize: 11 }}>
                            {log.module}
                          </span>
                        </td>
                        <td>
                          <strong style={{ fontSize: 12 }}>{log.operation}</strong>
                        </td>
                        <td>
                          {log.relatedInvoiceNumber ? (
                            <span style={{ fontFamily: 'monospace', fontWeight: 600, color: 'var(--color-brand-primary)' }}>
                              {log.relatedInvoiceNumber}
                            </span>
                          ) : (
                            <span style={{ color: 'var(--color-ink-muted)' }}>—</span>
                          )}
                        </td>
                        <td style={{ lineHeight: 1.4, color: 'var(--color-ink)' }}>
                          {log.message}
                        </td>
                        <td style={{ fontWeight: 600, fontSize: 12 }}>
                          {log.createdBy}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
