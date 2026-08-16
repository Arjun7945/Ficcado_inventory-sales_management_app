'use client';

/**
 * app/(app)/dashboard/items/page.tsx
 * Items Management — full CRUD for item catalog, selling price & cost price.
 * Supports Create, Read, Update, Delete with modals. Includes Cost Price (B7).
 */

import React, { useEffect, useState } from 'react';
import LoadingGecko from '@/components/LoadingGecko';
import ErrorMessage, { parseApiError } from '@/components/ErrorMessage';

interface Item {
  rowIndex:  number;
  sno:       string;
  itemName:  string;
  itemType:  string;
  price:     string;
  costPrice: string;
  sizes:     string;
  status:    string;
  updatedAt: string;
}

const SIZES    = ['XS', 'S', 'M', 'L', 'XL'];
const STATUSES = ['In Stock', 'Out of Stock'];
const TYPES    = ['Shirt', 'T-Shirt', 'Pants', 'Trousers', 'Jeans', 'Shorts', 'Jacket', 'Dress', 'Skirt', 'Other'];

export default function ItemsPage() {
  const [items, setItems]     = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<{ message: string } | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [search, setSearch]   = useState('');

  // Create modal
  const [showCreate, setShowCreate]     = useState(false);
  const [creating, setCreating]         = useState(false);
  const [createError, setCreateError]   = useState<string | null>(null);
  const [newName, setNewName]           = useState('');
  const [newType, setNewType]           = useState('T-Shirt');
  const [newPrice, setNewPrice]         = useState('');
  const [newCostPrice, setNewCostPrice] = useState('0');
  const [newSizes, setNewSizes]         = useState<string[]>(['S', 'M', 'L', 'XL']);
  const [newStatus, setNewStatus]       = useState('In Stock');

  // Edit modal
  const [editItem, setEditItem]           = useState<Item | null>(null);
  const [saving, setSaving]               = useState(false);
  const [editError, setEditError]         = useState<string | null>(null);
  const [editName, setEditName]           = useState('');
  const [editType, setEditType]           = useState('');
  const [editPrice, setEditPrice]         = useState('');
  const [editCostPrice, setEditCostPrice] = useState('0');
  const [editSizes, setEditSizes]         = useState<string[]>([]);
  const [editStatus, setEditStatus]       = useState('In Stock');
  const [deleting, setDeleting]           = useState<string | null>(null);

  async function loadItems() {
    setLoading(true);
    try {
      const res  = await fetch('/api/items');
      const data = await res.json();
      if (!res.ok) { setError(parseApiError(data)); return; }
      setItems(data.items ?? []);
    } catch { setError({ message: "Couldn't load items. Check your connection." }); }
    finally { setLoading(false); }
  }

  useEffect(() => { loadItems(); }, []);

  function toggleSize(s: string, list: string[], setter: (v: string[]) => void) {
    setter(list.includes(s) ? list.filter((x) => x !== s) : [...list, s]);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreateError(null);
    if (!newName.trim()) { setCreateError('Item name is required'); return; }
    if (!newPrice || parseFloat(newPrice) <= 0) { setCreateError('Selling price must be greater than 0'); return; }
    if (newSizes.length === 0) { setCreateError('Select at least one size'); return; }

    setCreating(true);
    try {
      const res  = await fetch('/api/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemName: newName,
          itemType: newType,
          priceOfItem: parseFloat(newPrice),
          costPrice: parseFloat(newCostPrice || '0'),
          availableSizes: newSizes,
          currentStatus: newStatus,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setCreateError(data.error || 'Failed to create item'); return; }
      setShowCreate(false);
      setNewName(''); setNewPrice(''); setNewCostPrice('0'); setNewSizes(['S', 'M', 'L', 'XL']);
      setSuccess(`Item '${newName}' created.`);
      loadItems();
    } catch { setCreateError("Couldn't connect to server."); }
    finally { setCreating(false); }
  }

  function openEdit(item: Item) {
    setEditItem(item);
    setEditName(item.itemName);
    setEditType(item.itemType || 'T-Shirt');
    setEditPrice(item.price);
    setEditCostPrice(item.costPrice || '0');
    setEditSizes(item.sizes ? item.sizes.split(/,\s*/) : []);
    setEditStatus(item.status || 'In Stock');
    setEditError(null);
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editItem) return;
    setEditError(null);
    if (!editName.trim()) { setEditError('Item name is required'); return; }
    if (!editPrice || parseFloat(editPrice) <= 0) { setEditError('Selling price must be greater than 0'); return; }
    if (editSizes.length === 0) { setEditError('Select at least one size'); return; }

    setSaving(true);
    try {
      const res  = await fetch(`/api/items/${encodeURIComponent(editItem.sno)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemName: editName,
          itemType: editType,
          priceOfItem: parseFloat(editPrice),
          costPrice: parseFloat(editCostPrice || '0'),
          availableSizes: editSizes,
          currentStatus: editStatus,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setEditError(data.error || 'Failed to update item'); return; }
      setEditItem(null);
      setSuccess(`Item '${editName}' updated.`);
      loadItems();
    } catch { setEditError("Couldn't save changes."); }
    finally { setSaving(false); }
  }

  async function handleDelete(item: Item) {
    if (!confirm(`Delete item '${item.itemName}'? This cannot be undone.`)) return;
    setDeleting(item.sno);
    try {
      const res  = await fetch(`/api/items/${encodeURIComponent(item.sno)}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) { setError(parseApiError(data)); return; }
      setSuccess(`Item '${item.itemName}' deleted.`);
      loadItems();
    } catch { setError({ message: "Couldn't delete item." }); }
    finally { setDeleting(null); }
  }

  const filtered = items.filter((it) =>
    !search || it.itemName.toLowerCase().includes(search.toLowerCase()) || it.itemType?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Items Management</h1>
          <div className="page-subtitle">Manage product catalog, selling price, & cost price — {items.length} item{items.length !== 1 ? 's' : ''}</div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-ghost btn-sm" onClick={loadItems} disabled={loading}>
            ⟳ Refresh
          </button>
          <button className="btn btn-primary" onClick={() => setShowCreate(true)}>+ Add Item</button>
        </div>
      </div>

      {error   && <ErrorMessage message={error.message}   variant="error"   onDismiss={() => setError(null)} />}
      {success && <ErrorMessage message={success}          variant="success" onDismiss={() => setSuccess(null)} />}

      {/* Search */}
      <div className="card" style={{ padding: '10px 14px', marginBottom: 16 }}>
        <input type="text" className="form-input" placeholder="Search by item name or type…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {/* Items table */}
      {loading ? (
        <div className="card" style={{ padding: 48, textAlign: 'center' }}>
          <LoadingGecko label="Loading product catalog…" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <div style={{ fontSize: 32 }}>◈</div>
          <div className="empty-state-title">No items found</div>
          <div style={{ fontSize: 13, color: 'var(--color-ink-muted)' }}>
            {search ? 'Try a different search term.' : 'Add your first item to get started.'}
          </div>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>S.No</th>
                  <th>Item Name</th>
                  <th>Type</th>
                  <th>Selling Price</th>
                  <th>Cost Price</th>
                  <th>Margin</th>
                  <th>Sizes</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => {
                  const p = parseFloat(item.price || '0') || 0;
                  const c = parseFloat(item.costPrice || '0') || 0;
                  const margin = p > 0 ? (p - c) : 0;
                  return (
                    <tr key={item.sno}>
                      <td style={{ color: 'var(--color-ink-muted)', fontSize: 12 }}>{item.sno}</td>
                      <td style={{ fontWeight: 600 }}>{item.itemName}</td>
                      <td>{item.itemType || '—'}</td>
                      <td style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: 'var(--color-brand-primary)' }}>₹{item.price}</td>
                      <td style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--color-ink-muted)' }}>₹{item.costPrice || '0'}</td>
                      <td style={{ fontVariantNumeric: 'tabular-nums', fontSize: 12, color: margin >= 0 ? 'var(--color-success)' : 'var(--color-error)' }}>
                        ₹{margin.toLocaleString('en-IN')}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                          {(item.sizes || '').split(/,\s*/).map((s) => s.trim()).filter(Boolean).map((s) => (
                            <span key={s} className="badge badge-neutral" style={{ fontSize: 11 }}>{s}</span>
                          ))}
                        </div>
                      </td>
                      <td>
                        <span className={`badge ${item.status === 'In Stock' ? 'badge-success' : 'badge-error'}`}>
                          {item.status || '—'}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button className="btn btn-secondary btn-sm" onClick={() => openEdit(item)}>Edit</button>
                          <button className="btn btn-danger btn-sm" onClick={() => handleDelete(item)} disabled={deleting === item.sno}>
                            {deleting === item.sno ? <LoadingGecko size="inline" label="Deleting…" /> : 'Delete'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create Modal */}
      {showCreate && (
        <div className="modal-backdrop" onClick={() => setShowCreate(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 500 }}>
            <div className="modal-header">
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 18 }}>Add New Item</h2>
              <button className="btn-icon" onClick={() => setShowCreate(false)}>×</button>
            </div>
            <form onSubmit={handleCreate}>
              <div className="modal-body">
                {createError && <ErrorMessage message={createError} variant="error" />}
                <div className="form-group">
                  <label className="form-label">Item Name *</label>
                  <input type="text" className="form-input" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Camera Blue" autoFocus />
                </div>
                <div className="form-group">
                  <label className="form-label">Item Type</label>
                  <select className="form-select" value={newType} onChange={(e) => setNewType(e.target.value)}>
                    {TYPES.map((t) => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <div className="grid-form-2">
                  <div className="form-group">
                    <label className="form-label">Selling Price (₹) *</label>
                    <input type="number" className="form-input" value={newPrice} onChange={(e) => setNewPrice(e.target.value)} placeholder="0.00" min="0" step="0.01" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Cost Price (₹)</label>
                    <input type="number" className="form-input" value={newCostPrice} onChange={(e) => setNewCostPrice(e.target.value)} placeholder="0.00" min="0" step="0.01" />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Available Sizes *</label>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {SIZES.map((s) => (
                      <button key={s} type="button" onClick={() => toggleSize(s, newSizes, setNewSizes)}
                        className={`btn btn-sm ${newSizes.includes(s) ? 'btn-primary' : 'btn-ghost'}`}>
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Status</label>
                  <select className="form-select" value={newStatus} onChange={(e) => setNewStatus(e.target.value)}>
                    {STATUSES.map((s) => <option key={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setShowCreate(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={creating}>
                  {creating ? <LoadingGecko size="inline" label="Creating…" /> : 'Create Item'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editItem && (
        <div className="modal-backdrop" onClick={() => setEditItem(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 500 }}>
            <div className="modal-header">
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 18 }}>Edit: {editItem.itemName}</h2>
              <button className="btn-icon" onClick={() => setEditItem(null)}>×</button>
            </div>
            <form onSubmit={handleEdit}>
              <div className="modal-body">
                {editError && <ErrorMessage message={editError} variant="error" />}
                <div className="form-group">
                  <label className="form-label">Item Name *</label>
                  <input type="text" className="form-input" value={editName} onChange={(e) => setEditName(e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Item Type</label>
                  <select className="form-select" value={editType} onChange={(e) => setEditType(e.target.value)}>
                    {TYPES.map((t) => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <div className="grid-form-2">
                  <div className="form-group">
                    <label className="form-label">Selling Price (₹) *</label>
                    <input type="number" className="form-input" value={editPrice} onChange={(e) => setEditPrice(e.target.value)} min="0" step="0.01" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Cost Price (₹)</label>
                    <input type="number" className="form-input" value={editCostPrice} onChange={(e) => setEditCostPrice(e.target.value)} min="0" step="0.01" />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Available Sizes *</label>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {SIZES.map((s) => (
                      <button key={s} type="button" onClick={() => toggleSize(s, editSizes, setEditSizes)}
                        className={`btn btn-sm ${editSizes.includes(s) ? 'btn-primary' : 'btn-ghost'}`}>
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Status</label>
                  <select className="form-select" value={editStatus} onChange={(e) => setEditStatus(e.target.value)}>
                    {STATUSES.map((s) => <option key={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setEditItem(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? <LoadingGecko size="inline" label="Saving…" /> : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
