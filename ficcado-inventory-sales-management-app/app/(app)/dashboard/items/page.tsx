'use client';

/**
 * app/(app)/dashboard/items/page.tsx
 * Items Management — CRUD for item catalog and pricing.
 */

import React, { useEffect, useState } from 'react';
import LoadingGecko from '@/components/LoadingGecko';
import ErrorMessage, { parseApiError } from '@/components/ErrorMessage';

interface Item {
  rowIndex: number;
  sno: string;
  itemName: string;
  itemType: string;
  price: string;
  sizes: string;
  status: string;
  updatedAt: string;
  updatedBy: string;
}

export default function ItemsPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ message: string } | null>(null);

  // New item modal state
  const [showModal, setShowModal] = useState(false);
  const [itemName, setItemName] = useState('');
  const [itemType, setItemType] = useState('T-Shirt');
  const [price, setPrice] = useState('');
  const [selectedSizes, setSelectedSizes] = useState<string[]>(['S', 'M', 'L', 'XL']);
  const [status, setStatus] = useState('In Stock');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function loadItems() {
    setLoading(true);
    try {
      const res = await fetch('/api/items');
      const data = await res.json();
      if (!res.ok) { setError(parseApiError(data)); return; }
      setItems(data.items ?? []);
    } catch {
      setError({ message: "Couldn't load items. Check your connection." });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadItems(); }, []);

  function toggleSize(s: string) {
    if (selectedSizes.includes(s)) {
      setSelectedSizes(selectedSizes.filter((x) => x !== s));
    } else {
      setSelectedSizes([...selectedSizes, s]);
    }
  }

  async function handleCreateItem(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (!itemName.trim()) { setFormError('Item name is required'); return; }
    if (!price || parseFloat(price) <= 0) { setFormError('Price must be greater than 0'); return; }
    if (selectedSizes.length === 0) { setFormError('Select at least one size'); return; }

    setSubmitting(true);
    try {
      const res = await fetch('/api/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemName,
          itemType,
          priceOfItem: parseFloat(price),
          availableSizes: selectedSizes,
          currentStatus: status,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setFormError(data.error || 'Failed to create item');
        return;
      }

      setShowModal(false);
      setItemName('');
      setPrice('');
      loadItems();
    } catch {
      setFormError("Couldn't connect to server.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <LoadingGecko size="full" label="Loading catalog…" />;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Items Catalog</h1>
          <div className="page-subtitle">{items.length} items in master catalog</div>
        </div>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>
          + Add New Item
        </button>
      </div>

      {error && <ErrorMessage message={error.message} variant="error" onDismiss={() => setError(null)} />}

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {items.length === 0 ? (
          <div className="empty-state">
            <div style={{ fontSize: 28 }}>◈</div>
            <div className="empty-state-title">No items found</div>
            <div style={{ fontSize: 13, color: 'var(--color-ink-muted)' }}>
              Click "+ Add New Item" to create your first clothing item.
            </div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>S.No</th>
                  <th>Item Name</th>
                  <th>Type</th>
                  <th>Price</th>
                  <th>Available Sizes</th>
                  <th>Status</th>
                  <th>Last Updated</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, idx) => (
                  <tr key={item.itemName + idx}>
                    <td style={{ color: 'var(--color-ink-muted)' }}>{idx + 1}</td>
                    <td style={{ fontWeight: 600 }}>{item.itemName}</td>
                    <td>{item.itemType}</td>
                    <td className="tabular-nums" style={{ fontWeight: 600 }}>₹{parseFloat(item.price || '0').toLocaleString('en-IN')}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        {item.sizes.split(',').map((s) => (
                          <span key={s.trim()} className="badge badge-neutral" style={{ fontSize: 10 }}>
                            {s.trim()}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td>
                      <span className={`badge ${item.status === 'In Stock' ? 'badge-success' : 'badge-error'}`}>
                        {item.status}
                      </span>
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--color-ink-muted)' }}>
                      {item.updatedAt ? new Date(item.updatedAt).toLocaleDateString('en-IN') : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && (
        <div className="modal-backdrop" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 460 }}>
            <div className="modal-header">
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 18 }}>Add New Item</h2>
              <button className="btn-icon" onClick={() => setShowModal(false)}>×</button>
            </div>
            <form onSubmit={handleCreateItem}>
              <div className="modal-body">
                {formError && <ErrorMessage message={formError} variant="error" />}

                <div className="form-group">
                  <label className="form-label">Item Name</label>
                  <input
                    type="text"
                    className="form-input"
                    value={itemName}
                    onChange={(e) => setItemName(e.target.value)}
                    placeholder="e.g. Ficcado Classic Hoodie"
                    autoFocus
                  />
                </div>

                <div className="grid-form-2">
                  <div className="form-group">
                    <label className="form-label">Item Type</label>
                    <select
                      className="form-select"
                      value={itemType}
                      onChange={(e) => setItemType(e.target.value)}
                    >
                      <option value="T-Shirt">T-Shirt</option>
                      <option value="Shirt">Shirt</option>
                      <option value="Hoodie">Hoodie</option>
                      <option value="Sweatshirt">Sweatshirt</option>
                      <option value="Jacket">Jacket</option>
                      <option value="Pants">Pants</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Price (₹)</label>
                    <input
                      type="number"
                      className="form-input"
                      value={price}
                      onChange={(e) => setPrice(e.target.value)}
                      placeholder="1499"
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Available Sizes</label>
                  <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                    {['XS', 'S', 'M', 'L', 'XL'].map((s) => (
                      <button
                        key={s}
                        type="button"
                        className={`btn btn-sm ${selectedSizes.includes(s) ? 'btn-primary' : 'btn-ghost'}`}
                        onClick={() => toggleSize(s)}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Initial Status</label>
                  <select
                    className="form-select"
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                  >
                    <option value="In Stock">In Stock</option>
                    <option value="Out of Stock">Out of Stock</option>
                  </select>
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? <LoadingGecko size="inline" label="Saving…" /> : 'Save Item'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
