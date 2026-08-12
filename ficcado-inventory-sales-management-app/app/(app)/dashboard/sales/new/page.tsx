'use client';

/**
 * app/(app)/dashboard/sales/new/page.tsx
 *
 * Dedicated Sale Creation Page (Full Section Page).
 *
 * Features:
 *  - Customer Phone Lookup & Autofill (500ms debounced via /api/customer-info)
 *  - Optional Customer Email ID field
 *  - Multi-item selection with per-item size & quantity options
 *  - Discount field with live auto-calculated Grand Total (Subtotal - Discount + Delivery Charge)
 *  - Conditional payment fields (Hides Mode & Transaction ID when Not Paid or Credit)
 *  - Stock deduction from both Handler Warehouse and Main Inventory
 */

import React, { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import LoadingGecko from '@/components/LoadingGecko';
import ErrorMessage, { parseApiError } from '@/components/ErrorMessage';
import MobileBackButton from '@/components/MobileBackButton';

interface ItemCatalogEntry {
  itemName: string;
  price: number;
  sizes: string[];
}

interface SaleItemRow {
  id: string;
  itemName: string;
  size: string;
  qty: number;
  unitPrice: number;
}

interface FoundCustomer {
  name: string;
  phone: string;
  address: string;
  email: string;
}

export default function NewSalePage() {
  const router = useRouter();

  // Mobile Step State
  const [mobileStep, setMobileStep] = useState<1 | 2 | 3>(1);

  // Catalog & Handlers
  const [catalog, setCatalog] = useState<ItemCatalogEntry[]>([]);
  const [admins, setAdmins] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ message: string } | null>(null);

  // Customer Details & Phone Lookup
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');

  // Phone Lookup Suggestions
  const [foundCustomer, setFoundCustomer] = useState<FoundCustomer | null>(null);
  const [searchingPhone, setSearchingPhone] = useState(false);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Selected Sale Items
  const [saleItems, setSaleItems] = useState<SaleItemRow[]>([]);

  // Delivery & Discount
  const [fulfilmentSource, setFulfilmentSource] = useState('Take from Inventory');
  const [deliveryStatus, setDeliveryStatus] = useState('Packed & Ready for Shipment');
  const [hasDeliveryCharge, setHasDeliveryCharge] = useState(false);
  const [deliveryCharge, setDeliveryCharge] = useState('0');
  const [discount, setDiscount] = useState('0');

  // Payment
  const [paymentStatus, setPaymentStatus] = useState('Not Paid'); // Paid, Not Paid, Credit
  const [modeOfPayment, setModeOfPayment] = useState('Cash');
  const [transactionId, setTransactionId] = useState('');

  const [submitting, setSubmitting] = useState(false);

  // ── Load Catalog & Handlers ───────────────────────────────────────────────
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
          price: parseFloat(it.price || '0') || 0,
          sizes: Array.isArray(it.sizes) ? it.sizes : ['XS', 'S', 'M', 'L', 'XL'],
        }));
        setCatalog(parsedCatalog);

        if (parsedCatalog.length > 0) {
          const first = parsedCatalog[0];
          setSaleItems([{
            id: '1',
            itemName: first.itemName,
            size: first.sizes[0] || 'M',
            qty: 1,
            unitPrice: first.price,
          }]);
        }
      }
    } catch {
      setError({ message: "Couldn't load catalog data." });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadInitialData(); }, []);

  // ── Debounced Phone Lookup ────────────────────────────────────────────────
  useEffect(() => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    setFoundCustomer(null);

    const clean = customerPhone.trim();
    if (clean.length < 5) return;

    searchTimeoutRef.current = setTimeout(async () => {
      setSearchingPhone(true);
      try {
        const res = await fetch(`/api/customer-info?phone=${encodeURIComponent(clean)}`);
        const data = await res.json();
        if (data.found && data.customer) {
          setFoundCustomer(data.customer);
        }
      } catch {
        // Silent catch for lookup
      } finally {
        setSearchingPhone(false);
      }
    }, 500);

    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, [customerPhone]);

  function applyCustomerAutofill(c: FoundCustomer) {
    if (c.name) setCustomerName(c.name);
    if (c.address) setCustomerAddress(c.address);
    if (c.email) setCustomerEmail(c.email);
    setFoundCustomer(null);
  }

  // ── Live Calculation: Subtotal - Discount + Delivery = Grand Total ──────
  const itemsSubtotal = saleItems.reduce((sum, item) => sum + (item.qty * item.unitPrice), 0);
  const discountVal = parseFloat(discount || '0') || 0;
  const chargeVal = hasDeliveryCharge ? (parseFloat(deliveryCharge || '0') || 0) : 0;
  const calculatedGrandTotal = Math.max(0, itemsSubtotal - discountVal + chargeVal);



  // ── Multi-item Management ─────────────────────────────────────────────────
  function handleAddItemRow() {
    if (catalog.length === 0) return;
    const first = catalog[0];
    setSaleItems((prev) => [
      ...prev,
      {
        id: String(Date.now()),
        itemName: first.itemName,
        size: first.sizes[0] || 'M',
        qty: 1,
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
          itemName: value,
          size: catEntry?.sizes[0] || 'M',
          unitPrice: catEntry?.price || 0,
        };
      }

      return { ...item, [field]: value };
    }));
  }

  // ── Form Submit ───────────────────────────────────────────────────────────
  async function handleSubmitSale(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!customerName.trim()) { setError({ message: 'Customer name is required.' }); return; }
    if (!customerPhone.trim()) { setError({ message: 'Customer phone number is required.' }); return; }
    if (saleItems.length === 0) { setError({ message: 'Select at least one item for the sale.' }); return; }

    for (const item of saleItems) {
      if (!item.qty || item.qty <= 0) {
        setError({ message: `Quantity for ${item.itemName} (${item.size}) must be at least 1 piece.` });
        return;
      }
    }

    setSubmitting(true);
    try {
      const payload = {
        customerName: customerName.trim(),
        customerPhoneNumber: customerPhone.trim(),
        customerAddress: customerAddress.trim() || 'N/A',
        customerEmail: customerEmail.trim(),
        discount: discountVal,
        totalNumberOfItems: saleItems.reduce((sum, i) => sum + i.qty, 0),
        itemNames: saleItems.flatMap((i) => Array(i.qty).fill(i.itemName)).join(', '),
        sizesChosen: saleItems.flatMap((i) => Array(i.qty).fill(i.size)).join(', '),
        items: saleItems.map((i) => ({ itemName: i.itemName, size: i.size, qty: i.qty, unitPrice: i.unitPrice })),
        totalAmount: calculatedGrandTotal,
        paymentStatus,
        modeOfPayment: paymentStatus === 'Paid' ? modeOfPayment : 'N/A',
        transactionId: paymentStatus === 'Paid' ? (transactionId || 'N/A') : 'N/A',
        saleStatus: paymentStatus === 'Paid' && deliveryStatus === 'Order Delivered Successfully' ? 'Purchase Satisfied & Order Completed' : 'Not Provided / Order Only Placed',
        deliveryStatus,
        deliveryChargeToggle: hasDeliveryCharge,
        deliveryChargeAmount: hasDeliveryCharge ? chargeVal : 0,
        fulfilmentStatus: 'Normal',
        fulfilmentSource,
      };

      const res = await fetch('/api/sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(parseApiError(data));
        return;
      }

      router.push('/dashboard/sales');
    } catch {
      setError({ message: "Couldn't create sale order. Please try again." });
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <LoadingGecko size="full" label="Loading sales catalog & options…" />;

  return (
    <div style={{ maxWidth: 840, margin: '0 auto', paddingBottom: 40 }}>
      <MobileBackButton />

      {/* Page Header */}
      <div className="page-header" style={{ marginBottom: 16 }}>
        <div>
          <h1 className="page-title">Create New Sale Order</h1>
          <div className="page-subtitle">Auto-generated invoice numbering, phone lookup & inventory tracking</div>
        </div>
        <Link href="/dashboard/sales" className="btn btn-ghost btn-sm desktop-only">
          ← Back to Sales List
        </Link>
      </div>

      {/* Mobile Step Control Header */}
      <div className="mobile-only" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 700, fontFamily: 'var(--font-display)', color: 'var(--color-brand-primary)' }}>
            STEP {mobileStep} OF 3: {mobileStep === 1 ? 'Items & Quantities' : mobileStep === 2 ? 'Customer & Fulfilment' : 'Review & Submit'}
          </span>
          <div className="mobile-stepper-dots">
            <div className={`mobile-stepper-dot ${mobileStep >= 1 ? 'active' : ''}`} />
            <div className={`mobile-stepper-dot ${mobileStep >= 2 ? 'active' : ''}`} />
            <div className={`mobile-stepper-dot ${mobileStep >= 3 ? 'active' : ''}`} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            type="button"
            className={`btn btn-sm ${mobileStep === 1 ? 'btn-primary' : 'btn-ghost'}`}
            style={{ flex: 1, fontSize: 12, justifyContent: 'center' }}
            onClick={() => setMobileStep(1)}
          >
            1. Items
          </button>
          <button
            type="button"
            className={`btn btn-sm ${mobileStep === 2 ? 'btn-primary' : 'btn-ghost'}`}
            style={{ flex: 1, fontSize: 12, justifyContent: 'center' }}
            onClick={() => setMobileStep(2)}
          >
            2. Customer
          </button>
          <button
            type="button"
            className={`btn btn-sm ${mobileStep === 3 ? 'btn-primary' : 'btn-ghost'}`}
            style={{ flex: 1, fontSize: 12, justifyContent: 'center' }}
            onClick={() => setMobileStep(3)}
          >
            3. Review
          </button>
        </div>
      </div>

      {error && <ErrorMessage message={error.message} variant="error" onDismiss={() => setError(null)} />}

      <form onSubmit={handleSubmitSale}>
        {/* Section 1: Customer Details & Phone Lookup */}
        <div className="card" style={{ marginBottom: 20 }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 16, marginBottom: 16, borderBottom: '1px solid var(--color-border)', paddingBottom: 8 }}>
            1. Customer Details & Lookup
          </h2>

          <div className="form-group" style={{ marginBottom: 14 }}>
            <label className="form-label">
              Phone Number * <span style={{ fontWeight: 400, color: 'var(--color-ink-muted)' }}>— enter 10 digits to look up existing customer</span>
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type="tel"
                className="form-input"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                placeholder="10 digits e.g. 9876543210"
                required
              />
              {searchingPhone && (
                <div style={{ position: 'absolute', right: 12, top: 10, fontSize: 12, color: 'var(--color-ink-muted)' }}>
                  Looking up…
                </div>
              )}
            </div>
          </div>

          {/* Customer Autofill Suggestion Card */}
          {foundCustomer && (
            <div style={{
              background: 'rgba(43,98,198,0.06)',
              border: '1px solid var(--color-brand-primary)',
              borderRadius: 8,
              padding: '12px 16px',
              marginBottom: 16,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
            }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--color-brand-primary)' }}>
                  Found Existing Customer: {foundCustomer.name}
                </div>
                <div style={{ fontSize: 12, color: 'var(--color-ink-muted)', marginTop: 2 }}>
                  {foundCustomer.email ? `Email: ${foundCustomer.email} • ` : ''}Address: {foundCustomer.address || 'N/A'}
                </div>
              </div>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => applyCustomerAutofill(foundCustomer)}
                style={{ fontWeight: 600, flexShrink: 0 }}
              >
                ✓ Autofill Details
              </button>
            </div>
          )}

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
              <label className="form-label">Email Address <span style={{ fontWeight: 400, color: 'var(--color-ink-muted)' }}>(Optional - for invoice PDF email)</span></label>
              <input
                type="email"
                className="form-input"
                value={customerEmail}
                onChange={(e) => setCustomerEmail(e.target.value)}
                placeholder="e.g. customer@gmail.com"
              />
            </div>
          </div>

          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Delivery Address *</label>
            <textarea
              className="form-textarea"
              rows={2}
              value={customerAddress}
              onChange={(e) => setCustomerAddress(e.target.value)}
              placeholder="Street, City, Pincode..."
              required
            />
          </div>
        </div>

        {/* Section 2: Selected Items */}
        <div className="card" style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, borderBottom: '1px solid var(--color-border)', paddingBottom: 8 }}>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 16, margin: 0 }}>
              2. Items & Quantities Selection
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
                  <div key={item.id} style={{ background: 'rgba(0,0,0,0.02)', borderRadius: 8, padding: 14, border: '1px solid var(--color-border)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, fontSize: 12, fontWeight: 700, color: 'var(--color-brand-primary)' }}>
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

                    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 12, alignItems: 'center' }}>
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
            3. Fulfilment & Shipping
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
                  <option key={adm} value={adm}>Handler Warehouse: {adm}</option>
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
              <label className="form-label">Delivery Charge Toggle</label>
              <div style={{ display: 'flex', gap: 16, marginTop: 6 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13 }}>
                  <input
                    type="radio"
                    name="deliveryChargeToggle"
                    checked={!hasDeliveryCharge}
                    onChange={() => setHasDeliveryCharge(false)}
                  />
                  Free Delivery (₹0)
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13 }}>
                  <input
                    type="radio"
                    name="deliveryChargeToggle"
                    checked={hasDeliveryCharge}
                    onChange={() => setHasDeliveryCharge(true)}
                  />
                  Add Delivery Charge
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

        {/* Section 4: Pricing, Discount & Live Calculated Grand Total */}
        <div className="card" style={{ marginBottom: 24 }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 16, marginBottom: 16, borderBottom: '1px solid var(--color-border)', paddingBottom: 8 }}>
            4. Pricing, Discount & Live Grand Total
          </h2>

          <div className="grid-form-2" style={{ marginBottom: 16 }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Discount Amount (₹) <span style={{ fontWeight: 400, color: 'var(--color-ink-muted)' }}>(Optional)</span></label>
              <input
                type="number"
                className="form-input"
                value={discount}
                onChange={(e) => setDiscount(e.target.value)}
                min="0"
                step="0.01"
                placeholder="e.g. 100"
              />
            </div>

            {/* Live Calculation Display Box */}
            <div style={{ background: 'var(--color-surface)', padding: 14, borderRadius: 8, border: '1px solid var(--color-border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, color: 'var(--color-ink-muted)', marginBottom: 4 }}>
                <span>Items Subtotal:</span>
                <span>₹{itemsSubtotal}</span>
              </div>
              {discountVal > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, color: '#e53935', marginBottom: 4 }}>
                  <span>Discount:</span>
                  <span>- ₹{discountVal}</span>
                </div>
              )}
              {hasDeliveryCharge && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, color: 'var(--color-ink-muted)', marginBottom: 4 }}>
                  <span>Delivery Charge:</span>
                  <span>+ ₹{chargeVal}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 16, color: 'var(--color-brand-primary)', borderTop: '1px solid var(--color-border)', paddingTop: 6, marginTop: 6 }}>
                <span>Final Grand Total:</span>
                <span>₹{calculatedGrandTotal}</span>
              </div>
            </div>
          </div>

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
          </div>

          {/* Conditional payment fields: HIDE if Not Paid or Credit */}
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

        {/* Action Buttons */}
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
