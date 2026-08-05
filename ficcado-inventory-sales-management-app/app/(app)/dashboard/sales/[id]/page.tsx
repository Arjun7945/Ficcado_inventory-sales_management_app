'use client';

/**
 * app/(app)/dashboard/sales/[id]/page.tsx
 *
 * Sales detail & update page for an individual invoice (e.g. FIC-215).
 * Part 2 features:
 *  - Replace Requested & Refund Requested action flows with plain confirmation dialogs.
 *  - Order locking (dims inputs and displays direct redirect guidance when locked).
 *  - Delivery Status and Delivery Charge fields.
 *  - Optimistic locking checks.
 */

import React, { useEffect, useState, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import LoadingGecko from '@/components/LoadingGecko';
import ErrorMessage, { parseApiError } from '@/components/ErrorMessage';

interface Sale {
  rowIndex:             number;
  invoiceNumber:        string;
  saleStatus:           string;
  customerName:         string;
  customerPhone:        string;
  customerAddress:      string;
  totalItems:           string;
  itemNames:            string;
  sizes:                string;
  totalAmount:          string;
  paymentStatus:        string;
  modeOfPayment:        string;
  transactionId:        string;
  createdAt:            string;
  createdBy:            string;
  updatedAt:            string;
  updatedBy:            string;
  version:              string;
  deliveryStatus:       string;
  deliveryChargeToggle: boolean;
  deliveryChargeAmount: number;
  fulfilmentStatus:     string; // 'Normal' | 'Replace-Requested' | 'Refund-Requested'
  fulfilmentSource:     string;
}

export default function SaleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const invoiceId = resolvedParams.id;
  const router = useRouter();

  const [sale, setSale] = useState<Sale | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Form state
  const [customerName, setCustomerName]         = useState('');
  const [customerPhone, setCustomerPhone]       = useState('');
  const [customerAddress, setCustomerAddress]   = useState('');
  const [paymentStatus, setPaymentStatus]       = useState('Paid');
  const [modeOfPayment, setModeOfPayment]       = useState('UPI');
  const [transactionId, setTransactionId]       = useState('');
  const [saleStatus, setSaleStatus]             = useState('Purchase Satisfied');
  const [deliveryStatus, setDeliveryStatus]     = useState('Packed & Ready for Shipment');
  const [deliveryChargeToggle, setDeliveryChargeToggle] = useState(false);
  const [deliveryChargeAmount, setDeliveryChargeAmount] = useState('');

  // Confirmation modal state
  const [confirmAction, setConfirmAction] = useState<'replace' | 'refund' | null>(null);
  const [requestingAction, setRequestingAction] = useState(false);

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
      setDeliveryStatus(s.deliveryStatus || 'Packed & Ready for Shipment');
      setDeliveryChargeToggle(s.deliveryChargeToggle ?? false);
      setDeliveryChargeAmount(String(s.deliveryChargeAmount ?? 0));
    } catch {
      setError({ message: "Couldn't load invoice details. Check your internet connection." });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadSale(); }, [invoiceId]);

  const isLocked = sale?.fulfilmentStatus !== 'Normal';

  async function handleRequestAction(actionType: 'replace' | 'refund') {
    setRequestingAction(true);
    setError(null);
    try {
      const res = await fetch(`/api/sales/${encodeURIComponent(invoiceId)}`, {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          requestAction: actionType === 'replace' ? 'replace_requested' : 'refund_requested',
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(parseApiError(data));
        return;
      }

      setSuccessMsg(data.message);
      setConfirmAction(null);
      loadSale();
    } catch {
      setError({ message: "Couldn't send request. Check your connection." });
    } finally {
      setRequestingAction(false);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!sale) return;
    if (isLocked) {
      setError({
        message: `This order is currently locked under ${sale.fulfilmentStatus}. You cannot edit basic sale details directly.`,
        hint: `Manage this order in the ${sale.fulfilmentStatus === 'Replace-Requested' ? 'Replacement Management' : 'Return / Refund Management'} section.`,
        variant: 'warning',
      });
      return;
    }

    setError(null);
    setSuccessMsg(null);

    if (!customerName.trim()) { setError({ message: 'Customer name is required.' }); return; }
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
          version:              sale.version,
          customerName,
          customerPhone,
          customerAddress,
          paymentStatus,
          modeOfPayment,
          transactionId,
          saleStatus,
          deliveryStatus,
          deliveryChargeToggle,
          deliveryChargeAmount: deliveryChargeToggle ? parseFloat(deliveryChargeAmount || '0') : 0,
        }),
      });

      const data = await res.json();

      if (res.status === 409) {
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
      const res = await fetch(`/api/sales/${encodeURIComponent(invoiceId)}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) { setError(parseApiError(data)); setDeleting(false); return; }
      router.push('/dashboard/sales');
    } catch {
      setError({ message: "Couldn't delete invoice." });
      setDeleting(false);
    }
  }

  if (loading) return <LoadingGecko size="full" label={`Loading invoice ${invoiceId}…`} />;

  return (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>
      {/* Page Header */}
      <div className="page-header">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <Link href="/dashboard/sales" className="btn btn-ghost btn-sm">← Sales</Link>
            <h1 className="page-title" style={{ fontSize: 24, color: 'var(--color-brand-primary)' }}>
              {sale?.invoiceNumber}
            </h1>
            {isLocked && (
              <span className="badge badge-warning" style={{ fontSize: 12 }}>
                🔒 Locked ({sale?.fulfilmentStatus})
              </span>
            )}
          </div>
          <div className="page-subtitle">
            Created by {sale?.createdBy} on {sale?.createdAt ? new Date(sale.createdAt).toLocaleString('en-IN') : '—'}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-ghost btn-sm" onClick={loadSale} disabled={saving || deleting}>
            ↻ Reload
          </button>
          <button className="btn btn-danger btn-sm" onClick={handleDelete} disabled={saving || deleting || isLocked}>
            Delete
          </button>
        </div>
      </div>

      {/* Locked Banner Notification */}
      {isLocked && (
        <div style={{
          background: 'rgba(255, 152, 0, 0.12)',
          border: '1px solid #f57c00',
          borderRadius: 8,
          padding: '14px 18px',
          marginBottom: 20,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <div>
            <div style={{ fontWeight: 700, color: '#e65100', fontSize: 14 }}>
              Order Locked — {sale?.fulfilmentStatus}
            </div>
            <div style={{ fontSize: 13, color: 'var(--color-ink)', marginTop: 2 }}>
              This sale has been moved to {sale?.fulfilmentStatus === 'Replace-Requested' ? 'Replacement Management' : 'Return / Refund Management'}. Standard editing is locked until processing completes.
            </div>
          </div>
          <Link
            href={sale?.fulfilmentStatus === 'Replace-Requested' ? '/dashboard/replacement' : '/dashboard/return-refund'}
            className="btn btn-primary btn-sm"
          >
            Go to {sale?.fulfilmentStatus === 'Replace-Requested' ? 'Replacement' : 'Return / Refund'} →
          </Link>
        </div>
      )}

      {error && <ErrorMessage message={error.message} hint={error.hint} variant={error.variant || 'error'} onDismiss={() => setError(null)} />}
      {successMsg && <ErrorMessage message={successMsg} variant="success" onDismiss={() => setSuccessMsg(null)} />}

      {/* Order Summary & Request Actions */}
      <div className="card" style={{ marginBottom: 24, opacity: isLocked ? 0.85 : 1 }}>
        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 16 }}>Order Overview & Sourcing</h2>
          <div style={{ display: 'flex', gap: 8 }}>
            {!isLocked && (
              <>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setConfirmAction('replace')}>
                  🔄 Replace Requested
                </button>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setConfirmAction('refund')}>
                  ↩ Refund Requested
                </button>
              </>
            )}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
          <div>
            <div style={{ fontSize: 11, color: 'var(--color-ink-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
              Purchased Item(s)
            </div>
            <div style={{ fontSize: 15, fontWeight: 600, marginTop: 4 }}>{sale?.itemNames}</div>
            <div style={{ fontSize: 12.5, color: 'var(--color-ink-muted)' }}>Sizes: {sale?.sizes}</div>
          </div>

          <div>
            <div style={{ fontSize: 11, color: 'var(--color-ink-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
              Fulfilment Source
            </div>
            <div style={{ fontSize: 14, fontWeight: 600, marginTop: 4 }}>
              <span className="badge badge-info">{sale?.fulfilmentSource}</span>
            </div>
          </div>

          <div>
            <div style={{ fontSize: 11, color: 'var(--color-ink-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
              Delivery Status
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, marginTop: 4 }}>
              <span className="badge badge-success">{sale?.deliveryStatus}</span>
            </div>
          </div>

          <div>
            <div style={{ fontSize: 11, color: 'var(--color-ink-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
              Total Amount
            </div>
            <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--color-brand-primary)', marginTop: 2 }} className="tabular-nums">
              ₹{parseFloat(sale?.totalAmount || '0').toLocaleString('en-IN')}
            </div>
            {sale?.deliveryChargeToggle && (
              <div style={{ fontSize: 11, color: 'var(--color-ink-muted)' }}>
                Includes ₹{sale.deliveryChargeAmount} delivery charge
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Edit Form */}
      <form onSubmit={handleSave} className="card" style={{ opacity: isLocked ? 0.7 : 1 }}>
        <div className="card-header">
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 16 }}>
            Edit Customer & Delivery Details {isLocked && '(Read Only)'}
          </h2>
        </div>

        <fieldset disabled={isLocked} style={{ border: 'none', padding: 0, margin: 0 }}>
          <div className="grid-form-2">
            <div className="form-group">
              <label className="form-label">Customer Name</label>
              <input
                type="text"
                className="form-input"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Phone Number</label>
              <input
                type="tel"
                className="form-input"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Customer Address</label>
            <input
              type="text"
              className="form-input"
              value={customerAddress}
              onChange={(e) => setCustomerAddress(e.target.value)}
            />
          </div>

          <div className="grid-form-2">
            <div className="form-group">
              <label className="form-label">Delivery Status</label>
              <select
                className="form-select"
                value={deliveryStatus}
                onChange={(e) => setDeliveryStatus(e.target.value)}
              >
                <option value="Packed & Ready for Shipment">Packed & Ready for Shipment</option>
                <option value="In Transit">In Transit</option>
                <option value="Order Delivered Successfully">Order Delivered Successfully</option>
                <option value="Order Missing">Order Missing</option>
                <option value="Order Failed to Deliver & Returning Back">Order Failed to Deliver & Returning Back</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Delivery Charge</label>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 6 }}>
                <input
                  type="checkbox"
                  checked={deliveryChargeToggle}
                  onChange={(e) => setDeliveryChargeToggle(e.target.checked)}
                />
                <span style={{ fontSize: 13 }}>{deliveryChargeToggle ? 'Charge Applicable' : 'Free Delivery'}</span>
                {deliveryChargeToggle && (
                  <input
                    type="number"
                    className="form-input"
                    value={deliveryChargeAmount}
                    onChange={(e) => setDeliveryChargeAmount(e.target.value)}
                    style={{ width: 120, padding: '4px 8px' }}
                    placeholder="₹ Amount"
                  />
                )}
              </div>
            </div>
          </div>

          <div className="grid-form-3">
            <div className="form-group">
              <label className="form-label">Payment Status</label>
              <select
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
              <label className="form-label">Payment Mode</label>
              <select
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
              <label className="form-label">Sale Status</label>
              <select
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
              <label className="form-label">Transaction ID</label>
              <input
                type="text"
                className="form-input"
                value={transactionId}
                onChange={(e) => setTransactionId(e.target.value)}
                placeholder="UPI Reference / Bank Txn ID"
              />
            </div>
          )}

          {!isLocked && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
              <Link href="/dashboard/sales" className="btn btn-ghost">Cancel</Link>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? <LoadingGecko size="inline" label="Saving updates…" /> : 'Save Changes'}
              </button>
            </div>
          )}
        </fieldset>
      </form>

      {/* Confirmation Modal for Replace / Refund Requests */}
      {confirmAction && (
        <div className="modal-backdrop" onClick={() => setConfirmAction(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 460 }}>
            <div className="modal-header">
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 17 }}>
                {confirmAction === 'replace' ? 'Request Item Replacement' : 'Request Return / Refund'}
              </h2>
              <button className="btn-icon" onClick={() => setConfirmAction(null)}>×</button>
            </div>
            <div className="modal-body" style={{ fontSize: 14, color: 'var(--color-ink)', lineHeight: 1.5 }}>
              {confirmAction === 'replace' ? (
                <>This sale will be moved to the Replacement section. You&apos;ll make further updates there. Continue?</>
              ) : (
                <>This sale will be moved to the Return / Refund section. You&apos;ll make further updates there. Continue?</>
              )}
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-ghost" onClick={() => setConfirmAction(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={requestingAction}
                onClick={() => handleRequestAction(confirmAction)}
              >
                {requestingAction ? <LoadingGecko size="inline" label="Moving order…" /> : 'Confirm & Move Order'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
