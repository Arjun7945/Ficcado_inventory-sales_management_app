'use client';

/**
 * app/(app)/dashboard/damaged-products/page.tsx
 * Damaged Products Management UI (Phase 14).
 *
 * Full CRUD table for items marked as damaged via Replacement/Refund disposition paths
 * or logged directly by admins.
 */

import React, { useEffect, useState } from 'react';
import LoadingGecko from '@/components/LoadingGecko';
import ErrorMessage, { parseApiError } from '@/components/ErrorMessage';
import { validate, DamagedProductSchema } from '@/lib/validation';
import { formatISTDateTime } from '@/lib/dateUtils';

interface DamagedProduct {
  rowIndex:      number;
  sno:           string;
  invoiceNumber: string;
  itemName:      string;
  size:          string;
  quantity:      number;
  customerName:  string;
  reasonNotes:   string;
  createdAt:     string;
  createdBy:     string;
  updatedAt:     string;
  updatedBy:     string;
}

export default function DamagedProductsPage() {
  const [damagedProducts, setDamagedProducts] = useState<DamagedProduct[]>([]);
  const [registeredItems, setRegisteredItems] = useState<string[]>([]);
  const [loading, setLoading]                 = useState(true);
  const [error, setError]                     = useState<{ message: string } | null>(null);
  const [success, setSuccess]                 = useState<string | null>(null);
  const [search, setSearch]                   = useState('');

  // Add / Edit modal state
  const [showModal, setShowModal]         = useState(false);
  const [editingRowIndex, setEditingRowIndex] = useState<number | null>(null);
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [itemName, setItemName]           = useState('');
  const [size, setSize]                   = useState('M');
  const [quantity, setQuantity]           = useState('1');
  const [customerName, setCustomerName]   = useState('');
  const [reasonNotes, setReasonNotes]     = useState('');

  const [submitting, setSubmitting]       = useState(false);
  const [deletingRow, setDeletingRow]     = useState<number | null>(null);
  const [formErrors, setFormErrors]       = useState<Record<string, string>>({});

  async function loadData() {
    setLoading(true);
    try {
      const [dmgRes, itemsRes] = await Promise.all([
        fetch('/api/damaged-products').then((r) => r.json()),
        fetch('/api/items').then((r) => r.json()),
      ]);

      if (dmgRes.damagedProducts) setDamagedProducts(dmgRes.damagedProducts);
      if (itemsRes.items)         setRegisteredItems(itemsRes.items.map((i: any) => i.itemName));
      if (!dmgRes.damagedProducts) setError(parseApiError(dmgRes));
    } catch { setError({ message: "Couldn't load damaged products." }); }
    finally { setLoading(false); }
  }

  useEffect(() => { loadData(); }, []);

  function handleOpenCreate() {
    setEditingRowIndex(null);
    setInvoiceNumber('');
    setItemName(registeredItems[0] || '');
    setSize('M');
    setQuantity('1');
    setCustomerName('');
    setReasonNotes('');
    setFormErrors({});
    setShowModal(true);
  }

  function handleOpenEdit(item: DamagedProduct) {
    setEditingRowIndex(item.rowIndex);
    setInvoiceNumber(item.invoiceNumber);
    setItemName(item.itemName);
    setSize(item.size);
    setQuantity(String(item.quantity));
    setCustomerName(item.customerName);
    setReasonNotes(item.reasonNotes);
    setFormErrors({});
    setShowModal(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setFormErrors({});

    const payload = {
      invoiceNumber: invoiceNumber || undefined,
      itemName,
      size,
      quantity:      parseInt(quantity || '1', 10),
      customerName:  customerName || undefined,
      reasonNotes:   reasonNotes || undefined,
    };

    const { valid, errors: valErrors } = validate(DamagedProductSchema, payload);
    if (!valid) {
      setFormErrors(valErrors);
      return;
    }

    setSubmitting(true);
    try {
      const isEdit = editingRowIndex !== null;
      const url = isEdit ? `/api/damaged-products/${editingRowIndex}` : '/api/damaged-products';
      const method = isEdit ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(parseApiError(data));
        return;
      }

      setShowModal(false);
      setSuccess(data.message || 'Damaged product saved.');
      loadData();
    } catch { setError({ message: "Couldn't save damaged product record." }); }
    finally { setSubmitting(false); }
  }

  async function handleDelete(rowIndex: number, label: string) {
    if (!confirm(`Delete damaged product entry for '${label}'?`)) return;
    setDeletingRow(rowIndex);
    try {
      const res = await fetch(`/api/damaged-products/${rowIndex}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) { setError(parseApiError(data)); return; }
      setSuccess('Damaged product entry deleted.');
      loadData();
    } catch { setError({ message: "Couldn't delete entry." }); }
    finally { setDeletingRow(null); }
  }

  const filtered = damagedProducts.filter((d) => {
    const q = search.toLowerCase();
    return !q ||
      d.itemName.toLowerCase().includes(q) ||
      d.invoiceNumber.toLowerCase().includes(q) ||
      d.customerName.toLowerCase().includes(q) ||
      d.reasonNotes.toLowerCase().includes(q);
  });

  if (loading) return <LoadingGecko size="full" label="Loading damaged products…" />;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Damaged Products</h1>
          <div className="page-subtitle">{filtered.length} damaged product record{filtered.length !== 1 ? 's' : ''} logged</div>
        </div>
        <button className="btn btn-primary" onClick={handleOpenCreate}>
          + Log Damaged Item
        </button>
      </div>

      {error   && <ErrorMessage message={error.message} variant="error"   onDismiss={() => setError(null)} />}
      {success && <ErrorMessage message={success}       variant="success" onDismiss={() => setSuccess(null)} />}

      {/* Filter / Search */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        <div className="search-bar" style={{ flex: 1, maxWidth: 360 }}>
          <span style={{ color: 'var(--color-ink-muted)' }}>⌕</span>
          <input
            type="text"
            placeholder="Search invoice, item name, customer..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <button className="btn btn-ghost btn-sm" onClick={loadData}>↻ Refresh</button>
      </div>

      {/* Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {filtered.length === 0 ? (
          <div className="empty-state">
            <div style={{ fontSize: 28 }}>⚠️</div>
            <div className="empty-state-title">No damaged product records</div>
            <div style={{ fontSize: 13, color: 'var(--color-ink-muted)' }}>
              Items sent to Damaged Products during replacement/refund disposition will automatically appear here.
            </div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Invoice #</th>
                  <th>Item Name</th>
                  <th>Size</th>
                  <th>Quantity</th>
                  <th>Customer Name</th>
                  <th>Reason / Notes</th>
                  <th>Logged Date</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => (
                  <tr key={item.rowIndex}>
                    <td>
                      {item.invoiceNumber ? (
                        <span style={{ fontWeight: 700, color: 'var(--color-brand-primary)', fontFamily: 'var(--font-display)' }}>
                          {item.invoiceNumber}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--color-ink-muted)', fontSize: 12 }}>Manual</span>
                      )}
                    </td>
                    <td style={{ fontWeight: 600 }}>{item.itemName}</td>
                    <td><span className="badge badge-neutral">{item.size}</span></td>
                    <td className="tabular-nums" style={{ fontWeight: 700 }}>{item.quantity} piece(s)</td>
                    <td>{item.customerName || '—'}</td>
                    <td style={{ fontSize: 12.5, color: 'var(--color-ink-muted)' }}>{item.reasonNotes || '—'}</td>
                    <td style={{ fontSize: 12, color: 'var(--color-ink-muted)' }}>
                      {formatISTDateTime(item.createdAt)}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => handleOpenEdit(item)}>
                          Edit
                        </button>
                        <button
                          className="btn btn-danger btn-sm"
                          disabled={deletingRow === item.rowIndex}
                          onClick={() => handleDelete(item.rowIndex, `${item.itemName} (${item.size})`)}
                        >
                          {deletingRow === item.rowIndex ? '…' : 'Delete'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="modal-backdrop" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 460 }}>
            <div className="modal-header">
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 18 }}>
                {editingRowIndex ? 'Edit Damaged Item Record' : 'Log Damaged Item'}
              </h2>
              <button className="btn-icon" onClick={() => setShowModal(false)}>×</button>
            </div>
            <form onSubmit={handleSave}>
              <div className="modal-body">
                <div className="grid-form-2">
                  <div className="form-group">
                    <label className="form-label">Invoice Number (Optional)</label>
                    <input
                      type="text"
                      className="form-input"
                      value={invoiceNumber}
                      onChange={(e) => setInvoiceNumber(e.target.value)}
                      placeholder="e.g. FIC-215"
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Customer Name</label>
                    <input
                      type="text"
                      className="form-input"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      placeholder="Customer name"
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Item Name *</label>
                  {registeredItems.length > 0 ? (
                    <select
                      className={`form-select ${formErrors.itemName ? 'error' : ''}`}
                      value={itemName}
                      onChange={(e) => setItemName(e.target.value)}
                    >
                      {registeredItems.map((name) => (
                        <option key={name} value={name}>{name}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      className={`form-input ${formErrors.itemName ? 'error' : ''}`}
                      value={itemName}
                      onChange={(e) => setItemName(e.target.value)}
                      placeholder="Item name"
                    />
                  )}
                  {formErrors.itemName && <div className="form-error">{formErrors.itemName}</div>}
                </div>

                <div className="grid-form-2">
                  <div className="form-group">
                    <label className="form-label">Size *</label>
                    <select
                      className="form-select"
                      value={size}
                      onChange={(e) => setSize(e.target.value)}
                    >
                      {['XS', 'S', 'M', 'L', 'XL'].map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Quantity (piece(s)) *</label>
                    <input
                      type="number"
                      className={`form-input ${formErrors.quantity ? 'error' : ''}`}
                      value={quantity}
                      onChange={(e) => setQuantity(e.target.value)}
                      min="1"
                    />
                    {formErrors.quantity && <div className="form-error">{formErrors.quantity}</div>}
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Reason / Condition Notes</label>
                  <textarea
                    className="form-textarea"
                    rows={3}
                    value={reasonNotes}
                    onChange={(e) => setReasonNotes(e.target.value)}
                    placeholder="Describe item condition or defect details..."
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? <LoadingGecko size="inline" label="Saving…" /> : 'Save Record'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
