'use client';

/**
 * app/(app)/dashboard/activity/page.tsx
 * Activity Log viewer — shows human-readable activity timeline.
 */

import { useEffect, useState } from 'react';
import LoadingGecko from '@/components/LoadingGecko';
import ErrorMessage, { parseApiError } from '@/components/ErrorMessage';
import { formatISTDateTime } from '@/lib/dateUtils';

interface LogEntry {
  rowIndex:  number;
  adminName: string;
  action:    string;
  module:    string;
  recordId:  string;
  timestamp: string;
  message:   string;
}

export default function ActivityPage() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ message: string } | null>(null);

  useEffect(() => {
    fetch('/api/activity')
      .then((r) => r.json())
      .then((data) => {
        if (data.logs) setLogs(data.logs);
        else setError(parseApiError(data));
      })
      .catch(() => setError({ message: "Couldn't load activity log." }))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Activity Log</h1>
          <div className="page-subtitle">Audit trail of actions taken across all sheets</div>
        </div>
      </div>

      {error && <ErrorMessage message={error.message} variant="error" />}

      <div className="card">
        {loading ? (
          <div style={{ padding: 48, textAlign: 'center' }}>
            <LoadingGecko label="Loading activity audit trail…" />
          </div>
        ) : logs.length === 0 ? (
          <div className="empty-state">
            <div style={{ fontSize: 28 }}>◉</div>
            <div className="empty-state-title">No activity recorded yet</div>
            <div style={{ fontSize: 13, color: 'var(--color-ink-muted)' }}>
              Actions like creating or updating sales will appear here automatically.
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {logs.map((log, idx) => (
              <div
                key={log.timestamp + idx}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 14,
                  paddingBottom: 14,
                  borderBottom: idx < logs.length - 1 ? '1px solid var(--color-border)' : 'none',
                }}
              >
                <div style={{
                  width: 32, height: 32, borderRadius: '50%',
                  backgroundColor: log.action === 'created' ? 'rgba(47,125,79,0.12)' : log.action === 'deleted' ? 'rgba(176,64,58,0.12)' : 'rgba(43,98,198,0.12)',
                  color: log.action === 'created' ? 'var(--color-success)' : log.action === 'deleted' ? 'var(--color-error)' : 'var(--color-brand-primary)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontWeight: 700, fontSize: 13, flexShrink: 0,
                }}>
                  {log.action === 'created' ? '+' : log.action === 'deleted' ? '✕' : '✎'}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, color: 'var(--color-ink)', lineHeight: 1.5 }}>
                    {log.message || `${log.adminName} ${log.action} ${log.module} record '${log.recordId}'.`}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--color-ink-muted)', marginTop: 2 }}>
                    {formatISTDateTime(log.timestamp)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
