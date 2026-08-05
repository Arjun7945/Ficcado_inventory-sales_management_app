'use client';

/** app/(app)/dashboard/replacement/page.tsx */
import React, { useEffect, useState } from 'react';
import LoadingGecko from '@/components/LoadingGecko';
import ErrorMessage, { parseApiError } from '@/components/ErrorMessage';

export default function ReplacementPage() {
  const [replacements, setReplacements] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ message: string } | null>(null);

  useEffect(() => {
    fetch('/api/replacement')
      .then((r) => r.json())
      .then((d) => { if (d.replacements) setReplacements(d.replacements); else setError(parseApiError(d)); })
      .catch(() => setError({ message: "Couldn't load replacements." }))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingGecko size="full" label="Loading replacements…" />;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Replacement Management</h1>
          <div className="page-subtitle">Process item exchanges and replacement orders</div>
        </div>
      </div>
      {error && <ErrorMessage message={error.message} variant="error" />}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {replacements.length === 0 ? (
          <div className="empty-state">
            <div style={{ fontSize: 28 }}>⟳</div>
            <div className="empty-state-title">No replacements pending</div>
            <div style={{ fontSize: 13, color: 'var(--color-ink-muted)' }}>Exchanges will appear here.</div>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr><th>Invoice</th><th>Returned Item</th><th>New Item</th><th>Status</th></tr>
            </thead>
            <tbody>
              {replacements.map((r, i) => (
                <tr key={i}>
                  <td style={{ fontWeight: 700, color: 'var(--color-brand-primary)' }}>{r.invoiceNumber}</td>
                  <td>{r.lastItems} ({r.lastSizes})</td>
                  <td>{r.newItems} ({r.newSizes})</td>
                  <td><span className="badge badge-warning">{r.invoiceStatus}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
