'use client';

/**
 * app/(app)/dashboard/sales/[id]/page.tsx
 *
 * Sales detail & update page for an individual invoice (e.g. FIC-1).
 * Supports:
 *  - Viewing full invoice details
 *  - Editing customer info, payment status, transaction ID, and sale status
 *  - Optimistic locking check (version parameter passed to PUT API)
 *  - Handling 409 Conflict with clear banner per spec & DESIGN.md rules
 *  - Deleting sales
 */

import React, { useEffect, useState, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import LoadingGecko from '@/components/LoadingGecko';
import ErrorMessage, { parseApiError } from '@/components/ErrorMessage';

interface Sale {
  rowIndex:       number;
  invoiceNumber:  string;
  saleStatus:     string;
  customerName:   string;
  customerPhone:  string;
  customerAddress:string;
  totalItems:     string;
  itemNames:      string;
  sizes:          string;
  totalAmount:    string;
  paymentStatus:  string;
  modeOfPayment:  string;
  transactionId:  string;
  createdAt:      string;
  createdBy:      string;
  updatedAt:      string;
  updatedBy:      string;
  version:        string;
}

export default function SaleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const invoiceId = resolvedParams.id;
  const router = useRouter();

  const [sale, setSale] = useState<Sale | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Editable form state
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [paymentStatus, setPaymentStatus] = useState('Paid');
  const [modeOfPayment, setModeOfPayment] = useState('UPI');
  const [transactionId, setTransactionId] = useState('');
  const [saleStatus, setSaleStatus] = useState('Purchase Satisfied');

  const [error, setError] = useState<{ message: string; hint?: string; variant?: 'error' | 'warning' | 'conflict' | 'success' } | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  async function loadSale() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/sales/${encodeURIComponent(invoiceId)}`);
      const data = await res.json();

      if (!res.ok) {
        setError(parseApiError(data));
        return;
      }

      const s: Sale = data.sale;
      setSale(s);
      setCustomerName(s.customerName);
      setCustomerPhone(s.customerPhone);
      setCustomerAddress(s.customerAddress);
      setPaymentStatus(s.paymentStatus || 'Paid');
      setModeOfPayment(s.modeOfPayment || 'UPI');
      setTransactionId(s.transactionId || '');
      setSaleStatus(s.saleStatus || 'Purchase Satisfied');
    } catch {
      setError({ message: "Couldn't load invoice details. Check your internet connection." });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadSale();
  }, [invoiceId]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!sale) return;

    setError(null);
    setSuccessMsg(null);

    if (!customerName.trim()) {
      setError({ message: 'Customer name is required.' });
      return;
    }

    if (modeOfPayment !== 'Cash' && !transactionId.trim()) {
      setError({ message: 'Transaction ID is required for UPI and Card payments.' });
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/sales/${encodeURIComponent(invoiceId)}`, {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          version:         sale.version,
          customerName,
          customerPhone,
          customerAddress,
          paymentStatus,
          modeOfPayment,
          transactionId,
          saleStatus,
        }),
      });

      const data = await res.json();

      if (res.status === 409) {
        // Optimistic locking conflict!
        setError({
          message: data.error || `This sale was updated by ${data.updatedBy ?? 'another admin'} — reload to see the changes before saving yours.`,
          hint:    'Click "Reload Latest Data" below to fetch the updated version.',
          variant: 'conflict',
        });
        return;
      }

      if (!res.ok) {
        setError(parseApiError(data));
        return;
      }

      setSuccessMsg(`Invoice ${invoiceId} updated successfully.`);
      // Update local version
      if (data.version) {
        setSale((prev) => prev ? { ...prev, version: data.version } : null);
      }
      loadSale();
    } catch {
      setError({ message: "Couldn't save changes. Check your internet connection." });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm(`Are you sure you want to delete invoice ${invoiceId}?`)) return;

    setDeleting(true);
    try {
      const res = await fetch(`/api/sales/${encodeURIComponent(invoiceId)}`, {
        method: 'DELETE',
      });
      const data = await res.json();

      if (!res.ok) {
        setError(parseApiError(data));
        setDeleting(false);
        return;
      }

      router.push('/dashboard/sales');
    } catch {
      setError({ message: "Couldn't delete invoice." });
      setDeleting(false);
    }
  }

  if (loading) return <LoadingGecko size="full" label={`Loading invoice ${invoiceId}…`} />;

  if (!sale && error) {
    return (
      <div>
        <div className="page-header">
          <Link href="/dashboard/sales" className="btn btn-ghost btn-sm">← Back to Sales</Link>
        </div>
        <ErrorMessage message={error.message} hint={error.hint} variant="error" />
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 760, margin: '0 auto' }}>
      {/* Page Header */}
      <div className="page-header">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <Link href="/dashboard/sales" className="btn btn-ghost btn-sm">← Sales</Link>
            <h1 className="page-title" style={{ fontSize: 24, color: 'var(--color-brand-primary)' }}>
              {sale?.invoiceNumber}
            </h1>
          </div>
          <div className="page-subtitle">
            Created by {sale?.createdBy} on {sale?.createdAt ? new Date(sale.createdAt).toLocaleString('en-IN') : '—'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link
            href={`/dashboard/sales/${encodeURIComponent(invoiceId)}/invoice`}
            className="btn btn-secondary btn-sm"
            target="_blank"
            rel="noopener"
          >
            🧾 Generate Invoice
          </Link>
          <Link
            href={`/dashboard/sales/${encodeURIComponent(invoiceId)}/courier-slip`}
            className="btn btn-secondary btn-sm"
            target="_blank"
            rel="noopener"
          >
            📦 Courier Slip
          </Link>
          <button className="btn btn-ghost btn-sm" onClick={loadSale} disabled={saving || deleting}>
            ↻ Reload Latest Data
          </button>
          <button className="btn btn-danger btn-sm" onClick={handleDelete} disabled={saving || deleting}>
            {deleting ? 'Deleting…' : 'Delete Invoice'}
          </button>
        </div>
      </div>


      {/* Error / Success Banners */}
      {error && (
        <ErrorMessage
          message={error.message}
          hint={error.hint}
          variant={error.variant || 'error'}
          onDismiss={() => setError(null)}
        />
      )}

      {successMsg && (
        <ErrorMessage
          message={successMsg}
          variant="success"
          onDismiss={() => setSuccessMsg(null)}
        />
      )}

      {/* Sale Summary Card */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div className="card-header">
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 16 }}>Order Items & Pricing</h2>
          <span className="badge badge-info">Version {sale?.version}</span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 11, color: 'var(--color-ink-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>
              Purchased Item(s)
            </div>
            <div style={{ fontSize: 15, fontWeight: 600, marginTop: 4 }}>{sale?.itemNames}</div>
            <div style={{ fontSize: 12.5, color: 'var(--color-ink-muted)' }}>Sizes: {sale?.sizes}</div>
          </div>

          <div>
            <div style={{ fontSize: 11, color: 'var(--color-ink-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>
              Total Amount
            </div>
            <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--color-brand-primary)', marginTop: 2 }} className="tabular-nums">
              ₹{parseFloat(sale?.totalAmount || '0').toLocaleString('en-IN')}
            </div>
            <div style={{ fontSize: 12, color: 'var(--color-ink-muted)' }}>
              {sale?.totalItems} item(s) total
            </div>
          </div>
        </div>
      </div>

      {/* Edit Form */}
      <form onSubmit={handleSave} className="card">
        <div className="card-header">
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 16 }}>Edit Customer & Payment Details</h2>
        </div>

        <div className="grid-form-2">
          <div className="form-group">
            <label className="form-label" htmlFor="edit-customer-name">Customer Name</label>
            <input
              id="edit-customer-name"
              type="text"
              className="form-input"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="edit-customer-phone">Phone Number</label>
            <input
              id="edit-customer-phone"
              type="tel"
              className="form-input"
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
            />
          </div>
        </div>

        <div className="form-group">
          <label className="form-label" htmlFor="edit-customer-address">Customer Address</label>
          <input
            id="edit-customer-address"
            type="text"
            className="form-input"
            value={customerAddress}
            onChange={(e) => setCustomerAddress(e.target.value)}
          />
        </div>

        <div className="grid-form-3">
          <div className="form-group">
            <label className="form-label" htmlFor="edit-payment-status">Payment Status</label>
            <select
              id="edit-payment-status"
              className="form-select"
              value={paymentStatus}
              onChange={(e) => setPaymentStatus(e.target.value)}
            >
              <option value="Paid">Paid</option>
              <option value="Not Paid">Not Paid</option>
              <option value="Credit">Credit</option>
            </select>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="edit-mode-payment">Payment Mode</label>
            <select
              id="edit-mode-payment"
              className="form-select"
              value={modeOfPayment}
              onChange={(e) => setModeOfPayment(e.target.value)}
            >
              <option value="UPI">UPI</option>
              <option value="Cash">Cash</option>
              <option value="Card">Card</option>
            </select>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="edit-sale-status">Sale Status</label>
            <select
              id="edit-sale-status"
              className="form-select"
              value={saleStatus}
              onChange={(e) => setSaleStatus(e.target.value)}
            >
              <option value="Purchase Satisfied">Purchase Satisfied</option>
              <option value="Return & Refund">Return & Refund</option>
              <option value="Replacement Completed & Purchase Satisfied">
                Replacement Completed & Purchase Satisfied
              </option>
            </select>
          </div>
        </div>

        {modeOfPayment !== 'Cash' && (
          <div className="form-group">
            <label className="form-label" htmlFor="edit-txn-id">Transaction ID</label>
            <input
              id="edit-txn-id"
              type="text"
              className="form-input"
              value={transactionId}
              onChange={(e) => setTransactionId(e.target.value)}
              placeholder="UPI Reference / Bank Txn ID"
            />
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 12 }}>
          <Link href="/dashboard/sales" className="btn btn-ghost">Cancel</Link>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? <LoadingGecko size="inline" label="Saving updates…" /> : 'Save Changes'}
          </button>
        </div>
      </form>
    </div>
  );
}
