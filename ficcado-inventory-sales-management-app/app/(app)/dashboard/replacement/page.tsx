'use client';

/**
 * app/(app)/dashboard/replacement/page.tsx
 * Replacement Management — full CRUD.
 * Creating a replacement pre-fills from the original Sales record by invoice number.
 */

import React, { useEffect, useState } from 'react';
import LoadingGecko from '@/components/LoadingGecko';
import ErrorMessage, { parseApiError } from '@/components/ErrorMessage';

export default function ReplacementPage() {
  const [replacements, setReplacements] = useState<any[]>([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState<{ message: string } | null>(null);
  const [success, setSuccess]           = useState<string | null>(null);
  const [search, setSearch]             = useState('');

  // Create modal
  const [showCreate, setShowCreate]   = useState(false);
  const [creating, setCreating]       = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [lookupInvoice, setLookupInvoice] = useState('');
  const [saleData, setSaleData]       = useState<any>(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [newItems, setNewItems]       = useState('');
  const [newSizes, setNewSizes]       = useState('');
  const [invoiceStatus, setInvoiceStatus] = useState('Replacement Pending');

  // Edit modal
  const [editItem, setEditItem]       = useState<any>(null);
  const [saving, setSaving]           = useState(false);
  const [editError, setEditError]     = useState<string | null>(null);
  const [editNewItems, setEditNewItems] = useState('');
  const [editNewSizes, setEditNewSizes] = useState('');
  const [editStatus, setEditStatus]   = useState('Replacement Pending');
  const [deleting, setDeleting]       = useState<string | null>(null);

  async function loadReplacements() {
    setLoading(true);
    try {
      const res  = await fetch('/api/replacement');
      const data = await res.json();
      if (!res.ok) { setError(parseApiError(data)); return; }
      setReplacements(data.replacements ?? []);
    } catch { setError({ message: "Couldn't load replacements." }); }
    finally { setLoading(false); }
  }

  useEffect(() => { loadReplacements(); }, []);

  async function lookupSale() {
    if (!lookupInvoice.trim()) { setCreateError('Enter an invoice number to look up.'); return; }
    setLookupLoading(true); setCreateError(null); setSaleData(null);
    try {
      const res  = await fetch(`/api/invoice/${encodeURIComponent(lookupInvoice.trim())}`);
      const data = await res.json();
      if (!res.ok) { setCreateError(data.error || `Invoice '${lookupInvoice}' not found.`); return; }
      setSaleData(data.sale);
      // Pre-fill new items with same as last items
      setNewItems(data.sale.itemNames || '');
      setNewSizes(data.sale.sizesChosen || '');
    } catch { setCreateError("Couldn't look up invoice."); }
    finally { setLookupLoading(false); }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreateError(null);
    if (!saleData) { setCreateError('Look up an invoice number first.'); return; }
    if (!newItems.trim()) { setCreateError('New item(s) are required.'); return; }

    setCreating(true);
    try {
      const res  = await fetch('/api/replacement', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoiceNumber:        saleData.invoiceNumber,
          totalNumberOfItems:   parseInt(saleData.totalItems || '1', 10),
          lastPurchasedItems:   (saleData.itemNames || '').split(',').map((s: string) => s.trim()).filter(Boolean),
          lastPurchasedItemsSizes: (saleData.sizesChosen || '').split(',').map((s: string) => s.trim()).filter(Boolean),
          newItems:             newItems.split(',').map((s) => s.trim()).filter(Boolean),
          newItemsSizes:        newSizes.split(',').map((s) => s.trim()).filter(Boolean),
          invoiceStatus,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setCreateError(data.error || 'Failed to create replacement'); return; }
      setShowCreate(false); setLookupInvoice(''); setSaleData(null); setNewItems(''); setNewSizes('');
      setSuccess(`Replacement for ${saleData.invoiceNumber} created.`);
      loadReplacements();
    } catch { setCreateError("Couldn't create replacement."); }
    finally { setCreating(false); }
  }

  function openEdit(r: any) {
    setEditItem(r);
    setEditNewItems(r.newItems || '');
    setEditNewSizes(r.newSizes || '');
    setEditStatus(r.invoiceStatus || 'Replacement Pending');
    setEditError(null);
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editItem) return;
    setSaving(true); setEditError(null);
    try {
      const res  = await fetch(`/api/replacement/${encodeURIComponent(editItem.invoiceNumber)}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version: editItem.version, newItems: editNewItems, newSizes: editNewSizes, invoiceStatus: editStatus }),
      });
      const data = await res.json();
      if (res.status === 409) { setEditError(data.error || 'Conflict — reload and try again.'); return; }
      if (!res.ok) { setEditError(data.error || 'Failed to update.'); return; }
      setEditItem(null);
      setSuccess(`Replacement for ${editItem.invoiceNumber} updated.`);
      loadReplacements();
    } catch { setEditError("Couldn't save changes."); }
    finally { setSaving(false); }
  }

  async function handleDelete(r: any) {
    if (!confirm(`Delete replacement for '${r.invoiceNumber}'?`)) return;
    setDeleting(r.invoiceNumber);
    try {
      const res  = await fetch(`/api/replacement/${encodeURIComponent(r.invoiceNumber)}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) { setError(parseApiError(data)); return; }
      setSuccess(`Replacement for ${r.invoiceNumber} deleted.`);
      loadReplacements();
    } catch { setError({ message: "Couldn't delete replacement." }); }
    finally { setDeleting(null); }
  }

  const filtered = replacements.filter((r) =>
    !search || r.invoiceNumber?.toLowerCase().includes(search.toLowerCase()) || r.lastItems?.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) return <LoadingGecko size="full" label="Loading replacements…" />;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Replacement Management</h1>
          <div className="page-subtitle">Process item exchanges — {replacements.length} record{replacements.length !== 1 ? 's' : ''}</div>
        </div>
        <button className="btn btn-primary" onClick={() => setShowCreate(true)}>+ New Replacement</button>
      </div>

      {error   && <ErrorMessage message={error.message}   variant="error"   onDismiss={() => setError(null)} />}
      {success && <ErrorMessage message={success}          variant="success" onDismiss={() => setSuccess(null)} />}

      {/* Search */}
      <div className="card" style={{ padding: '10px 14px', marginBottom: 16 }}>
        <input type="text" className="form-input" placeholder="Search by invoice number or item name…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state">
          <div style={{ fontSize: 28 }}>⟳</div>
          <div className="empty-state-title">No replacements found</div>
          <div style={{ fontSize: 13, color: 'var(--color-ink-muted)' }}>Exchanges and replacements will appear here.</div>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Last Item(s)</th>
                  <th>New Item(s)</th>
                  <th>Status</th>
                  <th>Created By</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, i) => (
                  <tr key={i}>
                    <td style={{ fontWeight: 700, color: 'var(--color-brand-primary)' }}>{r.invoiceNumber}</td>
                    <td>{r.lastItems} <span style={{ color: 'var(--color-ink-muted)', fontSize: 12 }}>({r.lastSizes})</span></td>
                    <td>{r.newItems} <span style={{ color: 'var(--color-ink-muted)', fontSize: 12 }}>({r.newSizes})</span></td>
                    <td>
                      <span className={`badge ${r.invoiceStatus?.includes('Completed') ? 'badge-success' : 'badge-warning'}`}>
                        {r.invoiceStatus}
                      </span>
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--color-ink-muted)' }}>{r.createdBy} · {r.createdAt ? new Date(r.createdAt).toLocaleDateString('en-IN') : '—'}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="btn btn-secondary btn-sm" onClick={() => openEdit(r)}>Edit</button>
                        <button className="btn btn-danger btn-sm" onClick={() => handleDelete(r)} disabled={deleting === r.invoiceNumber}>
                          {deleting === r.invoiceNumber ? '…' : 'Delete'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create Modal */}
      {showCreate && (
        <div className="modal-backdrop" onClick={() => setShowCreate(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520 }}>
            <div className="modal-header">
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 18 }}>New Replacement</h2>
              <button className="btn-icon" onClick={() => setShowCreate(false)}>×</button>
            </div>
            <form onSubmit={handleCreate}>
              <div className="modal-body">
                {createError && <ErrorMessage message={createError} variant="error" />}

                {/* Invoice lookup */}
                <div className="form-group">
                  <label className="form-label">Invoice Number *</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input type="text" className="form-input" value={lookupInvoice}
                      onChange={(e) => setLookupInvoice(e.target.value)} placeholder="e.g. FIC-215" style={{ flex: 1 }} />
                    <button type="button" className="btn btn-secondary btn-sm" onClick={lookupSale} disabled={lookupLoading}>
                      {lookupLoading ? '…' : '🔍 Look Up'}
                    </button>
                  </div>
                </div>

                {saleData && (
                  <div style={{ background: 'rgba(43,98,198,0.07)', borderRadius: 8, padding: '10px 12px', marginBottom: 12, fontSize: 13 }}>
                    <div style={{ fontWeight: 700, marginBottom: 4 }}>Sale found: {saleData.invoiceNumber}</div>
                    <div>Customer: {saleData.customerName}</div>
                    <div>Item(s): {saleData.itemNames} — Size(s): {saleData.sizesChosen}</div>
                  </div>
                )}

                <div className="form-group">
                  <label className="form-label">New Item(s) *</label>
                  <input type="text" className="form-input" value={newItems} onChange={(e) => setNewItems(e.target.value)}
                    placeholder="e.g. Camera Blue, Eternity Black" />
                </div>
                <div className="form-group">
                  <label className="form-label">New Item Size(s)</label>
                  <input type="text" className="form-input" value={newSizes} onChange={(e) => setNewSizes(e.target.value)}
                    placeholder="e.g. M, L" />
                </div>
                <div className="form-group">
                  <label className="form-label">Invoice Status</label>
                  <select className="form-select" value={invoiceStatus} onChange={(e) => setInvoiceStatus(e.target.value)}>
                    <option>Replacement Pending</option>
                    <option>Replacement Completed & Purchase Satisfied</option>
                  </select>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setShowCreate(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={creating || !saleData}>
                  {creating ? <LoadingGecko size="inline" label="Creating…" /> : 'Create Replacement'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editItem && (
        <div className="modal-backdrop" onClick={() => setEditItem(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480 }}>
            <div className="modal-header">
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 18 }}>Edit Replacement: {editItem.invoiceNumber}</h2>
              <button className="btn-icon" onClick={() => setEditItem(null)}>×</button>
            </div>
            <form onSubmit={handleEdit}>
              <div className="modal-body">
                {editError && <ErrorMessage message={editError} variant="error" />}
                <div className="form-group">
                  <label className="form-label">New Item(s)</label>
                  <input type="text" className="form-input" value={editNewItems} onChange={(e) => setEditNewItems(e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">New Item Size(s)</label>
                  <input type="text" className="form-input" value={editNewSizes} onChange={(e) => setEditNewSizes(e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Invoice Status</label>
                  <select className="form-select" value={editStatus} onChange={(e) => setEditStatus(e.target.value)}>
                    <option>Replacement Pending</option>
                    <option>Replacement Completed & Purchase Satisfied</option>
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
