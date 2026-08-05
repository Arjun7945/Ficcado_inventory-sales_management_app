'use client';

/**
 * app/(app)/dashboard/sales/NewSaleModal.tsx
 * Modal form for recording a new sale. Auto-populates available items from Items sheet.
 * Validates fields using SalesSchema, sends POST to /api/sales.
 */

import React, { useState, useEffect } from 'react';
import LoadingGecko from '@/components/LoadingGecko';
import ErrorMessage, { parseApiError } from '@/components/ErrorMessage';
import { validate, SalesSchema } from '@/lib/validation';

interface ItemRef {
  itemName: string;
  price: string;
  sizes: string;
}

interface NewSaleModalProps {
  onClose:   () => void;
  onSuccess: () => void;
}

export default function NewSaleModal({ onClose, onSuccess }: NewSaleModalProps) {
  const [items, setItems] = useState<ItemRef[]>([]);
  const [loadingItems, setLoadingItems] = useState(true);

  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [selectedItem, setSelectedItem] = useState('');
  const [selectedSize, setSelectedSize] = useState('M');
  const [totalAmount, setTotalAmount] = useState('');
  const [paymentStatus, setPaymentStatus] = useState<'Paid' | 'Not Paid' | 'Credit'>('Paid');
  const [modeOfPayment, setModeOfPayment] = useState<'Cash' | 'UPI' | 'Card'>('UPI');
  const [transactionId, setTransactionId] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [apiError, setApiError] = useState<{ message: string; hint?: string } | null>(null);

  useEffect(() => {
    fetch('/api/items')
      .then((r) => r.json())
      .then((data) => {
        if (data.items) {
          setItems(data.items);
          if (data.items.length > 0) {
            setSelectedItem(data.items[0].itemName);
            setTotalAmount(data.items[0].price);
          }
        }
      })
      .catch(() => {})
      .finally(() => setLoadingItems(false));
  }, []);

  function handleItemChange(name: string) {
    setSelectedItem(name);
    const found = items.find((i) => i.itemName === name);
    if (found && found.price) {
      setTotalAmount(found.price);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setApiError(null);

    const payload = {
      customerName,
      customerPhoneNumber: customerPhone,
      customerAddress,
      totalNumberOfItems: 1,
      itemNames: [selectedItem || 'Default Item'],
      sizesChosen: [selectedSize],
      totalAmount: parseFloat(totalAmount || '0'),
      paymentStatus,
      modeOfPayment,
      transactionId: modeOfPayment !== 'Cash' ? transactionId : undefined,
      saleStatus: 'Purchase Satisfied' as const,
    };

    const { valid, errors: valErrors } = validate(SalesSchema, payload);
    if (!valid) {
      setErrors(valErrors);
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/sales', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        setApiError(parseApiError(data));
        return;
      }

      onSuccess();
    } catch {
      setApiError({ message: "Couldn't connect to server. Try again." });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 500 }}>
        <div className="modal-header">
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 18 }}>New Sales Order</h2>
          <button className="btn-icon" onClick={onClose}>×</button>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          <div className="modal-body">
            {apiError && <ErrorMessage message={apiError.message} hint={apiError.hint} variant="error" onDismiss={() => setApiError(null)} />}

            <div className="grid-form-2">
              <div className="form-group">
                <label className="form-label">Customer Name</label>
                <input
                  type="text"
                  className={`form-input ${errors.customerName ? 'error' : ''}`}
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Full name"
                  autoFocus
                />
                {errors.customerName && <div className="form-error">{errors.customerName}</div>}
              </div>

              <div className="form-group">
                <label className="form-label">Phone Number</label>
                <input
                  type="tel"
                  className={`form-input ${errors.customerPhoneNumber ? 'error' : ''}`}
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="10 digits"
                />
                {errors.customerPhoneNumber && <div className="form-error">{errors.customerPhoneNumber}</div>}
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Delivery Address</label>
              <input
                type="text"
                className={`form-input ${errors.customerAddress ? 'error' : ''}`}
                value={customerAddress}
                onChange={(e) => setCustomerAddress(e.target.value)}
                placeholder="Street, City, Pincode"
              />
              {errors.customerAddress && <div className="form-error">{errors.customerAddress}</div>}
            </div>

            <div className="grid-form-2">
              <div className="form-group">
                <label className="form-label">Select Item</label>
                {loadingItems ? (
                  <LoadingGecko size="inline" label="Loading catalog…" />
                ) : items.length > 0 ? (
                  <select
                    className="form-select"
                    value={selectedItem}
                    onChange={(e) => handleItemChange(e.target.value)}
                  >
                    {items.map((it) => (
                      <option key={it.itemName} value={it.itemName}>{it.itemName} (₹{it.price})</option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    className="form-input"
                    value={selectedItem}
                    onChange={(e) => setSelectedItem(e.target.value)}
                    placeholder="Item name"
                  />
                )}
              </div>

              <div className="form-group">
                <label className="form-label">Size</label>
                <select
                  className="form-select"
                  value={selectedSize}
                  onChange={(e) => setSelectedSize(e.target.value)}
                >
                  {['XS', 'S', 'M', 'L', 'XL'].map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid-form-3">
              <div className="form-group">
                <label className="form-label">Total Amount (₹)</label>
                <input
                  type="number"
                  className={`form-input ${errors.totalAmount ? 'error' : ''}`}
                  value={totalAmount}
                  onChange={(e) => setTotalAmount(e.target.value)}
                />
                {errors.totalAmount && <div className="form-error">{errors.totalAmount}</div>}
              </div>

              <div className="form-group">
                <label className="form-label">Payment Status</label>
                <select
                  className="form-select"
                  value={paymentStatus}
                  onChange={(e) => setPaymentStatus(e.target.value as any)}
                >
                  <option value="Paid">Paid</option>
                  <option value="Not Paid">Not Paid</option>
                  <option value="Credit">Credit</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Mode</label>
                <select
                  className="form-select"
                  value={modeOfPayment}
                  onChange={(e) => setModeOfPayment(e.target.value as any)}
                >
                  <option value="UPI">UPI</option>
                  <option value="Cash">Cash</option>
                  <option value="Card">Card</option>
                </select>
              </div>
            </div>

            {modeOfPayment !== 'Cash' && (
              <div className="form-group">
                <label className="form-label">Transaction ID</label>
                <input
                  type="text"
                  className={`form-input ${errors.transactionId ? 'error' : ''}`}
                  value={transactionId}
                  onChange={(e) => setTransactionId(e.target.value)}
                  placeholder="UPI Ref / Bank Txn ID"
                />
                {errors.transactionId && <div className="form-error">{errors.transactionId}</div>}
              </div>
            )}
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={submitting}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? <LoadingGecko size="inline" label="Saving…" /> : 'Create Sale (FIC-)'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
