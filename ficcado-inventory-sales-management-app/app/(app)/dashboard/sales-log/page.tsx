'use client';

/**
 * app/(app)/dashboard/sales-log/page.tsx
 *
 * Sales Log Audit Trail page — view comprehensive narrative history
 * of all transactional events across Sales, Replacement, Return/Refund,
 * Damaged Products, and Items management modules.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import LoadingGecko from '@/components/LoadingGecko';
import ErrorMessage from '@/components/ErrorMessage';

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

  async function fetchLogs() {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (selectedModule !== 'ALL') params.set('module', selectedModule);
      if (searchQuery.trim()) params.set('search', searchQuery.trim());

      const res = await fetch(`/api/sales-log?${params.toString()}`);
      const data = await res.json();

      if (!res.ok) {
        setError({ message: data.error || 'Failed to fetch sales log.' });
        return;
      }

      setLogs(data.logs || []);
    } catch {
      setError({ message: 'Network error while loading sales log entries.' });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchLogs();
  }, [selectedModule]);

  return (
    <div>
      {/* Page Header */}
      <div className="page-header" style={{ marginBottom: 20 }}>
        <div>
          <h1 className="page-title" style={{ fontSize: 24, color: 'var(--color-brand-primary)' }}>
            Sales Log Audit Trail
          </h1>
          <div className="page-subtitle">
            Narrative transaction audit log for Sales, Replacement, Return/Refund, Damaged Products, and Items
          </div>
        </div>

        <button className="btn btn-ghost btn-sm" onClick={fetchLogs} disabled={loading}>
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
              <button className="btn btn-secondary btn-sm" onClick={fetchLogs}>
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

      {/* Audit Log Table */}
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
  );
}
