'use client';

/** app/(app)/dashboard/return-refund/page.tsx */
import React, { useEffect, useState } from 'react';
import LoadingGecko from '@/components/LoadingGecko';
import ErrorMessage, { parseApiError } from '@/components/ErrorMessage';

export default function ReturnRefundPage() {
  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ message: string } | null>(null);

  useEffect(() => {
    fetch('/api/return-refund')
      .then((r) => r.json())
      .then((d) => { if (d.records) setRecords(d.records); else setError(parseApiError(d)); })
      .catch(() => setError({ message: "Couldn't load returns." }))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingGecko size="full" label="Loading returns & refunds…" />;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Returns & Refunds</h1>
          <div className="page-subtitle">Item inspection and refund status tracking</div>
        </div>
      </div>
      {error && <ErrorMessage message={error.message} variant="error" />}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {records.length === 0 ? (
          <div className="empty-state">
            <div style={{ fontSize: 28 }}>↩</div>
            <div className="empty-state-title">No return or refund requests</div>
            <div style={{ fontSize: 13, color: 'var(--color-ink-muted)' }}>Returns will appear here.</div>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr><th>Invoice</th><th>Verification</th><th>Refund Amount</th><th>Mode</th><th>Refund Status</th></tr>
            </thead>
            <tbody>
              {records.map((r, i) => (
                <tr key={i}>
                  <td style={{ fontWeight: 700, color: 'var(--color-brand-primary)' }}>{r.invoiceNumber}</td>
                  <td>{r.verificationStatus}</td>
                  <td className="tabular-nums" style={{ fontWeight: 700 }}>₹{parseFloat(r.refundAmount || '0').toLocaleString('en-IN')}</td>
                  <td>{r.modeOfRefund}</td>
                  <td><span className="badge badge-warning">{r.refundStatus}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
