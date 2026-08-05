'use client';

/** app/(app)/dashboard/warehouse/page.tsx */
import React, { useEffect, useState } from 'react';
import LoadingGecko from '@/components/LoadingGecko';
import ErrorMessage, { parseApiError } from '@/components/ErrorMessage';

export default function WarehousePage() {
  const [warehouse, setWarehouse] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ message: string } | null>(null);

  useEffect(() => {
    fetch('/api/warehouse')
      .then((r) => r.json())
      .then((d) => { if (d.warehouse) setWarehouse(d.warehouse); else setError(parseApiError(d)); })
      .catch(() => setError({ message: "Couldn't load warehouse data." }))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingGecko size="full" label="Loading warehouse allocations…" />;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Warehouse Management</h1>
          <div className="page-subtitle">Track stock allocations across warehouse locations</div>
        </div>
      </div>
      {error && <ErrorMessage message={error.message} variant="error" />}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {warehouse.length === 0 ? (
          <div className="empty-state">
            <div style={{ fontSize: 28 }}>⬡</div>
            <div className="empty-state-title">No warehouse allocations</div>
            <div style={{ fontSize: 13, color: 'var(--color-ink-muted)' }}>Locations will be listed here.</div>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr><th>Location</th><th>Handler</th><th>Item Name</th><th>Size</th><th>Quantity</th></tr>
            </thead>
            <tbody>
              {warehouse.map((w, i) => (
                <tr key={i}>
                  <td style={{ fontWeight: 600 }}>{w.location}</td>
                  <td>{w.handler}</td>
                  <td>{w.itemName}</td>
                  <td><span className="badge badge-neutral">{w.size}</span></td>
                  <td className="tabular-nums" style={{ fontWeight: 700 }}>{w.qty}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
