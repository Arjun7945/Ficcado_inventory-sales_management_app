'use client';

/**
 * app/(app)/dashboard/inventory/page.tsx
 * Inventory Management — track stock quantities by item and size.
 * Part 2: Items-sourced dropdowns, piece(s) label, full row edit view.
 */

import React, { useEffect, useState } from 'react';
import LoadingGecko from '@/components/LoadingGecko';
import ErrorMessage, { parseApiError } from '@/components/ErrorMessage';

interface InventoryItem {
  rowIndex: number;
  sno: string;
  itemName: string;
  size: string;
  qty: number;
  updatedAt: string;
  updatedBy: string;
  currentStatus: string;
}

interface RegisteredItem {
  itemName: string;
  sizes: string[];
  status: string;
}

export default function InventoryPage() {
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [registeredItems, setRegisteredItems] = useState<RegisteredItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ message: string } | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Update / Add Stock modal
  const [showModal, setShowModal] = useState(false);
  const [editingSno, setEditingSno] = useState<string | null>(null);
  const [itemName, setItemName] = useState('');
  const [availableSizes, setAvailableSizes] = useState<string[]>(['XS', 'S', 'M', 'L', 'XL']);
  const [size, setSize] = useState('M');
  const [qty, setQty] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function loadInventory() {
    setLoading(true);
    try {
      const res = await fetch('/api/inventory');
      const data = await res.json();
      if (!res.ok) { setError(parseApiError(data)); return; }
      setInventory(data.inventory ?? []);
      setRegisteredItems(data.items ?? []);
    } catch {
      setError({ message: "Couldn't load inventory." });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadInventory(); }, []);

  function handleOpenCreate() {
    setEditingSno(null);
    setFormError(null);
    const firstItem = registeredItems[0];
    if (firstItem) {
      setItemName(firstItem.itemName);
      setAvailableSizes(firstItem.sizes);
      setSize(firstItem.sizes[0] || 'M');
    } else {
      setItemName('');
      setAvailableSizes(['XS', 'S', 'M', 'L', 'XL']);
      setSize('M');
    }
    setQty('');
    setShowModal(true);
  }

  function handleOpenEdit(item: InventoryItem) {
    setEditingSno(item.sno);
    setFormError(null);
    setItemName(item.itemName);
    const reg = registeredItems.find((r) => r.itemName === item.itemName);
    const sizes = reg ? reg.sizes : ['XS', 'S', 'M', 'L', 'XL'];
    setAvailableSizes(sizes);
    setSize(item.size);
    setQty(String(item.qty));
    setShowModal(true);
  }

  function handleItemChange(newItemName: string) {
    setItemName(newItemName);
    const reg = registeredItems.find((r) => r.itemName === newItemName);
    const sizes = reg ? reg.sizes : ['XS', 'S', 'M', 'L', 'XL'];
    setAvailableSizes(sizes);
    if (!sizes.includes(size)) {
      setSize(sizes[0] || 'M');
    }
  }

  async function handleSaveStock(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (!itemName.trim()) { setFormError('Select an item name'); return; }
    if (qty === '' || parseInt(qty, 10) < 0) { setFormError('Quantity must be 0 or greater'); return; }

    setSubmitting(true);
    try {
      const isEdit = editingSno !== null;
      const url = isEdit ? `/api/inventory/${editingSno}` : '/api/inventory';
      const method = isEdit ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemName,
          size,
          totalQuantityAvailable: parseInt(qty, 10),
        }),
      });

      const data = await res.json();
      if (!res.ok) { setFormError(data.error || 'Failed to save inventory'); return; }

      setShowModal(false);
      setSuccess(`Inventory for ${itemName} (${size}) saved.`);
      loadInventory();
    } catch {
      setFormError("Couldn't connect to server.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Inventory Stock</h1>
          <div className="page-subtitle">{inventory.length} size stock records</div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-ghost btn-sm" onClick={loadInventory} disabled={loading}>
            ⟳ Refresh
          </button>
          <button className="btn btn-primary" onClick={handleOpenCreate}>
            + Update / Add Stock
          </button>
        </div>
      </div>

      {error   && <ErrorMessage message={error.message} variant="error"   onDismiss={() => setError(null)} />}
      {success && <ErrorMessage message={success}       variant="success" onDismiss={() => setSuccess(null)} />}

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 48, textAlign: 'center' }}>
            <LoadingGecko label="Loading inventory stock levels…" />
          </div>
        ) : inventory.length === 0 ? (
          <div className="empty-state">
            <div style={{ fontSize: 28 }}>▦</div>
            <div className="empty-state-title">No stock entries yet</div>
            <div style={{ fontSize: 13, color: 'var(--color-ink-muted)' }}>
              Click "+ Update / Add Stock" to log inventory quantities.
            </div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Item Name</th>
                  <th>Size</th>
                  <th>Quantity Available</th>
                  <th>Stock Status</th>
                  <th>Last Updated</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {inventory.map((inv, idx) => {
                  const q = inv.qty;
                  const isLow = q === 0;
                  return (
                    <tr key={inv.itemName + inv.size + idx}>
                      <td style={{ fontWeight: 600 }}>{inv.itemName}</td>
                      <td>
                        <span className="badge badge-neutral" style={{ fontWeight: 700 }}>
                          {inv.size}
                        </span>
                      </td>
                      <td className="tabular-nums" style={{ fontWeight: 700, fontSize: 15 }}>
                        {q} piece(s)
                      </td>
                      <td>
                        <span className={`badge ${isLow ? 'badge-error' : q < 5 ? 'badge-warning' : 'badge-success'}`}>
                          {isLow ? 'Out of Stock' : q < 5 ? 'Low Stock' : 'In Stock'}
                        </span>
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--color-ink-muted)' }}>
                        {inv.updatedAt ? new Date(inv.updatedAt).toLocaleDateString('en-IN') : '—'}
                      </td>
                      <td>
                        <button className="btn btn-ghost btn-sm" onClick={() => handleOpenEdit(inv)}>
                          Edit
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && (
        <div className="modal-backdrop" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 450 }}>
            <div className="modal-header">
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 18 }}>
                {editingSno ? 'Edit Inventory Stock' : 'Add Inventory Stock'}
              </h2>
              <button className="btn-icon" onClick={() => setShowModal(false)}>×</button>
            </div>
            <form onSubmit={handleSaveStock}>
              <div className="modal-body">
                {formError && <ErrorMessage message={formError} variant="error" />}

                <div className="form-group">
                  <label className="form-label">Item Name *</label>
                  {registeredItems.length > 0 ? (
                    <select
                      className="form-select"
                      value={itemName}
                      onChange={(e) => handleItemChange(e.target.value)}
                    >
                      {registeredItems.map((it) => (
                        <option key={it.itemName} value={it.itemName}>{it.itemName}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      className="form-input"
                      value={itemName}
                      onChange={(e) => setItemName(e.target.value)}
                      placeholder="e.g. Eternity Black"
                    />
                  )}
                </div>

                <div className="grid-form-2">
                  <div className="form-group">
                    <label className="form-label">Size *</label>
                    <select
                      className="form-select"
                      value={size}
                      onChange={(e) => setSize(e.target.value)}
                    >
                      {availableSizes.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Total Quantity (piece(s)) *</label>
                    <input
                      type="number"
                      className="form-input"
                      value={qty}
                      onChange={(e) => setQty(e.target.value)}
                      placeholder="e.g. 50"
                      min="0"
                    />
                  </div>
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? <LoadingGecko size="inline" label="Saving…" /> : 'Save Inventory'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
