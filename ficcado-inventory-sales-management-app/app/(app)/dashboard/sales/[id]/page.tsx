'use client';

/**
 * app/(app)/dashboard/sales/[id]/page.tsx
 * Single Sale Order Details & Actions View.
 *
 * Updated with:
 * - A1: Rename "Refund Requested" -> "Return/Refund Requested"
 * - A3: Consolidated Total Amount live recalculation on edit (delivery charge, discount change)
 * - Part 6 B2: Add Items to Existing Sale
 */

import React, { useEffect, useState, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import LoadingGecko from '@/components/LoadingGecko';
import ErrorMessage, { parseApiError } from '@/components/ErrorMessage';
import MobileBackButton from '@/components/MobileBackButton';
import { calculateSaleTotalAmount } from '@/lib/salesPricing';

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
  fulfilmentStatus:     string;
  fulfilmentSource:     string;
  saleClosedBy?:        string;
  discount?:            number;
  itemPrices?:          string;
}

export default function SaleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: invoiceId } = use(params);
  const router = useRouter();

  const [sale, setSale]                   = useState<Sale | null>(null);
  const [loading, setLoading]             = useState(true);
  const [saving, setSaving]               = useState(false);
  const [deleting, setDeleting]           = useState(false);

  const [error, setError]                 = useState<{ message: string; hint?: string; variant?: 'error' | 'warning' | 'conflict' } | null>(null);
  const [successMsg, setSuccessMsg]       = useState<string | null>(null);

  // Form Edit State
  const [customerName, setCustomerName]   = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [paymentStatus, setPaymentStatus] = useState('Paid');
  const [modeOfPayment, setModeOfPayment] = useState('Cash');
  const [transactionId, setTransactionId] = useState('');
  const [saleStatus, setSaleStatus]       = useState('Not Provided / Order Only Placed');
  const [deliveryStatus, setDeliveryStatus] = useState('Packed & Ready for Shipment');
  const [deliveryChargeToggle, setDeliveryChargeToggle] = useState(false);
  const [deliveryChargeAmount, setDeliveryChargeAmount] = useState('0');

  // Confirmation Modals
  const [confirmAction, setConfirmAction] = useState<'replace' | 'refund' | null>(null);

  // Sale Completion Modal State
  const [showCompleteModal, setShowCompleteModal] = useState(false);
  const [completionPaymentChoice, setCompletionPaymentChoice] = useState<'paid_now' | 'not_paid'>('paid_now');
  const [completionModeOfPayment, setCompletionModeOfPayment] = useState('Cash');
  const [completionTransactionId, setCompletionTransactionId] = useState('');
  const [completionError, setCompletionError] = useState<string | null>(null);

  // Part 6 B2: Add Items to Existing Sale
  const [showAddItems, setShowAddItems]                 = useState(false);
  const [addItemsInventory, setAddItemsInventory]       = useState<{ itemName: string; size: string; qty: number }[]>([]);
  const [addItemsAdmins, setAddItemsAdmins]             = useState<string[]>([]);
  const [addItemsPriceMap, setAddItemsPriceMap]         = useState<Record<string, number>>({});
  const [pendingAddItems, setPendingAddItems]           = useState<{ itemName: string; size: string; qty: number; unitPrice: number; fulfilmentSource: string }[]>([]);
  const [addItemsFulfilmentSource, setAddItemsFulfilmentSource] = useState('Main Inventory');
  const [addItemsSubmitting, setAddItemsSubmitting]     = useState(false);
  const [addItemsError, setAddItemsError]               = useState<string | null>(null);

  async function loadSale() {
    setLoading(true);
    try {
      const res = await fetch(`/api/sales/${encodeURIComponent(invoiceId)}`);
      const data = await res.json();
      if (!res.ok) {
        setError(parseApiError(data));
        setSale(null);
        return;
      }

      const s = data.sale as Sale;
      setSale(s);
      setCustomerName(s.customerName);
      setCustomerPhone(s.customerPhone);
      setCustomerAddress(s.customerAddress);
      setPaymentStatus(s.paymentStatus);
      setModeOfPayment(s.modeOfPayment || 'Cash');
      setTransactionId(s.transactionId === 'N/A' ? '' : (s.transactionId || ''));
      setSaleStatus(s.saleStatus || 'Not Provided / Order Only Placed');
      setDeliveryStatus(s.deliveryStatus || 'Packed & Ready for Shipment');
      setDeliveryChargeToggle(s.deliveryChargeToggle);
      setDeliveryChargeAmount(String(s.deliveryChargeAmount || 0));
    } catch {
      setError({ message: `Couldn't load details for invoice ${invoiceId}.` });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadSale(); }, [invoiceId]);

  // Part 6 B2: Load inventory, items catalog (for prices), and admin list when the Add Items panel is opened
  async function handleOpenAddItems() {
    setShowAddItems(true);
    setAddItemsError(null);
    setPendingAddItems([]);
    setAddItemsFulfilmentSource('Main Inventory');

    if (addItemsInventory.length === 0) {
      try {
        const [invRes, salesRes, itemsRes] = await Promise.all([
          fetch('/api/inventory').then((r) => r.json()),
          fetch('/api/sales').then((r) => r.json()),
          fetch('/api/items').then((r) => r.json()),
        ]);
        if (invRes.inventory) setAddItemsInventory(invRes.inventory);
        if (salesRes.admins)  setAddItemsAdmins(salesRes.admins);
        if (itemsRes.items) {
          // Build a lowercase-name → catalog price map for fast lookup
          const priceMap: Record<string, number> = {};
          for (const it of itemsRes.items) {
            const name  = (it.itemName || '').toLowerCase().trim();
            const price = parseFloat(it.price) || 0;
            if (name) priceMap[name] = price;
          }
          setAddItemsPriceMap(priceMap);
        }
      } catch {
        setAddItemsError("Couldn't load inventory. Please try again.");
      }
    }
  }

  function handleAddItemToList(value: string) {
    if (!value) return;
    const [itemName, size] = value.split(':');
    const alreadyAdded = pendingAddItems.find((i) => i.itemName === itemName && i.size === size);
    if (alreadyAdded) return;
    // Pre-populate catalog price so the admin doesn't have to type it manually
    const catalogPrice = addItemsPriceMap[itemName.toLowerCase().trim()] ?? 0;
    setPendingAddItems((prev) => [
      ...prev,
      { itemName, size, qty: 1, unitPrice: catalogPrice, fulfilmentSource: addItemsFulfilmentSource },
    ]);
  }

  function updatePendingItemField(index: number, field: 'qty' | 'unitPrice', value: number) {
    setPendingAddItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, [field]: value } : item))
    );
  }

  function removePendingItem(index: number) {
    setPendingAddItems((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmitAddItems() {
    setAddItemsError(null);
    if (pendingAddItems.length === 0) {
      setAddItemsError('Select at least one item to add.');
      return;
    }

    const withSource = pendingAddItems.map((i) => ({ ...i, fulfilmentSource: addItemsFulfilmentSource }));

    setAddItemsSubmitting(true);
    try {
      const res  = await fetch(`/api/sales/${encodeURIComponent(invoiceId)}/add-items`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ items: withSource }),
      });
      const data = await res.json();

      if (!res.ok) {
        setAddItemsError(data.error || 'Failed to add items.');
        return;
      }

      setShowAddItems(false);
      setPendingAddItems([]);
      setSuccessMsg(data.message || 'Items added to sale successfully.');
      loadSale();
    } catch {
      setAddItemsError("Couldn't connect to server. Please try again.");
    } finally {
      setAddItemsSubmitting(false);
    }
  }

  const isLocked = sale ? sale.fulfilmentStatus !== 'Normal' : false;

  // Calculate live items subtotal from sale itemPrices or totalAmount
  const itemsPricesArr = (sale?.itemPrices || '').split(',').map((p) => parseFloat(p.trim()) || 0);
  const rawItemsSubtotal = itemsPricesArr.reduce((sum, p) => sum + p, 0);

  const discountVal = sale?.discount || 0;
  const currentTotalAmount = parseFloat(sale?.totalAmount || '0') || 0;
  const currentDelivCharge = sale?.deliveryChargeToggle ? (sale.deliveryChargeAmount || 0) : 0;
  const computedSubtotal = rawItemsSubtotal > 0 ? rawItemsSubtotal : (currentTotalAmount - currentDelivCharge + discountVal);

  // Live recalculated grand total using consolidated pricing module
  const livePricing = calculateSaleTotalAmount({
    items: computedSubtotal,
    discount: discountVal,
    deliveryChargeToggle,
    deliveryChargeAmount: parseFloat(deliveryChargeAmount || '0') || 0,
  });

  async function handleSaveChanges(e: React.FormEvent) {
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
    if (paymentStatus === 'Paid' && modeOfPayment !== 'Cash' && modeOfPayment !== 'N/A' && !transactionId.trim()) {
      setError({ message: 'Transaction ID is required for UPI, Card, and Bank Transfer payments.' });
      return;
    }

    let targetSaleStatus = saleStatus;
    if (paymentStatus === 'Paid' && deliveryStatus === 'Order Delivered Successfully' && (saleStatus === 'Payment Pending' || saleStatus === 'Not Provided / Order Only Placed')) {
      targetSaleStatus = 'Purchase Satisfied & Order Completed';
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
          modeOfPayment:        paymentStatus === 'Paid' ? modeOfPayment : 'N/A',
          transactionId:        paymentStatus === 'Paid' ? (transactionId || 'N/A') : 'N/A',
          saleStatus:           targetSaleStatus,
          deliveryStatus,
          deliveryChargeToggle,
          deliveryChargeAmount: deliveryChargeToggle ? parseFloat(deliveryChargeAmount || '0') : 0,
          totalAmount:          livePricing.grandTotal,
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
      loadSale();
    } catch {
      setError({ message: "Couldn't save changes. Check your internet connection." });
    } finally {
      setSaving(false);
    }
  }

  function handleOpenSaleCompletedModal() {
    if (!sale) return;
    setCompletionError(null);

    if (paymentStatus === 'Paid') {
      executeSaleCompletion({
        payStatus: 'Paid',
        payMode:   modeOfPayment,
        txId:      transactionId,
      });
    } else {
      setCompletionPaymentChoice('paid_now');
      setCompletionModeOfPayment('Cash');
      setCompletionTransactionId('');
      setShowCompleteModal(true);
    }
  }

  async function executeSaleCompletion(params: { payStatus: string; payMode: string; txId: string }) {
    if (!sale) return;
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
          paymentStatus:        params.payStatus,
          modeOfPayment:        params.payStatus === 'Paid' ? params.payMode : 'N/A',
          transactionId:        params.payStatus === 'Paid' ? (params.txId || 'N/A') : 'N/A',
          saleStatus:           'Purchase Satisfied & Order Completed',
          deliveryStatus:       'Order Delivered Successfully',
          deliveryChargeToggle,
          deliveryChargeAmount: deliveryChargeToggle ? parseFloat(deliveryChargeAmount || '0') : 0,
          totalAmount:          livePricing.grandTotal,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(parseApiError(data));
        return;
      }

      setShowCompleteModal(false);
      setSuccessMsg(`Sale ${invoiceId} marked as Order Delivered Successfully & Purchase Satisfied.`);
      loadSale();
    } catch {
      setError({ message: "Couldn't mark sale as completed." });
    } finally {
      setSaving(false);
    }
  }

  function handleConfirmCompletionForm(e: React.FormEvent) {
    e.preventDefault();
    setCompletionError(null);

    if (completionPaymentChoice === 'not_paid') {
      setCompletionError('Orders can only be marked as Sale Completed after payment is received. Please mark the sale as Paid first.');
      return;
    }

    if (completionModeOfPayment !== 'Cash' && !completionTransactionId.trim()) {
      setCompletionError('Transaction ID is required for UPI, Card, and Bank Transfer payments.');
      return;
    }

    executeSaleCompletion({
      payStatus: 'Paid',
      payMode:   completionModeOfPayment,
      txId:      completionTransactionId.trim(),
    });
  }

  async function handleRequestAction(action: 'replace' | 'refund') {
    setConfirmAction(null);
    setSaving(true);
    try {
      const res = await fetch(`/api/sales/${encodeURIComponent(invoiceId)}`, {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          requestAction: action === 'replace' ? 'replace_requested' : 'refund_requested',
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(parseApiError(data)); return; }

      setSuccessMsg(`Invoice ${invoiceId} moved to ${action === 'replace' ? 'Replacement Management' : 'Return/Refund Management'}.`);
      loadSale();
    } catch {
      setError({ message: "Couldn't submit request action." });
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

  const isCompleted = sale?.saleStatus === 'Purchase Satisfied & Order Completed' || sale?.saleStatus === 'Purchase Satisfied';

  return (
    <div style={{ maxWidth: 840, margin: '0 auto', paddingBottom: 40 }}>
      <MobileBackButton />

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
            {isCompleted && (
              <span className="badge badge-success" style={{ fontSize: 12 }}>
                ✓ Order Completed
              </span>
            )}
          </div>
          <div className="page-subtitle">
            Created by {sale?.createdBy} on {sale?.createdAt ? new Date(sale.createdAt).toLocaleString('en-IN') : '—'}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {!isLocked && (
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={handleOpenSaleCompletedModal}
              disabled={saving || deleting}
              style={{ background: '#2e7d32', borderColor: '#2e7d32' }}
            >
              ✓ Sale Completed
            </button>
          )}
          <button className="btn btn-ghost btn-sm" onClick={loadSale} disabled={saving || deleting}>
            ↻ Reload
          </button>
          <button className="btn btn-danger btn-sm" onClick={handleDelete} disabled={saving || deleting || isLocked}>
            Delete
          </button>
        </div>
      </div>

      {/* Locked Banner */}
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

      {/* Order Summary */}
      <div className="card" style={{ marginBottom: 24, opacity: isLocked ? 0.85 : 1 }}>
        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 16 }}>Order Overview & Sourcing</h2>
          <div style={{ display: 'flex', gap: 8 }}>
            {!isLocked && (
              <>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setConfirmAction('replace')}>
                  🔄 Replace Requested
                </button>
                {/* A1 Label Update: Return/Refund Requested */}
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setConfirmAction('refund')}>
                  ↩ Return/Refund Requested
                </button>
              </>
            )}
          </div>
        </div>

        <div className="grid-form-2" style={{ marginBottom: 16 }}>
          <div>
            <div className="form-label" style={{ fontSize: 11 }}>FULFILMENT SOURCE</div>
            <span className="badge badge-info">{sale?.fulfilmentSource}</span>
          </div>

          <div>
            <div className="form-label" style={{ fontSize: 11 }}>DELIVERY STATUS</div>
            <span className="badge badge-success">{sale?.deliveryStatus}</span>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--color-border)', paddingTop: 12 }}>
          <div>
            <div className="form-label" style={{ fontSize: 11 }}>TOTAL AMOUNT</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--color-brand-primary)' }} className="tabular-nums">
              ₹{livePricing.grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </div>
          </div>

          {sale?.saleClosedBy && (
            <div style={{ textAlign: 'right' }}>
              <div className="form-label" style={{ fontSize: 11 }}>SALE CLOSED BY</div>
              <span className="badge badge-success" style={{ fontSize: 12, fontWeight: 700 }}>
                👤 {sale.saleClosedBy}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Purchased Items Table */}
      <div className="card" style={{ marginBottom: 24, opacity: isLocked ? 0.85 : 1 }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 16,
          borderBottom: '1px solid var(--color-border)',
          paddingBottom: 8,
          gap: 10,
          flexWrap: 'wrap',
        }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 16 }}>Purchased Items</h2>
          {!isLocked && (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={handleOpenAddItems}
              disabled={showAddItems}
            >
              + Add Items to Sale
            </button>
          )}
        </div>

        {/* Part 6 B2: Add Items Panel */}
        {showAddItems && (
          <div style={{
            background: 'rgba(43,98,198,0.04)',
            border: '1px dashed var(--color-brand-secondary)',
            borderRadius: 8,
            padding: 16,
            marginBottom: 20,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 700 }}>Add More Items</h3>
              <button
                type="button"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-ink-muted)', fontSize: 18 }}
                onClick={() => { setShowAddItems(false); setPendingAddItems([]); setAddItemsError(null); }}
              >
                ×
              </button>
            </div>

            {addItemsError && <ErrorMessage message={addItemsError} variant="error" onDismiss={() => setAddItemsError(null)} />}

            {/* Fulfilment Source Select */}
            <div className="form-group" style={{ marginBottom: 12 }}>
              <label className="form-label">Fulfilment Source *</label>
              <select
                className="form-select"
                value={addItemsFulfilmentSource}
                onChange={(e) => setAddItemsFulfilmentSource(e.target.value)}
              >
                <option value="Main Inventory">Main Inventory (Unassigned Main Stock)</option>
                {addItemsAdmins.map((adm) => (
                  <option key={adm} value={adm}>Handler: {adm}</option>
                ))}
              </select>
            </div>

            {/* Item Picker */}
            <div className="form-group" style={{ marginBottom: 12 }}>
              <label className="form-label">Select Item from Inventory *</label>
              <select
                className="form-select"
                onChange={(e) => { handleAddItemToList(e.target.value); e.currentTarget.value = ''; }}
                defaultValue=""
              >
                <option value="">-- Choose item to add --</option>
                {addItemsInventory.map((inv) => (
                  <option key={`${inv.itemName}:${inv.size}`} value={`${inv.itemName}:${inv.size}`}>
                    {inv.itemName} — Size {inv.size} ({inv.qty} available)
                  </option>
                ))}
              </select>
            </div>

            {/* Pending Item Cards */}
            {pendingAddItems.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 12 }}>
                {pendingAddItems.map((item, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: '10px 14px',
                      border: '1px solid var(--color-border)',
                      borderRadius: 8,
                      background: '#fff',
                      flexWrap: 'wrap',
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 120 }}>
                      <span style={{ fontWeight: 700, fontSize: 13 }}>{item.itemName}</span>
                      <span className="badge badge-neutral" style={{ marginLeft: 8, fontSize: 11 }}>Size {item.size}</span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 12, color: 'var(--color-ink-muted)' }}>Qty:</span>
                      <button type="button" className="btn btn-ghost btn-sm" style={{ padding: '2px 8px', height: 26, minWidth: 26 }}
                        onClick={() => updatePendingItemField(idx, 'qty', Math.max(1, item.qty - 1))}>
                        -
                      </button>
                      <span style={{ fontWeight: 700, fontSize: 13, minWidth: 20, textAlign: 'center' }}>{item.qty}</span>
                      <button type="button" className="btn btn-ghost btn-sm" style={{ padding: '2px 8px', height: 26, minWidth: 26 }}
                        onClick={() => updatePendingItemField(idx, 'qty', item.qty + 1)}>
                        +
                      </button>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 12, color: 'var(--color-ink-muted)' }}>Price each: ₹</span>
                      <input
                        type="number"
                        className="form-input"
                        style={{ width: 80, padding: '4px 8px', fontSize: 13 }}
                        value={item.unitPrice}
                        min={0}
                        onChange={(e) => updatePendingItemField(idx, 'unitPrice', parseFloat(e.target.value) || 0)}
                      />
                    </div>

                    <div style={{ fontWeight: 700, fontSize: 13, minWidth: 80, textAlign: 'right' }} className="tabular-nums">
                      ₹{(item.unitPrice * item.qty).toLocaleString('en-IN')}
                    </div>

                    <button
                      type="button"
                      onClick={() => removePendingItem(idx)}
                      style={{ background: 'none', border: 'none', color: 'var(--color-error)', cursor: 'pointer', fontWeight: 700, fontSize: 16 }}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}

            {pendingAddItems.length === 0 && (
              <div style={{ fontSize: 13, color: 'var(--color-ink-muted)', textAlign: 'center', padding: '12px 0' }}>
                Select items from the dropdown above to add them to this sale.
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => { setShowAddItems(false); setPendingAddItems([]); setAddItemsError(null); }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleSubmitAddItems}
                disabled={addItemsSubmitting || pendingAddItems.length === 0}
              >
                {addItemsSubmitting ? <LoadingGecko size="inline" label="Adding…" /> : `Add ${pendingAddItems.length} Item(s) to Sale`}
              </button>
            </div>
          </div>
        )}

        {(() => {
          const names = (sale?.itemNames || '').split(',').map((n) => n.trim()).filter(Boolean);
          const sizes = (sale?.sizes || '').split(',').map((s) => s.trim()).filter(Boolean);
          const prices = (sale?.itemPrices || '').split(',').map((p) => parseFloat(p.trim()) || 0);

          const map = new Map<string, { name: string; size: string; qty: number; unitPrice: number }>();
          for (let i = 0; i < names.length; i++) {
            const sz = sizes[i] ?? sizes[0] ?? '—';
            const pr = prices[i] ?? (prices.length === 1 ? prices[0] : 0);
            const key = `${names[i]}:${sz}:${pr}`;
            const existing = map.get(key);
            if (existing) {
              existing.qty += 1;
            } else {
              map.set(key, { name: names[i], size: sz, qty: 1, unitPrice: pr });
            }
          }
          const lineItems = Array.from(map.values());

          return (
            <div>
              <div style={{ overflowX: 'auto', marginBottom: 16 }}>
                <table className="table" style={{ width: '100%', fontSize: 13 }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left' }}>Item</th>
                      <th style={{ textAlign: 'center' }}>Size</th>
                      <th style={{ textAlign: 'center' }}>Quantity</th>
                      <th style={{ textAlign: 'right' }}>Price per Item</th>
                      <th style={{ textAlign: 'right' }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lineItems.map((item, idx) => {
                      const totalPieces = lineItems.reduce((sum, i) => sum + i.qty, 0);
                      const fallbackPrice = totalPieces > 0 ? computedSubtotal / totalPieces : 0;
                      const price = item.unitPrice > 0 ? item.unitPrice : fallbackPrice;
                      const total = price * item.qty;
                      return (
                        <tr key={idx}>
                          <td style={{ fontWeight: 600 }}>{item.name}</td>
                          <td style={{ textAlign: 'center' }}>
                            <span className="badge badge-neutral" style={{ fontSize: 11 }}>{item.size}</span>
                          </td>
                          <td style={{ textAlign: 'center', fontWeight: 600 }}>{item.qty}</td>
                          <td style={{ textAlign: 'right' }} className="tabular-nums">₹{price.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                          <td style={{ textAlign: 'right', fontWeight: 700 }} className="tabular-nums">₹{total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Summary Breakdown */}
              <div style={{
                borderTop: '1px solid var(--color-border)',
                paddingTop: 12,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-end',
                gap: 6,
                fontSize: 13,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', width: 260, color: 'var(--color-ink-muted)' }}>
                  <span>Subtotal:</span>
                  <span className="tabular-nums" style={{ fontWeight: 600, color: 'var(--color-ink)' }}>₹{computedSubtotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                </div>
                {discountVal > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', width: 260, color: 'var(--color-error)' }}>
                    <span>Discount:</span>
                    <span className="tabular-nums" style={{ fontWeight: 600 }}>-₹{discountVal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                  </div>
                )}
                {livePricing.deliveryCharge > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', width: 260, color: 'var(--color-ink-muted)' }}>
                    <span>Delivery Charge:</span>
                    <span className="tabular-nums" style={{ fontWeight: 600, color: 'var(--color-ink)' }}>+₹{livePricing.deliveryCharge.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                  </div>
                )}
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  width: 260,
                  borderTop: '1px solid var(--color-border)',
                  paddingTop: 8,
                  marginTop: 4,
                  fontSize: 15,
                  fontWeight: 700,
                  color: 'var(--color-brand-primary)',
                }}>
                  <span>Total Amount:</span>
                  <span className="tabular-nums">₹{livePricing.grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                </div>
              </div>
            </div>
          );
        })()}
      </div>

      {/* Edit Form */}
      <form onSubmit={handleSaveChanges} className="card">
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 16, marginBottom: 16, borderBottom: '1px solid var(--color-border)', paddingBottom: 8 }}>
          Edit Customer & Delivery Details
        </h2>

        <fieldset disabled={isLocked} style={{ border: 'none', padding: 0, margin: 0 }}>
          <div className="grid-form-2">
            <div className="form-group">
              <label className="form-label">Customer Name</label>
              <input
                type="text"
                className="form-input"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Phone Number</label>
              <input
                type="text"
                className="form-input"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Customer Address</label>
            <textarea
              className="form-textarea"
              rows={2}
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

            <div className="form-group" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
                <input
                  type="checkbox"
                  checked={deliveryChargeToggle}
                  onChange={(e) => setDeliveryChargeToggle(e.target.checked)}
                />
                Apply Delivery Charge
              </label>

              {deliveryChargeToggle && (
                <input
                  type="number"
                  className="form-input"
                  style={{ marginTop: 8 }}
                  placeholder="Delivery charge (₹)"
                  value={deliveryChargeAmount}
                  onChange={(e) => setDeliveryChargeAmount(e.target.value)}
                />
              )}
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
                disabled={paymentStatus !== 'Paid'}
              >
                <option value="Cash">Cash</option>
                <option value="UPI">UPI</option>
                <option value="Card">Card</option>
                <option value="Bank Transfer">Bank Transfer</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Sale Status</label>
              <select
                className="form-select"
                value={saleStatus}
                onChange={(e) => setSaleStatus(e.target.value)}
              >
                <option value="Not Provided / Order Only Placed">Not Provided / Order Only Placed</option>
                <option value="Payment Pending">Payment Pending</option>
                <option value="Purchase Satisfied">Purchase Satisfied</option>
                <option value="Purchase Satisfied & Order Completed">Purchase Satisfied & Order Completed</option>
                <option value="Replacement Completed & Purchase Satisfied">Replacement Completed & Purchase Satisfied</option>
                <option value="Return & Refund">Return & Refund</option>
              </select>
            </div>
          </div>

          {paymentStatus === 'Paid' && modeOfPayment !== 'Cash' && (
            <div className="form-group">
              <label className="form-label">Transaction ID / Reference Number *</label>
              <input
                type="text"
                className="form-input"
                value={transactionId}
                onChange={(e) => setTransactionId(e.target.value)}
                placeholder="Required for UPI, Card, or Bank Transfer"
              />
            </div>
          )}

          {!isLocked && (
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
              <button type="button" className="btn btn-ghost" onClick={loadSale} disabled={saving}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? <LoadingGecko size="inline" label="Saving..." /> : 'Save Changes'}
              </button>
            </div>
          )}
        </fieldset>
      </form>

      {/* Confirmation Dialogs for Replace / Return & Refund Requests */}
      {confirmAction && (
        <div className="modal-backdrop" onClick={() => setConfirmAction(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 460 }}>
            <div className="modal-header">
              <h2>Confirm {confirmAction === 'replace' ? 'Replacement' : 'Return/Refund'} Request</h2>
              <button className="btn-icon" onClick={() => setConfirmAction(null)}>×</button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: 14, lineHeight: 1.5 }}>
                Are you sure you want to mark Invoice <strong>{invoiceId}</strong> as <strong>{confirmAction === 'replace' ? 'Replace Requested' : 'Return/Refund Requested'}</strong>?
              </p>
              <p style={{ fontSize: 13, color: 'var(--color-ink-muted)', marginTop: 8 }}>
                This will lock standard editing on this sale record and create a new workflow entry in the {confirmAction === 'replace' ? 'Replacement Management' : 'Return / Refund Management'} section.
              </p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setConfirmAction(null)}>Cancel</button>
              <button
                className="btn btn-primary"
                onClick={() => handleRequestAction(confirmAction)}
                disabled={saving}
              >
                Confirm & Lock Order
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SALE COMPLETED PAYMENT VERIFICATION MODAL */}
      {showCompleteModal && (
        <div className="modal-backdrop" onClick={() => setShowCompleteModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 500 }}>
            <div className="modal-header">
              <h2>Complete Sale — Payment Required</h2>
              <button className="btn-icon" onClick={() => setShowCompleteModal(false)}>×</button>
            </div>

            <form onSubmit={handleConfirmCompletionForm}>
              <div className="modal-body">
                {completionError && <ErrorMessage message={completionError} variant="error" />}

                <div style={{ background: 'rgba(255, 152, 0, 0.1)', padding: 12, borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
                  Invoice <strong>{invoiceId}</strong> is currently marked as <strong>{paymentStatus}</strong>. Orders can only be completed when payment is confirmed.
                </div>

                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: 700 }}>Has payment been received for this sale?</label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
                      <input
                        type="radio"
                        name="paymentChoice"
                        checked={completionPaymentChoice === 'paid_now'}
                        onChange={() => setCompletionPaymentChoice('paid_now')}
                      />
                      Yes — Payment Received Now (Mark Paid & Complete)
                    </label>

                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
                      <input
                        type="radio"
                        name="paymentChoice"
                        checked={completionPaymentChoice === 'not_paid'}
                        onChange={() => setCompletionPaymentChoice('not_paid')}
                      />
                      No — Payment Not Received Yet
                    </label>
                  </div>
                </div>

                {completionPaymentChoice === 'paid_now' && (
                  <>
                    <div className="form-group">
                      <label className="form-label">Mode of Payment *</label>
                      <select
                        className="form-select"
                        value={completionModeOfPayment}
                        onChange={(e) => setCompletionModeOfPayment(e.target.value)}
                      >
                        <option value="Cash">Cash</option>
                        <option value="UPI">UPI</option>
                        <option value="Card">Card</option>
                        <option value="Bank Transfer">Bank Transfer</option>
                      </select>
                    </div>

                    {completionModeOfPayment !== 'Cash' && (
                      <div className="form-group">
                        <label className="form-label">Transaction ID / Reference Number *</label>
                        <input
                          type="text"
                          className="form-input"
                          value={completionTransactionId}
                          onChange={(e) => setCompletionTransactionId(e.target.value)}
                          placeholder="Required for UPI, Card, or Bank Transfer"
                          required
                        />
                      </div>
                    )}
                  </>
                )}
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setShowCompleteModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? <LoadingGecko size="inline" label="Completing..." /> : '✓ Confirm & Complete Sale'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
