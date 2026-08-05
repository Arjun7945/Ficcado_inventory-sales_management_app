'use client';

/**
 * app/(app)/dashboard/sales/NewSaleModal.tsx
 * Modal form for recording a new sale.
 * Sourced live from Inventory stock, handler-aware fulfilment source selection,
 * and Delivery fields (Status & Delivery Charge toggle).
 */

import React, { useState, useEffect } from 'react';
import LoadingGecko from '@/components/LoadingGecko';
import ErrorMessage, { parseApiError } from '@/components/ErrorMessage';
import { validate, SalesSchema } from '@/lib/validation';

interface InventoryStockItem {
  itemName: string;
  size: string;
  qty: number;
}

interface NewSaleModalProps {
  onClose:   () => void;
  onSuccess: () => void;
}

export default function NewSaleModal({ onClose, onSuccess }: NewSaleModalProps) {
  const [inventoryStock, setInventoryStock] = useState<InventoryStockItem[]>([]);
  const [admins, setAdmins]                 = useState<string[]>([]);
  const [loadingData, setLoadingData]       = useState(true);

  const [customerName, setCustomerName]         = useState('');
  const [customerPhone, setCustomerPhone]       = useState('');
  const [customerAddress, setCustomerAddress]   = useState('');
  const [selectedStockKey, setSelectedStockKey] = useState(''); // `${itemName}:${size}`
  const [totalAmount, setTotalAmount]           = useState('');
  const [paymentStatus, setPaymentStatus]       = useState<'Paid' | 'Not Paid' | 'Credit'>('Paid');
  const [modeOfPayment, setModeOfPayment]       = useState<'Cash' | 'UPI' | 'Card'>('UPI');
  const [transactionId, setTransactionId]       = useState('');

  // Part 2 fields
  const [fulfilmentSource, setFulfilmentSource] = useState('Take from Inventory');
  const [deliveryStatus, setDeliveryStatus]     = useState('Packed & Ready for Shipment');
  const [deliveryChargeToggle, setDeliveryChargeToggle] = useState(false);
  const [deliveryChargeAmount, setDeliveryChargeAmount] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors]         = useState<Record<string, string>>({});
  const [apiError, setApiError]     = useState<{ message: string; hint?: string } | null>(null);

  useEffect(() => {
    fetch('/api/sales')
      .then((r) => r.json())
      .then((data) => {
        if (data.inventoryStock) setInventoryStock(data.inventoryStock);
        if (data.admins)         setAdmins(data.admins);
        if (data.inventoryStock && data.inventoryStock.length > 0) {
          const first = data.inventoryStock[0];
          setSelectedStockKey(`${first.itemName}:${first.size}`);
        }
      })
      .catch(() => {})
      .finally(() => setLoadingData(false));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setApiError(null);

    const [itemName, sizeChosen] = selectedStockKey.split(':');

    const chargeAmt = deliveryChargeToggle ? parseFloat(deliveryChargeAmount || '0') : 0;

    const payload = {
      customerName,
      customerPhoneNumber:  customerPhone,
      customerAddress,
      totalNumberOfItems:   1,
      itemNames:            [itemName || 'Default Item'],
      sizesChosen:          [sizeChosen || 'M'],
      totalAmount:          parseFloat(totalAmount || '0'),
      paymentStatus,
      modeOfPayment,
      transactionId:        modeOfPayment !== 'Cash' ? transactionId : undefined,
      saleStatus:           'Purchase Satisfied' as const,
      deliveryStatus:       deliveryStatus as any,
      deliveryChargeToggle,
      deliveryChargeAmount: chargeAmt,
      fulfilmentStatus:     'Normal' as const,
      fulfilmentSource:     fulfilmentSource || 'Take from Inventory',
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
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 540 }}>
        <div className="modal-header">
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 18 }}>New Sales Order</h2>
          <button className="btn-icon" onClick={onClose}>×</button>
        </div>

        <form onSubmit={handleSubmit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="modal-body" style={{ maxHeight: '75vh', overflowY: 'auto' }}>
            {apiError && <ErrorMessage message={apiError.message} hint={apiError.hint} variant="error" onDismiss={() => setApiError(null)} />}

            <div className="grid-form-2">
              <div className="form-group">
                <label className="form-label">Customer Name *</label>
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
                <label className="form-label">Phone Number *</label>
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
              <label className="form-label">Delivery Address *</label>
              <input
                type="text"
                className={`form-input ${errors.customerAddress ? 'error' : ''}`}
                value={customerAddress}
                onChange={(e) => setCustomerAddress(e.target.value)}
                placeholder="Street, City, Pincode"
              />
              {errors.customerAddress && <div className="form-error">{errors.customerAddress}</div>}
            </div>

            {/* Sourced live from Inventory Stock */}
            <div className="grid-form-2">
              <div className="form-group">
                <label className="form-label">Select Item & Size (from Live Inventory) *</label>
                {loadingData ? (
                  <LoadingGecko size="inline" label="Loading stock…" />
                ) : inventoryStock.length > 0 ? (
                  <select
                    className="form-select"
                    value={selectedStockKey}
                    onChange={(e) => setSelectedStockKey(e.target.value)}
                  >
                    {inventoryStock.map((st) => (
                      <option key={`${st.itemName}:${st.size}`} value={`${st.itemName}:${st.size}`}>
                        {st.itemName} — Size {st.size} ({st.qty} piece(s) available)
                      </option>
                    ))}
                  </select>
                ) : (
                  <div style={{ fontSize: 12, color: 'var(--color-ink-muted)' }}>No live inventory stock available. Add inventory first.</div>
                )}
              </div>

              <div className="form-group">
                <label className="form-label">Fulfilment Source *</label>
                <select
                  className="form-select"
                  value={fulfilmentSource}
                  onChange={(e) => setFulfilmentSource(e.target.value)}
                >
                  <option value="Take from Inventory">Take from Inventory (Unassigned Main Stock)</option>
                  {admins.map((adm) => (
                    <option key={adm} value={adm}>Handler: {adm}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Delivery Charge & Delivery Status */}
            <div className="grid-form-2" style={{ background: 'rgba(43,98,198,0.04)', padding: 10, borderRadius: 8 }}>
              <div className="form-group" style={{ margin: 0 }}>
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

              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input
                    type="checkbox"
                    checked={deliveryChargeToggle}
                    onChange={(e) => setDeliveryChargeToggle(e.target.checked)}
                  />
                  Delivery Charge ({deliveryChargeToggle ? 'Charge Applicable' : 'Free Delivery'})
                </label>
                {deliveryChargeToggle && (
                  <input
                    type="number"
                    className={`form-input ${errors.deliveryChargeAmount ? 'error' : ''}`}
                    value={deliveryChargeAmount}
                    onChange={(e) => setDeliveryChargeAmount(e.target.value)}
                    placeholder="Enter amount (₹)"
                    style={{ marginTop: 4 }}
                  />
                )}
                {errors.deliveryChargeAmount && <div className="form-error">{errors.deliveryChargeAmount}</div>}
              </div>
            </div>

            <div className="grid-form-3">
              <div className="form-group">
                <label className="form-label">Total Amount (₹) *</label>
                <input
                  type="number"
                  className={`form-input ${errors.totalAmount ? 'error' : ''}`}
                  value={totalAmount}
                  onChange={(e) => setTotalAmount(e.target.value)}
                  placeholder="e.g. 1500"
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
                <label className="form-label">Transaction ID *</label>
                <input
                  type="text"
                  className={`form-input ${errors.transactionId ? 'error' : ''}`}
                  value={transactionId}
                  onChange={(e) => setTransactionId(e.target.value)}
                  placeholder="e.g. UPI-987654321"
                />
                {errors.transactionId && <div className="form-error">{errors.transactionId}</div>}
              </div>
            )}
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? <LoadingGecko size="inline" label="Creating Sale…" /> : 'Create Sale'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
