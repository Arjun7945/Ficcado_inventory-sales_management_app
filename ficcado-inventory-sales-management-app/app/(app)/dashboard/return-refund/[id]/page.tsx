'use client';

/**
 * app/(app)/dashboard/return-refund/[id]/page.tsx
 * Dedicated Return & Refund Processing Page (Part 4 Overhaul).
 *
 * Replaces old modal with a dedicated, fully-featured page supporting:
 * - Top purchased-items summary table
 * - Unchecked-by-default item & quantity selection (partial returns)
 * - 3-value Item Verification Status & conditional disposition paths
 * - Full-order refund sourcing directly from Sales Total Amount
 * - Remaining items calculation with optional New Discount Applied
 * - Save Progress button (Return/Refund sheet write only)
 * - Close Ticket button with 5 validation gates and inline "Missing Information" display
 */

import React, { useEffect, useState, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import LoadingGecko from '@/components/LoadingGecko';
import ErrorMessage, { parseApiError } from '@/components/ErrorMessage';
import MobileBackButton from '@/components/MobileBackButton';
import { calculateSaleTotalAmount } from '@/lib/salesPricing';

interface PurchasedItemLine {
  id: string;
  name: string;
  size: string;
  qty: number;
  unitPrice: number;
}

interface SelectedReturnItem {
  itemName: string;
  size: string;
  qty: number;
  unitPrice: number;
  verificationStatus: string; // 'Good — Accepted for Return' | 'Damaged — Cannot Accept Return' | 'Not Received — In Transit'
  disposition: 'Returned to Inventory' | 'Sent to Damaged Products';
  restockDestination: string; // 'Inventory Only' | handler admin name
}

interface SaleDetails {
  invoiceNumber: string;
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  customerEmail: string;
  itemNames: string;
  sizes: string;
  totalItems: string;
  itemPrices: string;
  totalAmount: string;
  discount: number;
  deliveryChargeToggle: boolean;
  deliveryChargeAmount: number;
  fulfilmentSource: string;
}

interface ReturnRecord {
  rowIndex: number;
  invoiceNumber: string;
  verificationStatus: string;
  refundStatus: string;
  refundAmount: string;
  refundCompletedAt: string;
  transactionId: string;
  modeOfRefund: string;
  disposition: string;
  restockDestination: string;
  returnedItems: string;
  returnedSizes: string;
  returnedQty: string;
  priceCharged: string;
  newFinalItems: string;
  newFinalSizes: string;
  newFinalQty: string;
  newFinalPrices: string;
  newDiscountApplied: string;
  newFinalTotalAmt: string;
  createdAt: string;
  createdBy: string;
  closedBy?: string;
  reasonForReturn?: string;
  version: string;
}

const VERIFICATION_OPTIONS = [
  'Good — Accepted for Return',
  'Damaged — Cannot Accept Return',
  'Not Received — In Transit',
];

const REFUND_MODES = ['Cash', 'UPI', 'Card', 'Bank Transfer'];

const PRESET_REASONS = [
  'Wrong Size / Fit',
  'Damaged or Defective Product',
  'Wrong Product Received',
  "Product Doesn't Match Description / Photos",
  'Not Satisfied with Quality',
  'OTHER',
];

export default function ReturnRefundDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: invoiceId } = use(params);
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<{ message: string } | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Data states
  const [record, setRecord] = useState<ReturnRecord | null>(null);
  const [saleDetails, setSaleDetails] = useState<SaleDetails | null>(null);
  const [admins, setAdmins] = useState<string[]>([]);
  const [purchasedLines, setPurchasedLines] = useState<PurchasedItemLine[]>([]);

  // Selection & Form States
  const [checkedItemIds, setCheckedItemIds] = useState<Set<string>>(new Set());
  const [returnItemStates, setReturnItemStates] = useState<Record<string, {
    qty: number;
    verificationStatus: string;
    disposition: 'Returned to Inventory' | 'Sent to Damaged Products';
    restockDestination: string;
  }>>({});

  const [refundStatus, setRefundStatus] = useState('Approved');
  const [refundMode, setRefundMode] = useState('Cash');
  const [transactionId, setTransactionId] = useState('');
  const [manualRefundAmount, setManualRefundAmount] = useState('');
  const [showAddDiscount, setShowAddDiscount] = useState(false);
  const [newDiscountApplied, setNewDiscountApplied] = useState('0');

  // Reason states (B1)
  const [selectedReasonPreset, setSelectedReasonPreset] = useState<string>('OTHER');
  const [customReasonText, setCustomReasonText] = useState<string>('');

  // Inline Validation Gate Error List
  const [missingInformation, setMissingInformation] = useState<string[]>([]);

  async function loadData() {
    setLoading(true);
    try {
      const res = await fetch(`/api/return-refund/${encodeURIComponent(invoiceId)}`);
      const data = await res.json();
      if (!res.ok) { setError(parseApiError(data)); return; }

      const rec = data.record as ReturnRecord & { reasonForReturn?: string; closedBy?: string };
      const sale = data.saleDetails as SaleDetails;
      setRecord(rec);
      setSaleDetails(sale);
      setAdmins(data.admins || []);

      if (sale) {
        // Parse original purchased item lines
        const names  = (sale.itemNames || '').split(',').map((n) => n.trim()).filter(Boolean);
        const sizes  = (sale.sizes || '').split(',').map((s) => s.trim()).filter(Boolean);
        const prices = (sale.itemPrices || '').split(',').map((p) => parseFloat(p.trim()) || 0);

        const map = new Map<string, PurchasedItemLine>();
        for (let i = 0; i < names.length; i++) {
          const sz = sizes[i] ?? sizes[0] ?? 'M';
          const pr = prices[i] ?? (prices.length === 1 ? prices[0] : 0);
          const key = `${names[i]}:${sz}:${pr}`;
          const existing = map.get(key);
          if (existing) {
            existing.qty += 1;
          } else {
            map.set(key, { id: key, name: names[i], size: sz, qty: 1, unitPrice: pr });
          }
        }
        const lines = Array.from(map.values());
        setPurchasedLines(lines);

        // Pre-populate returnItemStates defaults
        const initialStates: Record<string, any> = {};
        lines.forEach((line) => {
          initialStates[line.id] = {
            qty: 1,
            verificationStatus: 'Good — Accepted for Return',
            disposition: 'Returned to Inventory',
            restockDestination: 'Inventory Only',
          };
        });
        setReturnItemStates(initialStates);
      }

      if (rec) {
        setRefundStatus(rec.refundStatus || 'Approved');
        setRefundMode(rec.modeOfRefund || 'Cash');
        setTransactionId(rec.transactionId || '');
        setManualRefundAmount(rec.refundAmount || '');
        setNewDiscountApplied(rec.newDiscountApplied || '0');
        if (parseFloat(rec.newDiscountApplied || '0') > 0) {
          setShowAddDiscount(true);
        }

        const recReason = rec.reasonForReturn || 'OTHER';
        if (PRESET_REASONS.includes(recReason) && recReason !== 'OTHER') {
          setSelectedReasonPreset(recReason);
          setCustomReasonText('');
        } else {
          setSelectedReasonPreset('OTHER');
          setCustomReasonText(recReason === 'OTHER' ? '' : recReason);
        }
      }
    } catch {
      setError({ message: `Failed to load Return/Refund ticket for ${invoiceId}.` });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadData(); }, [invoiceId]);

  if (loading) return <LoadingGecko size="full" label={`Loading Return/Refund ticket ${invoiceId}…`} />;

  const isClosed = record?.refundStatus === 'Completed' || record?.refundStatus === 'Closed';

  // ── Calculation Logic ──────────────────────────────────────────────────────
  const grandTotalSaleAmount = parseFloat(saleDetails?.totalAmount || '0') || 0;
  const originalDiscount     = saleDetails?.discount || 0;
  const originalDeliveryCharge = saleDetails?.deliveryChargeToggle ? (saleDetails?.deliveryChargeAmount || 0) : 0;
  const originalSubtotal     = purchasedLines.reduce((sum, l) => sum + (l.qty * l.unitPrice), 0);

  // Check if ALL items in the order are selected for return with full quantities
  const totalPiecesInOrder = purchasedLines.reduce((sum, l) => sum + l.qty, 0);
  const selectedReturnItems: SelectedReturnItem[] = [];

  purchasedLines.forEach((line) => {
    if (checkedItemIds.has(line.id)) {
      const state = returnItemStates[line.id];
      const qtyToReturn = Math.min(line.qty, state?.qty || 1);
      selectedReturnItems.push({
        itemName: line.name,
        size: line.size,
        qty: qtyToReturn,
        unitPrice: line.unitPrice,
        verificationStatus: state?.verificationStatus || 'Good — Accepted for Return',
        disposition: state?.disposition || 'Returned to Inventory',
        restockDestination: state?.restockDestination || 'Inventory Only',
      });
    }
  });

  const totalReturnPieces = selectedReturnItems.reduce((sum, i) => sum + i.qty, 0);
  const isFullOrderReturn = totalPiecesInOrder > 0 && totalReturnPieces === totalPiecesInOrder;

  let computedRefundAmount = 0;
  if (isFullOrderReturn) {
    computedRefundAmount = grandTotalSaleAmount;
  } else {
    computedRefundAmount = selectedReturnItems.reduce((sum, i) => sum + (i.qty * i.unitPrice), 0);
  }

  const effectiveRefundAmount = manualRefundAmount !== ''
    ? parseFloat(manualRefundAmount) || 0
    : computedRefundAmount;

  // Remaining Items Calculation (B2.G)
  const remainingItemsBasket: { name: string; size: string; qty: number; unitPrice: number }[] = [];
  purchasedLines.forEach((line) => {
    const returnedMatch = selectedReturnItems.find((r) => r.itemName.toLowerCase() === line.name.toLowerCase() && r.size === line.size);
    const returnedQty = returnedMatch ? returnedMatch.qty : 0;
    const remainingQty = line.qty - returnedQty;
    if (remainingQty > 0) {
      remainingItemsBasket.push({
        name: line.name,
        size: line.size,
        qty: remainingQty,
        unitPrice: line.unitPrice,
      });
    }
  });

  const remainingSubtotal = remainingItemsBasket.reduce((sum, i) => sum + (i.qty * i.unitPrice), 0);
  const extraDiscountVal  = parseFloat(newDiscountApplied || '0') || 0;

  const remainingTotalCalc = calculateSaleTotalAmount({
    items: remainingSubtotal,
    discount: extraDiscountVal,
  });

  // Toggle item selection checkbox
  function toggleCheckItem(id: string) {
    if (isClosed) return;
    setCheckedItemIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Update return state per item line
  function updateItemState(id: string, field: string, value: any) {
    if (isClosed) return;
    setReturnItemStates((prev) => ({
      ...prev,
      [id]: {
        ...prev[id],
        [field]: value,
      },
    }));
  }

  // Submit Handler (Save Progress vs Close Ticket)
  async function handleSubmit(actionType: 'save_progress' | 'close_ticket') {
    if (isClosed) return;
    setError(null);
    setSuccess(null);
    setMissingInformation([]);

    setSaving(true);
    try {
      const finalReasonVal = selectedReasonPreset === 'OTHER'
        ? (customReasonText.trim() || 'OTHER')
        : selectedReasonPreset;

      const payload = {
        action: actionType,
        version: record?.version,
        selectedReturnedItems: selectedReturnItems,
        refundStatus,
        refundAmount: effectiveRefundAmount,
        modeOfRefund: refundMode,
        transactionId: refundMode === 'Cash' ? 'N/A' : transactionId.trim(),
        newDiscountApplied: extraDiscountVal,
        reasonForReturn: finalReasonVal,
      };

      const res = await fetch(`/api/return-refund/${encodeURIComponent(invoiceId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (res.status === 400 && data.missingFields) {
        setMissingInformation(data.missingFields);
        return;
      }

      if (!res.ok) {
        setError(parseApiError(data));
        return;
      }

      if (actionType === 'close_ticket') {
        setSuccess(`Return/Refund ticket ${invoiceId} closed successfully.`);
        setTimeout(() => router.push('/dashboard/return-refund'), 1200);
      } else {
        setSuccess(`Progress saved for ticket ${invoiceId}. Sheet updated.`);
        loadData();
      }
    } catch {
      setError({ message: "Couldn't submit ticket update. Check your network." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ maxWidth: 880, margin: '0 auto', paddingBottom: 40 }}>
      <MobileBackButton />

      {/* Page Header */}
      <div className="page-header" style={{ marginBottom: 20 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <Link href="/dashboard/return-refund" className="btn btn-ghost btn-sm">← Returns & Refunds</Link>
            <h1 className="page-title" style={{ fontSize: 24, color: 'var(--color-brand-primary)' }}>
              Return / Refund: {invoiceId}
            </h1>
            <span className={`badge ${record?.refundStatus === 'Completed' ? 'badge-success' : 'badge-warning'}`}>
              {record?.refundStatus || 'Pending'}
            </span>
          </div>
          <div className="page-subtitle">
            Customer: {saleDetails?.customerName || 'N/A'} ({saleDetails?.customerPhone || 'N/A'})
          </div>
        </div>

        <button className="btn btn-ghost btn-sm" onClick={loadData} disabled={saving}>
          ↻ Reload Ticket
        </button>
      </div>

      {error && <ErrorMessage message={error.message} variant="error" onDismiss={() => setError(null)} />}
      {success && <ErrorMessage message={success} variant="success" onDismiss={() => setSuccess(null)} />}

      {/* A4: Closed All-Items Ticket Read-Only Banner */}
      {isClosed && (
        <div style={{
          background: 'rgba(43, 98, 198, 0.08)',
          border: '1.5px solid var(--color-brand-primary)',
          borderRadius: 8,
          padding: '16px 20px',
          marginBottom: 24,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}>
          <span style={{ fontSize: 24 }}>🔒</span>
          <div>
            <div style={{ fontWeight: 700, color: 'var(--color-brand-primary)', fontSize: 14 }}>
              Transaction Closed & Locked
            </div>
            <div style={{ fontSize: 13, color: 'var(--color-ink)', marginTop: 2 }}>
              This sale/order transaction is closed due to the customer requesting a full return and refund, and was verified and approved by <strong>{record?.closedBy || record?.createdBy || 'Admin'}</strong>.
            </div>
          </div>
        </div>
      )}

      {/* Inline Missing Information Error Section (B2.C Validation Gate Failure) */}
      {missingInformation.length > 0 && (
        <div style={{
          background: 'rgba(176, 64, 58, 0.08)',
          border: '1.5px solid var(--color-error)',
          borderRadius: 8,
          padding: '16px 20px',
          marginBottom: 24,
        }}>
          <div style={{ fontWeight: 700, color: 'var(--color-error)', fontSize: 15, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>⚠️ Missing Information — Cannot Close Ticket</span>
          </div>
          <p style={{ fontSize: 13, color: 'var(--color-ink)', marginBottom: 8 }}>
            Please complete the following missing itemized fields before closing this return/refund ticket:
          </p>
          <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13, color: 'var(--color-error)' }}>
            {missingInformation.map((msg, idx) => (
              <li key={idx} style={{ marginBottom: 4 }}>{msg}</li>
            ))}
          </ul>
        </div>
      )}

      {/* B2.F: Purchased Items Summary Table */}
      <div className="card" style={{ marginBottom: 24 }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 16, marginBottom: 14, borderBottom: '1px solid var(--color-border)', paddingBottom: 8 }}>
          Original Purchased Items Summary
        </h2>

        <div style={{ overflowX: 'auto', marginBottom: 14 }}>
          <table className="table" style={{ width: '100%', fontSize: 13 }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>Item Name</th>
                <th style={{ textAlign: 'center' }}>Size</th>
                <th style={{ textAlign: 'center' }}>Quantity</th>
                <th style={{ textAlign: 'right' }}>Price per Item</th>
                <th style={{ textAlign: 'right' }}>Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {purchasedLines.map((line) => (
                <tr key={line.id}>
                  <td style={{ fontWeight: 600 }}>{line.name}</td>
                  <td style={{ textAlign: 'center' }}>
                    <span className="badge badge-neutral" style={{ fontSize: 11 }}>{line.size}</span>
                  </td>
                  <td style={{ textAlign: 'center', fontWeight: 600 }}>{line.qty} piece(s)</td>
                  <td style={{ textAlign: 'right' }} className="tabular-nums">₹{line.unitPrice.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                  <td style={{ textAlign: 'right', fontWeight: 700 }} className="tabular-nums">
                    ₹{(line.qty * line.unitPrice).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Order Totals Breakdown */}
        <div style={{
          borderTop: '1px solid var(--color-border)',
          paddingTop: 10,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-end',
          gap: 4,
          fontSize: 12.5,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', width: 260, color: 'var(--color-ink-muted)' }}>
            <span>Subtotal:</span>
            <span className="tabular-nums" style={{ fontWeight: 600, color: 'var(--color-ink)' }}>₹{originalSubtotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
          </div>
          {originalDiscount > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', width: 260, color: 'var(--color-error)' }}>
              <span>Original Discount Applied:</span>
              <span className="tabular-nums" style={{ fontWeight: 600 }}>−₹{originalDiscount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
            </div>
          )}
          {originalDeliveryCharge > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', width: 260, color: 'var(--color-ink-muted)' }}>
              <span>Delivery Charge:</span>
              <span className="tabular-nums" style={{ fontWeight: 600, color: 'var(--color-ink)' }}>+₹{originalDeliveryCharge.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
            </div>
          )}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            width: 260,
            borderTop: '1px solid var(--color-border)',
            paddingTop: 6,
            marginTop: 4,
            fontSize: 14.5,
            fontWeight: 700,
            color: 'var(--color-brand-primary)',
          }}>
            <span>Original Sale Total Amount:</span>
            <span className="tabular-nums">₹{grandTotalSaleAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
          </div>
        </div>
      </div>

      {/* B1: Reason for Return / Refund Request Section */}
      <div className="card" style={{ marginBottom: 24 }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 16, marginBottom: 14, borderBottom: '1px solid var(--color-border)', paddingBottom: 8 }}>
          Reason for Return / Refund Request
        </h2>

        <div style={{ display: 'grid', gap: 14 }}>
          <div>
            <label className="form-label" style={{ fontWeight: 600, fontSize: 13 }}>
              Primary Reason <span style={{ color: 'var(--color-error)' }}>*</span>
            </label>
            <select
              className="form-select"
              value={selectedReasonPreset}
              disabled={isClosed}
              onChange={(e) => {
                setSelectedReasonPreset(e.target.value);
                if (e.target.value !== 'OTHER') {
                  setCustomReasonText('');
                }
              }}
            >
              {PRESET_REASONS.map((reason) => (
                <option key={reason} value={reason}>
                  {reason}
                </option>
              ))}
            </select>
          </div>

          {selectedReasonPreset === 'OTHER' && (
            <div>
              <label className="form-label" style={{ fontWeight: 600, fontSize: 13 }}>
                Describe Reason Details <span style={{ color: 'var(--color-error)' }}>*</span>
              </label>
              <textarea
                className="form-input"
                rows={3}
                placeholder="Please describe the specific reason for this return/refund request…"
                value={customReasonText}
                disabled={isClosed}
                onChange={(e) => setCustomReasonText(e.target.value)}
              />
            </div>
          )}
        </div>
      </div>

      {/* B2.B & B2.C: Item Selection & Verification Status */}
      <div className="card" style={{ marginBottom: 24 }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 16, marginBottom: 6 }}>
          Select Item(s) to Return & Set Verification Status
        </h2>
        <div style={{ fontSize: 12.5, color: 'var(--color-ink-muted)', marginBottom: 16 }}>
          Check the box next to item(s) being returned. No checkboxes are pre-selected by default.
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {purchasedLines.map((line) => {
            const isChecked = checkedItemIds.has(line.id);
            const state = returnItemStates[line.id] || {
              qty: 1,
              verificationStatus: 'Good — Accepted for Return',
              disposition: 'Returned to Inventory',
              restockDestination: 'Inventory Only',
            };

            const isDamaged = state.verificationStatus === 'Damaged — Cannot Accept Return';

            return (
              <div
                key={line.id}
                style={{
                  border: isChecked ? '1.5px solid var(--color-brand-primary)' : '1px solid var(--color-border)',
                  borderRadius: 8,
                  padding: 14,
                  background: isChecked ? 'rgba(43,98,198,0.03)' : 'var(--color-surface)',
                  transition: 'all 0.15s ease',
                }}
              >
                {/* Item Line Selection Checkbox */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: isChecked ? 12 : 0 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontWeight: 600, fontSize: 14 }}>
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggleCheckItem(line.id)}
                      style={{ width: 18, height: 18 }}
                    />
                    <span>{line.name}</span>
                    <span className="badge badge-neutral" style={{ fontSize: 11 }}>{line.size}</span>
                  </label>

                  <div style={{ fontSize: 13, color: 'var(--color-ink-muted)' }}>
                    Purchased: {line.qty} piece(s) @ ₹{line.unitPrice} each
                  </div>
                </div>

                {/* Return Workflow Details (Visible when checked) */}
                {isChecked && (
                  <div style={{
                    borderTop: '1px solid var(--color-border)',
                    paddingTop: 12,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 12,
                  }}>
                    <div className="grid-form-2">
                      <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label">Quantity to Return (piece(s)) *</label>
                        <select
                          className="form-select"
                          value={state.qty}
                          onChange={(e) => updateItemState(line.id, 'qty', parseInt(e.target.value, 10))}
                        >
                          {Array.from({ length: line.qty }, (_, idx) => idx + 1).map((n) => (
                            <option key={n} value={n}>{n} piece(s)</option>
                          ))}
                        </select>
                      </div>

                      <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label">Item Verification Status *</label>
                        <select
                          className="form-select"
                          value={state.verificationStatus}
                          onChange={(e) => updateItemState(line.id, 'verificationStatus', e.target.value)}
                        >
                          {VERIFICATION_OPTIONS.map((opt) => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* Conditional Item Disposition Path (B2.C: Skipped if Damaged — Cannot Accept Return) */}
                    {isDamaged ? (
                      <div style={{
                        background: 'rgba(211, 47, 47, 0.08)',
                        padding: '10px 14px',
                        borderRadius: 6,
                        fontSize: 12.5,
                        color: 'var(--color-error)',
                      }}>
                        ⚠️ <strong>Return Not Accepted:</strong> Since this item is marked as Damaged, it cannot be accepted back into inventory or warehouse stock. Disposition step skipped.
                      </div>
                    ) : (
                      <div style={{
                        background: 'rgba(255,152,0,0.08)',
                        padding: 12,
                        borderRadius: 6,
                        border: '1px solid rgba(255,152,0,0.3)',
                      }}>
                        <label className="form-label" style={{ fontWeight: 700, color: '#e65100', marginBottom: 6 }}>
                          Item Disposition Path *
                        </label>
                        <div style={{ display: 'flex', gap: 20, marginBottom: 8 }}>
                          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13 }}>
                            <input
                              type="radio"
                              name={`disposition-${line.id}`}
                              checked={state.disposition === 'Returned to Inventory'}
                              onChange={() => updateItemState(line.id, 'disposition', 'Returned to Inventory')}
                            />
                            Return to Inventory / Warehouse Stock
                          </label>
                          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13 }}>
                            <input
                              type="radio"
                              name={`disposition-${line.id}`}
                              checked={state.disposition === 'Sent to Damaged Products'}
                              onChange={() => updateItemState(line.id, 'disposition', 'Sent to Damaged Products')}
                            />
                            Send to Damaged Products Log
                          </label>
                        </div>

                        {state.disposition === 'Returned to Inventory' && (
                          <div className="form-group" style={{ margin: 0 }}>
                            <label className="form-label" style={{ fontSize: 11 }}>Restock Destination *</label>
                            <select
                              className="form-select"
                              value={state.restockDestination}
                              onChange={(e) => updateItemState(line.id, 'restockDestination', e.target.value)}
                            >
                              <option value="Inventory Only">Unassigned Main Inventory</option>
                              {Array.from(new Set(admins)).map((adm) => (
                                <option key={adm} value={adm}>Handler Admin Warehouse: {adm}</option>
                              ))}
                            </select>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* B2.D & B2.E & B2.G: Refund Sourcing & Remaining Items */}
      <div className="card" style={{ marginBottom: 24 }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 16, marginBottom: 14, borderBottom: '1px solid var(--color-border)', paddingBottom: 8 }}>
          Refund Processing & Remaining Items Summary
        </h2>

        {/* Full-Order Return Sourcing Banner */}
        {isFullOrderReturn && (
          <div style={{
            background: 'rgba(43,98,198,0.08)',
            border: '1px solid var(--color-brand-primary)',
            borderRadius: 8,
            padding: '12px 16px',
            marginBottom: 16,
            fontSize: 13,
          }}>
            <div style={{ fontWeight: 700, color: 'var(--color-brand-primary)', marginBottom: 2 }}>
              ℹ Full-Order Return Sourcing Enabled
            </div>
            <div>
              Because every item in this order is selected for return, the Total Refund Amount is sourced directly from the original sale&apos;s <strong>Total Amount (₹{grandTotalSaleAmount.toLocaleString('en-IN')})</strong>, properly preserving original discounts (₹{originalDiscount}) and delivery charges (₹{originalDeliveryCharge}).
            </div>
          </div>
        )}

        <div className="grid-form-2" style={{ marginBottom: 16 }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Total Refund Amount (₹) *</label>
            <input
              type="number"
              className="form-input"
              value={effectiveRefundAmount}
              onChange={(e) => setManualRefundAmount(e.target.value)}
              min="0.01"
              step="0.01"
            />
            <div style={{ fontSize: 11, color: 'var(--color-ink-muted)', marginTop: 4 }}>
              Auto-computed based on {isFullOrderReturn ? 'Full-Order Total Amount' : 'selected returned items'}. You can adjust manually if needed.
            </div>
          </div>

          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Refund Status *</label>
            <select
              className="form-select"
              value={refundStatus}
              onChange={(e) => setRefundStatus(e.target.value)}
            >
              <option value="Approved">Approved</option>
              <option value="Completed">Completed (Unlocks Order)</option>
            </select>
          </div>
        </div>

        <div className="grid-form-2" style={{ marginBottom: 16 }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Refund Mode *</label>
            <select
              className="form-select"
              value={refundMode}
              onChange={(e) => setRefundMode(e.target.value)}
            >
              {REFUND_MODES.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>

          {refundMode !== 'Cash' && (
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Transaction ID / Reference Number *</label>
              <input
                type="text"
                className="form-input"
                value={transactionId}
                onChange={(e) => setTransactionId(e.target.value)}
                placeholder="Required for non-Cash refund mode"
                required
              />
            </div>
          )}
        </div>

        {/* Partial Return: Remaining Items Summary Box (B2.G) */}
        {!isFullOrderReturn && (
          <div style={{
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 8,
            padding: 16,
            marginTop: 16,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 14, margin: 0 }}>
                Remaining Items on Order After Return ({remainingItemsBasket.reduce((sum, i) => sum + i.qty, 0)} piece(s))
              </h3>
              {!showAddDiscount && (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setShowAddDiscount(true)}
                >
                  + Add Discount on Kept Items
                </button>
              )}
            </div>

            {remainingItemsBasket.length === 0 ? (
              <div style={{ fontSize: 13, color: 'var(--color-ink-muted)' }}>No items remaining on order.</div>
            ) : (
              <div style={{ overflowX: 'auto', marginBottom: 12 }}>
                <table className="table" style={{ width: '100%', fontSize: 12.5 }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left' }}>Item</th>
                      <th style={{ textAlign: 'center' }}>Size</th>
                      <th style={{ textAlign: 'center' }}>Remaining Qty</th>
                      <th style={{ textAlign: 'right' }}>Price Each</th>
                      <th style={{ textAlign: 'right' }}>Subtotal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {remainingItemsBasket.map((item, idx) => (
                      <tr key={idx}>
                        <td style={{ fontWeight: 600 }}>{item.name}</td>
                        <td style={{ textAlign: 'center' }}>
                          <span className="badge badge-neutral" style={{ fontSize: 10 }}>{item.size}</span>
                        </td>
                        <td style={{ textAlign: 'center', fontWeight: 600 }}>{item.qty}</td>
                        <td style={{ textAlign: 'right' }} className="tabular-nums">₹{item.unitPrice}</td>
                        <td style={{ textAlign: 'right', fontWeight: 700 }} className="tabular-nums">₹{item.qty * item.unitPrice}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Optional New Discount Input */}
            {showAddDiscount && (
              <div className="form-group" style={{ marginBottom: 12, maxWidth: 300 }}>
                <label className="form-label" style={{ fontSize: 11 }}>New Discount Applied to Remaining Items (₹)</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    type="number"
                    className="form-input"
                    value={newDiscountApplied}
                    onChange={(e) => setNewDiscountApplied(e.target.value)}
                    min="0"
                    step="0.01"
                    placeholder="e.g. 50"
                  />
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => { setShowAddDiscount(false); setNewDiscountApplied('0'); }}
                  >
                    Remove
                  </button>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 14, color: 'var(--color-brand-primary)', borderTop: '1px solid var(--color-border)', paddingTop: 8 }}>
              <span>New Final Items Total Amount:</span>
              <span className="tabular-nums">₹{remainingTotalCalc.grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
            </div>
          </div>
        )}
      </div>

      {/* Action Buttons: Save Progress vs Close Ticket */}
      <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 24 }}>
        <Link href="/dashboard/return-refund" className="btn btn-ghost">
          {isClosed ? 'Back to List' : 'Cancel'}
        </Link>
        {!isClosed && (
          <>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => handleSubmit('save_progress')}
              disabled={saving || isClosed}
            >
              {saving ? <LoadingGecko size="inline" label="Saving…" /> : '💾 Save Progress (Draft Only)'}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => handleSubmit('close_ticket')}
              disabled={saving || isClosed}
              style={{ background: 'var(--color-success)', borderColor: 'var(--color-success)' }}
            >
              {saving ? <LoadingGecko size="inline" label="Processing…" /> : '✓ Close Ticket & Finalize'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
