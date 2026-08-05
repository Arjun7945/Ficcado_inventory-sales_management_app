'use client';
/**
 * app/(app)/dashboard/sales/[id]/courier-slip/page.tsx
 * Printable courier/shipping slip for a sale record.
 */
import React, { useEffect, useState, use } from 'react';
import LoadingGecko from '@/components/LoadingGecko';

export default function CourierSlipPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [data, setData]       = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/invoice/${encodeURIComponent(id)}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error);
        else setData(d);
      })
      .catch(() => setError("Couldn't load sale data."))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <LoadingGecko size="full" label="Preparing courier slip…" />;
  if (error)   return <div style={{ padding: 32, color: 'red' }}>{error}</div>;
  if (!data)   return null;

  const { sale } = data;

  return (
    <div style={{
      fontFamily: "'Inter', sans-serif",
      background: '#fff',
      color: '#111',
      padding: '24px',
      maxWidth: 480,
      margin: '0 auto',
    }}>
      <style>{`@media print { .no-print { display: none !important; } }`}</style>

      {/* Print controls */}
      <div className="no-print" style={{ marginBottom: 20, display: 'flex', gap: 10 }}>
        <button onClick={() => window.print()} style={{
          padding: '8px 18px', background: '#2B62C6', color: '#fff',
          border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 14,
        }}>🖨 Print Courier Slip</button>
        <button onClick={() => window.history.back()} style={{
          padding: '8px 18px', background: '#eee', color: '#333',
          border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 14,
        }}>← Back</button>
      </div>

      {/* Courier Slip Box */}
      <div style={{ border: '2px solid #111', borderRadius: 8, overflow: 'hidden' }}>
        {/* Header */}
        <div style={{
          background: '#2B62C6', color: '#fff', padding: '10px 16px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 16, letterSpacing: '-0.02em' }}>FICCADO</div>
            <div style={{ fontSize: 9, letterSpacing: '0.1em', opacity: 0.8 }}>COURIER SLIP</div>
          </div>
          <div style={{ textAlign: 'right', fontSize: 12 }}>
            <div style={{ fontWeight: 700 }}>{sale.invoiceNumber}</div>
            <div style={{ opacity: 0.8 }}>{new Date().toLocaleDateString('en-IN')}</div>
          </div>
        </div>

        {/* SHIP TO */}
        <div style={{ padding: '16px 16px 12px' }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', color: '#666', marginBottom: 6 }}>SHIP TO</div>
          <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 4 }}>{sale.customerName}</div>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>📱 {sale.customerPhone}</div>
          <div style={{ fontSize: 13, color: '#333', lineHeight: 1.5, maxWidth: 320 }}>{sale.customerAddress}</div>
        </div>

        <hr style={{ margin: '0 16px', borderColor: '#ddd' }} />

        {/* Item details */}
        <div style={{ padding: '12px 16px' }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', color: '#666', marginBottom: 6 }}>CONTENTS</div>
          <div style={{ fontSize: 13 }}>
            <span style={{ fontWeight: 600 }}>Item(s):</span> {sale.itemNames}
          </div>
          <div style={{ fontSize: 13, marginTop: 4 }}>
            <span style={{ fontWeight: 600 }}>Size(s):</span> {sale.sizesChosen}
          </div>
          <div style={{ fontSize: 13, marginTop: 4 }}>
            <span style={{ fontWeight: 600 }}>Qty:</span> {sale.totalItems}
          </div>
        </div>

        <hr style={{ margin: '0 16px', borderColor: '#ddd' }} />

        {/* Payment */}
        <div style={{ padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 12, color: '#555' }}>
            Payment: <strong>{sale.paymentStatus}</strong> via <strong>{sale.modeOfPayment}</strong>
          </div>
          <div style={{ fontSize: 16, fontWeight: 800 }}>₹{sale.totalAmount}</div>
        </div>

        {/* Footer */}
        <div style={{ background: '#f5f5f5', padding: '8px 16px', textAlign: 'center', fontSize: 10, color: '#888' }}>
          Ficcado Inventory & Sales Management — Handle with care
        </div>
      </div>
    </div>
  );
}
