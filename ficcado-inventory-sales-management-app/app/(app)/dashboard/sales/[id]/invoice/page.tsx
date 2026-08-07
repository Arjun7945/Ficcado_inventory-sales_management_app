'use client';
/**
 * app/(app)/dashboard/sales/[id]/invoice/page.tsx
 * Printable invoice page for a sale record.
 * URL: /dashboard/sales/[invoiceNumber]/invoice
 */
import { useEffect, useState, use } from 'react';
import LoadingGecko from '@/components/LoadingGecko';

export default function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [data, setData]     = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/invoice/${encodeURIComponent(id)}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error);
        else setData(d);
      })
      .catch(() => setError("Couldn't load invoice data."))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <LoadingGecko size="full" label="Preparing invoice…" />;
  if (error)   return <div style={{ padding: 32, color: 'red' }}>{error}</div>;
  if (!data)   return null;

  const { sale } = data;
  const now = new Date();

  return (
    <div style={{
      fontFamily: "'Inter', sans-serif",
      maxWidth: 680,
      margin: '0 auto',
      padding: '32px 24px',
      background: '#fff',
      color: '#111',
      minHeight: '100vh',
    }}>
      <style>{`@media print { .no-print { display: none !important; } }`}</style>

      {/* Print controls */}
      <div className="no-print" style={{ marginBottom: 24, display: 'flex', gap: 10 }}>
        <button onClick={() => window.print()} style={{
          padding: '8px 18px', background: '#2B62C6', color: '#fff',
          border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 14,
        }}>🖨 Print Invoice</button>
        <button onClick={() => window.history.back()} style={{
          padding: '8px 18px', background: '#eee', color: '#333',
          border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 14,
        }}>← Back</button>
      </div>

      {/* Invoice Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 32 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 800, margin: 0, color: '#2B62C6', letterSpacing: '-0.03em' }}>FICCADO</h1>
          <div style={{ fontSize: 11, color: '#666', marginTop: 2, letterSpacing: '0.1em' }}>INVENTORY & SALES MANAGEMENT</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#111' }}>INVOICE</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#2B62C6', marginTop: 2 }}>{sale.invoiceNumber}</div>
          <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>Date: {now.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
        </div>
      </div>

      <hr style={{ border: 'none', borderTop: '2px solid #2B62C6', marginBottom: 24 }} />

      {/* Customer Details */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontWeight: 700, fontSize: 12, letterSpacing: '0.1em', color: '#666', marginBottom: 8 }}>BILL TO</div>
        <div style={{ fontSize: 15, fontWeight: 700 }}>{sale.customerName}</div>
        <div style={{ fontSize: 13, color: '#444', marginTop: 2 }}>{sale.customerPhone}</div>
        <div style={{ fontSize: 13, color: '#444', marginTop: 2, maxWidth: 280 }}>{sale.customerAddress}</div>
      </div>

      {/* Items Table */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 24, fontSize: 13 }}>
        <thead>
          <tr style={{ background: '#f0f4ff', borderBottom: '2px solid #2B62C6' }}>
            <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700 }}>Item(s)</th>
            <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 700 }}>Size(s)</th>
            <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 700 }}>Qty</th>
            <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700 }}>Amount</th>
          </tr>
        </thead>
        <tbody>
          <tr style={{ borderBottom: '1px solid #eee' }}>
            <td style={{ padding: '12px 12px' }}>{sale.itemNames}</td>
            <td style={{ padding: '12px 12px', textAlign: 'center' }}>{sale.sizesChosen}</td>
            <td style={{ padding: '12px 12px', textAlign: 'center' }}>{sale.totalItems}</td>
            <td style={{ padding: '12px 12px', textAlign: 'right' }}>₹{sale.totalAmount}</td>
          </tr>
        </tbody>
        <tfoot>
          <tr style={{ borderTop: '2px solid #2B62C6' }}>
            <td colSpan={3} style={{ padding: '12px', textAlign: 'right', fontWeight: 700 }}>TOTAL</td>
            <td style={{ padding: '12px', textAlign: 'right', fontWeight: 800, fontSize: 16 }}>₹{sale.totalAmount}</td>
          </tr>
        </tfoot>
      </table>

      {/* Payment Info */}
      <div style={{ background: '#f8faff', borderRadius: 8, padding: '14px 16px', marginBottom: 24, fontSize: 13 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div><span style={{ color: '#666' }}>Payment Status:</span> <strong>{sale.paymentStatus}</strong></div>
          <div><span style={{ color: '#666' }}>Mode of Payment:</span> <strong>{sale.modeOfPayment}</strong></div>
          {sale.transactionId && (
            <div style={{ gridColumn: '1/-1' }}><span style={{ color: '#666' }}>Transaction ID:</span> <strong>{sale.transactionId}</strong></div>
          )}
          <div><span style={{ color: '#666' }}>Sale Status:</span> <strong>{sale.saleStatus}</strong></div>
          <div><span style={{ color: '#666' }}>Processed By:</span> <strong>{sale.createdBy}</strong></div>
        </div>
      </div>

      {/* Footer */}
      <hr style={{ border: 'none', borderTop: '1px solid #ddd', marginBottom: 16 }} />
      <div style={{ textAlign: 'center', fontSize: 12, color: '#999' }}>
        Thank you for your purchase! — Ficcado Inventory & Sales Management
      </div>
    </div>
  );
}
