'use client';

/**
 * app/(app)/dashboard/sales/new/page.tsx
 * Dedicated Sale Creation Page (Requirement 2).
 *
 * Features:
 * 1. Multi-item selection with per-item size & quantity options.
 * 2. Live auto-calculated total amount (Subtotal + optional Delivery Charge).
 * 3. Hides Mode of Payment & Transaction ID when Payment Status is "Not Paid" or "Credit".
 * 4. Deducts stock from both Handler Warehouse and Main Inventory.
 */

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import LoadingGecko from '@/components/LoadingGecko';
import ErrorMessage, { parseApiError } from '@/components/ErrorMessage';

interface ItemCatalogEntry {
  itemName:  string;
  price:     number;
  sizes:     string[];
}

interface SaleItemRow {
  id:        string;
  itemName:  string;
  size:      string;
  qty:       number;
  unitPrice: number;
}

export default function NewSalePage() {
  const router = useRouter();

  // Data loaded from server
  const [catalog, setCatalog]         = useState<ItemCatalogEntry[]>([]);
  const [admins, setAdmins]           = useState<string[]>([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState<{ message: string } | null>(null);

  // Form Fields
  const [customerName, setCustomerName]   = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');

  // Selected Sale Items
  const [saleItems, setSaleItems]     = useState<SaleItemRow[]>([]);

  // Fulfilment & Delivery
  const [fulfilmentSource, setFulfilmentSource] = useState('Take from Inventory');
  const [deliveryStatus, setDeliveryStatus]     = useState('Packed & Ready for Shipment');
  const [hasDeliveryCharge, setHasDeliveryCharge] = useState(false);
  const [deliveryCharge, setDeliveryCharge]     = useState('0');

  // Payment
  const [paymentStatus, setPaymentStatus] = useState('Paid'); // Paid, Not Paid, Credit
  const [modeOfPayment, setModeOfPayment] = useState('Cash');
  const [transactionId, setTransactionId] = useState('');
  const [totalAmount, setTotalAmount]     = useState('0');

  const [submitting, setSubmitting]       = useState(false);

  async function loadInitialData() {
    setLoading(true);
    try {
      const [salesRes, itemsRes] = await Promise.all([
        fetch('/api/sales').then((r) => r.json()),
        fetch('/api/items').then((r) => r.json()),
      ]);

      if (salesRes.admins) setAdmins(salesRes.admins);

      if (itemsRes.items && Array.isArray(itemsRes.items)) {
        const parsedCatalog: ItemCatalogEntry[] = itemsRes.items.map((it: any) => ({
          itemName: it.itemName,
          price:    parseFloat(it.price || '0') || 0,
          sizes:    Array.isArray(it.sizes) ? it.sizes : ['XS', 'S', 'M', 'L', 'XL'],
        }));
        setCatalog(parsedCatalog);

        // Pre-add first item row if catalog is available
        if (parsedCatalog.length > 0) {
          const first = parsedCatalog[0];
          setSaleItems([{
            id:        '1',
            itemName:  first.itemName,
            size:      first.sizes[0] || 'M',
            qty:       1,
            unitPrice: first.price,
          }]);
        }
      }
    } catch {
      setError({ message: "Couldn't load sales creation catalog data." });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadInitialData(); }, []);

  // Recalculate Total Amount whenever sale items or delivery charge change
  useEffect(() => {
    const itemsSubtotal = saleItems.reduce((sum, item) => sum + (item.qty * item.unitPrice), 0);
    const chargeVal = hasDeliveryCharge ? (parseFloat(deliveryCharge || '0') || 0) : 0;
    const finalTotal = itemsSubtotal + chargeVal;
    setTotalAmount(String(finalTotal));
  }, [saleItems, hasDeliveryCharge, deliveryCharge]);

  function handleAddItemRow() {
    if (catalog.length === 0) return;
    const first = catalog[0];
    setSaleItems((prev) => [
      ...prev,
      {
        id:        String(Date.now()),
        itemName:  first.itemName,
        size:      first.sizes[0] || 'M',
        qty:       1,
        unitPrice: first.price,
      },
    ]);
  }

  function handleRemoveItemRow(id: string) {
    setSaleItems((prev) => prev.filter((i) => i.id !== id));
  }

  function handleUpdateItemRow(id: string, field: keyof SaleItemRow, value: any) {
    setSaleItems((prev) => prev.map((item) => {
      if (item.id !== id) return item;

      if (field === 'itemName') {
        const catEntry = catalog.find((c) => c.itemName === value);
        return {
          ...item,
          itemName:  value,
          size:      catEntry?.sizes[0] || 'M',
          unitPrice: catEntry?.price || 0,
        };
      }

      return { ...item, [field]: value };
    }));
  }

  async function handleSubmitSale(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!customerName.trim()) { setError({ message: 'Customer name is required.' }); return; }
    if (!customerPhone.trim()) { setError({ message: 'Customer phone number is required.' }); return; }
    if (saleItems.length === 0) { setError({ message: 'Select at least one item for the sale.' }); return; }

    // Ensure all quantities > 0
    for (const item of saleItems) {
      if (!item.qty || item.qty <= 0) {
        setError({ message: `Quantity for ${item.itemName} (${item.size}) must be at least 1 piece.` });
        return;
      }
    }

    setSubmitting(true);
    try {
      const payload = {
        customerName:         customerName.trim(),
        customerPhoneNumber:  customerPhone.trim(),
        customerAddress:      customerAddress.trim() || 'N/A',
        totalNumberOfItems:   saleItems.reduce((sum, i) => sum + i.qty, 0),
        itemNames:            Array.from(new Set(saleItems.map((i) => i.itemName))).join(', '),
        sizesChosen:          saleItems.map((i) => i.size).join(', '),
        items:                saleItems.map((i) => ({ itemName: i.itemName, size: i.size, qty: i.qty })),
        totalAmount:          parseFloat(totalAmount || '0'),
        paymentStatus,
        modeOfPayment:        paymentStatus === 'Paid' ? modeOfPayment : 'N/A',
        transactionId:        paymentStatus === 'Paid' ? (transactionId || 'N/A') : 'N/A',
        saleStatus:           paymentStatus === 'Paid' ? 'Sale Closed' : 'Payment Pending',
        deliveryStatus,
        deliveryChargeToggle: hasDeliveryCharge,
        deliveryChargeAmount: hasDeliveryCharge ? (parseFloat(deliveryCharge || '0') || 0) : 0,
        fulfilmentStatus:     'Normal',
        fulfilmentSource,
      };

      const res = await fetch('/api/sales', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(parseApiError(data));
        return;
      }

      // Success — navigate to sales list
      router.push('/dashboard/sales');
    } catch {
      setError({ message: "Couldn't create sale. Please try again." });
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <LoadingGecko size="full" label="Loading sale creation catalog…" />;

  return (
    <div style={{ maxWidth: 780, margin: '0 auto', paddingBottom: 40 }}>
      <div className="page-header">
        <div>
          <h1 className="page-title">Create New Sale Order</h1>
          <div className="page-subtitle">Auto-generated invoice numbering & multi-item handler stock deduction</div>
        </div>
        <Link href="/dashboard/sales" className="btn btn-ghost btn-sm">
          ← Back to Sales List
        </Link>
      </div>

      {error && <ErrorMessage message={error.message} variant="error" onDismiss={() => setError(null)} />}

      <form onSubmit={handleSubmitSale}>
        {/* Section 1: Customer Info */}
        <div className="card" style={{ marginBottom: 20 }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 16, marginBottom: 16, borderBottom: '1px solid var(--color-border)', paddingBottom: 8 }}>
            1. Customer Details
          </h2>
          <div className="grid-form-2">
            <div className="form-group">
              <label className="form-label">Customer Name *</label>
              <input
                type="text"
                className="form-input"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="e.g. Rohith, Sreeja M"
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Phone Number *</label>
              <input
                type="text"
                className="form-input"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                placeholder="e.g. 9876543210"
                required
              />
            </div>
          </div>

          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Delivery Address</label>
            <textarea
              className="form-textarea"
              rows={2}
              value={customerAddress}
              onChange={(e) => setCustomerAddress(e.target.value)}
              placeholder="Enter complete shipping address..."
            />
          </div>
        </div>

        {/* Section 2: Multi-Item Selection */}
        <div className="card" style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, borderBottom: '1px solid var(--color-border)', paddingBottom: 8 }}>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 16, margin: 0 }}>
              2. Selected Items & Quantities
            </h2>
            <button type="button" className="btn btn-secondary btn-sm" onClick={handleAddItemRow}>
              + Add Another Item
            </button>
          </div>

          {saleItems.length === 0 ? (
            <div style={{ padding: 16, textAlign: 'center', color: 'var(--color-ink-muted)', fontSize: 13 }}>
              No items added. Click &quot;+ Add Another Item&quot; to select clothing items.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {saleItems.map((item, index) => {
                const catEntry = catalog.find((c) => c.itemName === item.itemName);
                const availableSizes = catEntry?.sizes || ['XS', 'S', 'M', 'L', 'XL'];

                return (
                  <div key={item.id} style={{ background: 'rgba(0,0,0,0.03)', borderRadius: 8, padding: 12, border: '1px solid var(--color-border)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, fontSize: 12, fontWeight: 700, color: 'var(--color-brand-primary)' }}>
                      <span>Item #{index + 1}</span>
                      {saleItems.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveItemRow(item.id)}
                          style={{ background: 'none', border: 'none', color: '#e53935', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
                        >
                          ✕ Remove Item
                        </button>
                      )}
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 10, alignItems: 'center' }}>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label" style={{ fontSize: 11 }}>Item Name *</label>
                        <select
                          className="form-select"
                          value={item.itemName}
                          onChange={(e) => handleUpdateItemRow(item.id, 'itemName', e.target.value)}
                        >
                          {catalog.map((cat) => (
                            <option key={cat.itemName} value={cat.itemName}>
                              {cat.itemName} (₹{cat.price})
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label" style={{ fontSize: 11 }}>Size *</label>
                        <select
                          className="form-select"
                          value={item.size}
                          onChange={(e) => handleUpdateItemRow(item.id, 'size', e.target.value)}
                        >
                          {availableSizes.map((s) => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                        </select>
                      </div>

                      <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label" style={{ fontSize: 11 }}>Quantity (piece(s)) *</label>
                        <input
                          type="number"
                          className="form-input"
                          value={item.qty}
                          min="1"
                          onChange={(e) => handleUpdateItemRow(item.id, 'qty', parseInt(e.target.value || '1', 10))}
                        />
                      </div>

                      <div className="form-group" style={{ margin: 0, textAlign: 'right' }}>
                        <label className="form-label" style={{ fontSize: 11 }}>Item Subtotal</label>
                        <div style={{ fontWeight: 700, fontSize: 14, paddingTop: 6 }} className="tabular-nums">
                          ₹{item.qty * item.unitPrice}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Section 3: Fulfilment & Delivery */}
        <div className="card" style={{ marginBottom: 20 }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 16, marginBottom: 16, borderBottom: '1px solid var(--color-border)', paddingBottom: 8 }}>
            3. Fulfilment & Delivery Options
          </h2>

          <div className="grid-form-2">
            <div className="form-group">
              <label className="form-label">Fulfilment Stock Source *</label>
              <select
                className="form-select"
                value={fulfilmentSource}
                onChange={(e) => setFulfilmentSource(e.target.value)}
              >
                <option value="Take from Inventory">Take from Unassigned Main Inventory</option>
                {admins.map((adm) => (
                  <option key={adm} value={adm}>Admin Warehouse: {adm}</option>
                ))}
              </select>
              <div style={{ fontSize: 11, color: 'var(--color-ink-muted)', marginTop: 4 }}>
                {fulfilmentSource !== 'Take from Inventory'
                  ? `Deducts sold stock from BOTH main Inventory and ${fulfilmentSource}'s Warehouse.`
                  : 'Deducts sold stock only from main Inventory.'}
              </div>
            </div>

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
          </div>

          <div className="grid-form-2" style={{ margin: 0 }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Apply Delivery Charge?</label>
              <div style={{ display: 'flex', gap: 16, marginTop: 6 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13 }}>
                  <input
                    type="radio"
                    name="deliveryCharge"
                    checked={!hasDeliveryCharge}
                    onChange={() => setHasDeliveryCharge(false)}
                  />
                  No (Free Shipping)
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13 }}>
                  <input
                    type="radio"
                    name="deliveryCharge"
                    checked={hasDeliveryCharge}
                    onChange={() => setHasDeliveryCharge(true)}
                  />
                  Yes (Add Shipping Charge)
                </label>
              </div>
            </div>

            {hasDeliveryCharge && (
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Delivery Charge Amount (₹)</label>
                <input
                  type="number"
                  className="form-input"
                  value={deliveryCharge}
                  onChange={(e) => setDeliveryCharge(e.target.value)}
                  min="0"
                  step="0.01"
                />
              </div>
            )}
          </div>
        </div>

        {/* Section 4: Payment Details & Auto-Calculated Total */}
        <div className="card" style={{ marginBottom: 24 }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 16, marginBottom: 16, borderBottom: '1px solid var(--color-border)', paddingBottom: 8 }}>
            4. Payment & Auto-Calculated Total
          </h2>

          <div className="grid-form-2">
            <div className="form-group">
              <label className="form-label">Payment Status *</label>
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
              <label className="form-label">Auto-Calculated Total Amount (₹) *</label>
              <input
                type="number"
                className="form-input"
                value={totalAmount}
                onChange={(e) => setTotalAmount(e.target.value)}
                min="0"
                step="0.01"
                style={{ fontWeight: 700, fontSize: 16, color: 'var(--color-brand-primary)' }}
              />
              <div style={{ fontSize: 11, color: 'var(--color-ink-muted)', marginTop: 2 }}>
                Items Subtotal: ₹{saleItems.reduce((sum, item) => sum + (item.qty * item.unitPrice), 0)} {hasDeliveryCharge ? `+ Delivery (₹${deliveryCharge})` : ''}
              </div>
            </div>
          </div>

          {/* CONDITIONAL PAYMENT FIELDS: HIDE if Not Paid or Credit */}
          {paymentStatus === 'Paid' && (
            <div className="grid-form-2" style={{ marginTop: 12 }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Mode of Payment *</label>
                <select
                  className="form-select"
                  value={modeOfPayment}
                  onChange={(e) => setModeOfPayment(e.target.value)}
                >
                  <option value="Cash">Cash</option>
                  <option value="UPI">UPI</option>
                  <option value="Card">Card</option>
                  <option value="Bank Transfer">Bank Transfer</option>
                </select>
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Transaction ID / Reference Number</label>
                <input
                  type="text"
                  className="form-input"
                  value={transactionId}
                  onChange={(e) => setTransactionId(e.target.value)}
                  placeholder="Required for UPI / Card / Bank Transfer"
                />
              </div>
            </div>
          )}
        </div>

        {/* Submit */}
        <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
          <Link href="/dashboard/sales" className="btn btn-ghost">
            Cancel
          </Link>
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? <LoadingGecko size="inline" label="Creating sale & deducting stock…" /> : '✓ Create Sale Order'}
          </button>
        </div>
      </form>
    </div>
  );
}
