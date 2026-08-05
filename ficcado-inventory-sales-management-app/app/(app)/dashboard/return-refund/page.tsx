'use client';

/**
 * app/(app)/dashboard/return-refund/page.tsx
 * Return & Refund Management — full CRUD.
 * Pre-fills customer and order details from original Sales/Replacement records.
 */

import React, { useEffect, useState } from 'react';
import LoadingGecko from '@/components/LoadingGecko';
import ErrorMessage, { parseApiError } from '@/components/ErrorMessage';

const VERIFICATION_STATUSES = ['No Damage', 'Damage Found on Returned Item(s)'];
const REFUND_MODES          = ['Cash', 'UPI', 'Card', 'Bank Transfer'];

export default function ReturnRefundPage() {
  const [records, setRecords]   = useState<any[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<{ message: string } | null>(null);
  const [success, setSuccess]   = useState<string | null>(null);
  const [search, setSearch]     = useState('');

  // Create modal
  const [showCreate, setShowCreate]   = useState(false);
  const [creating, setCreating]       = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [lookupInvoice, setLookupInvoice] = useState('');
  const [saleData, setSaleData]       = useState<any>(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [verificationStatus, setVerificationStatus] = useState('No Damage');
  const [refundStatus, setRefundStatus] = useState('Pending');
  const [refundAmount, setRefundAmount] = useState('');
  const [modeOfRefund, setModeOfRefund] = useState('Cash');
  const [transactionId, setTransactionId] = useState('');

  // Edit modal
  const [editItem, setEditItem]     = useState<any>(null);
  const [saving, setSaving]         = useState(false);
  const [editError, setEditError]   = useState<string | null>(null);
  const [editVerification, setEditVerification] = useState('No Damage');
  const [editRefundStatus, setEditRefundStatus] = useState('Pending');
  const [editRefundAmount, setEditRefundAmount] = useState('');
  const [editMode, setEditMode]     = useState('Cash');
  const [editTxId, setEditTxId]     = useState('');
  const [deleting, setDeleting]     = useState<string | null>(null);

  async function loadRecords() {
    setLoading(true);
    try {
      const res  = await fetch('/api/return-refund');
      const data = await res.json();
      if (!res.ok) { setError(parseApiError(data)); return; }
      setRecords(data.records ?? []);
    } catch { setError({ message: "Couldn't load return/refund records." }); }
    finally { setLoading(false); }
  }

  useEffect(() => { loadRecords(); }, []);

  async function lookupSale() {
    if (!lookupInvoice.trim()) { setCreateError('Enter an invoice number to look up.'); return; }
    setLookupLoading(true); setCreateError(null); setSaleData(null);
    try {
      const res  = await fetch(`/api/invoice/${encodeURIComponent(lookupInvoice.trim())}`);
      const data = await res.json();
      if (!res.ok) { setCreateError(data.error || `Invoice '${lookupInvoice}' not found.`); return; }
      setSaleData(data.sale);
      // Pre-fill refund amount with total sale amount
      setRefundAmount(data.sale.totalAmount || '');
    } catch { setCreateError("Couldn't look up invoice."); }
    finally { setLookupLoading(false); }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreateError(null);
    if (!saleData) { setCreateError('Look up an invoice number first.'); return; }
    if (!refundAmount || parseFloat(refundAmount) < 0) { setCreateError('Enter a valid refund amount.'); return; }

    setCreating(true);
    try {
      const res  = await fetch('/api/return-refund', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoiceNumber: saleData.invoiceNumber,
          itemVerificationStatus: verificationStatus,
          refundStatus, refundAmount: parseFloat(refundAmount),
          transactionId, modeOfRefund,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setCreateError(data.error || 'Failed to create return/refund record.'); return; }
      setShowCreate(false); setLookupInvoice(''); setSaleData(null); setRefundAmount(''); setTransactionId('');
      setSuccess(`Return/Refund for ${saleData.invoiceNumber} created.`);
      loadRecords();
    } catch { setCreateError("Couldn't create return/refund."); }
    finally { setCreating(false); }
  }

  function openEdit(r: any) {
    setEditItem(r);
    setEditVerification(r.verificationStatus || 'No Damage');
    setEditRefundStatus(r.refundStatus || 'Pending');
    setEditRefundAmount(r.refundAmount || '');
    setEditMode(r.modeOfRefund || 'Cash');
    setEditTxId(r.transactionId || '');
    setEditError(null);
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editItem) return;
    setSaving(true); setEditError(null);
    try {
      const res  = await fetch(`/api/return-refund/${encodeURIComponent(editItem.invoiceNumber)}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          version: editItem.version,
          verificationStatus: editVerification,
          refundStatus: editRefundStatus,
          refundAmount: parseFloat(editRefundAmount || '0'),
          modeOfRefund: editMode,
          transactionId: editTxId,
          refundCompletedAt: editRefundStatus === 'Completed' ? new Date().toISOString() : undefined,
        }),
      });
      const data = await res.json();
      if (res.status === 409) { setEditError(data.error || 'Conflict — reload and try again.'); return; }
      if (!res.ok) { setEditError(data.error || 'Failed to update.'); return; }
      setEditItem(null);
      setSuccess(`Return/Refund for ${editItem.invoiceNumber} updated.`);
      loadRecords();
    } catch { setEditError("Couldn't save changes."); }
    finally { setSaving(false); }
  }

  async function handleDelete(r: any) {
    if (!confirm(`Delete return/refund record for '${r.invoiceNumber}'?`)) return;
    setDeleting(r.invoiceNumber);
    try {
      const res  = await fetch(`/api/return-refund/${encodeURIComponent(r.invoiceNumber)}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) { setError(parseApiError(data)); return; }
      setSuccess(`Return/Refund for ${r.invoiceNumber} deleted.`);
      loadRecords();
    } catch { setError({ message: "Couldn't delete record." }); }
    finally { setDeleting(null); }
  }

  const filtered = records.filter((r) =>
    !search || r.invoiceNumber?.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) return <LoadingGecko size="full" label="Loading return/refund records…" />;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Returns & Refunds</h1>
          <div className="page-subtitle">Manage return processing and refund tracking — {records.length} record{records.length !== 1 ? 's' : ''}</div>
        </div>
        <button className="btn btn-primary" onClick={() => setShowCreate(true)}>+ New Return/Refund</button>
      </div>

      {error   && <ErrorMessage message={error.message}   variant="error"   onDismiss={() => setError(null)} />}
      {success && <ErrorMessage message={success}          variant="success" onDismiss={() => setSuccess(null)} />}

      {/* Search */}
      <div className="card" style={{ padding: '10px 14px', marginBottom: 16 }}>
        <input type="text" className="form-input" placeholder="Search by invoice number…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state">
          <div style={{ fontSize: 28 }}>↩</div>
          <div className="empty-state-title">No return/refund records</div>
          <div style={{ fontSize: 13, color: 'var(--color-ink-muted)' }}>Returned and refunded orders will appear here.</div>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Verification</th>
                  <th>Refund Status</th>
                  <th>Amount</th>
                  <th>Mode</th>
                  <th>Created By</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, i) => (
                  <tr key={i}>
                    <td style={{ fontWeight: 700, color: 'var(--color-brand-primary)' }}>{r.invoiceNumber}</td>
                    <td>
                      <span className={`badge ${r.verificationStatus === 'No Damage' ? 'badge-success' : 'badge-error'}`}>
                        {r.verificationStatus}
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${r.refundStatus === 'Completed' ? 'badge-success' : 'badge-warning'}`}>
                        {r.refundStatus}
                      </span>
                    </td>
                    <td style={{ fontWeight: 600, fontFamily: 'monospace' }}>₹{r.refundAmount}</td>
                    <td>{r.modeOfRefund || '—'}</td>
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
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 18 }}>New Return / Refund</h2>
              <button className="btn-icon" onClick={() => setShowCreate(false)}>×</button>
            </div>
            <form onSubmit={handleCreate}>
              <div className="modal-body">
                {createError && <ErrorMessage message={createError} variant="error" />}
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
                    <div>Customer: {saleData.customerName} · {saleData.customerPhone}</div>
                    <div>Item(s): {saleData.itemNames} — Total: ₹{saleData.totalAmount}</div>
                  </div>
                )}
                <div className="form-group">
                  <label className="form-label">Item Verification</label>
                  <select className="form-select" value={verificationStatus} onChange={(e) => setVerificationStatus(e.target.value)}>
                    {VERIFICATION_STATUSES.map((s) => <option key={s}>{s}</option>)}
                  </select>
                </div>
                <div className="grid-form-2">
                  <div className="form-group">
                    <label className="form-label">Refund Status</label>
                    <input type="text" className="form-input" value={refundStatus} onChange={(e) => setRefundStatus(e.target.value)} placeholder="e.g. Pending, Completed" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Refund Amount (₹)</label>
                    <input type="number" className="form-input" value={refundAmount} onChange={(e) => setRefundAmount(e.target.value)} min="0" step="0.01" />
                  </div>
                </div>
                <div className="grid-form-2">
                  <div className="form-group">
                    <label className="form-label">Mode of Refund</label>
                    <select className="form-select" value={modeOfRefund} onChange={(e) => setModeOfRefund(e.target.value)}>
                      {REFUND_MODES.map((m) => <option key={m}>{m}</option>)}
                    </select>
                  </div>
                  {modeOfRefund !== 'Cash' && (
                    <div className="form-group">
                      <label className="form-label">Transaction ID</label>
                      <input type="text" className="form-input" value={transactionId} onChange={(e) => setTransactionId(e.target.value)} placeholder="Required for UPI/Card/Transfer" />
                    </div>
                  )}
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setShowCreate(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={creating || !saleData}>
                  {creating ? <LoadingGecko size="inline" label="Creating…" /> : 'Create Record'}
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
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 18 }}>Edit: {editItem.invoiceNumber}</h2>
              <button className="btn-icon" onClick={() => setEditItem(null)}>×</button>
            </div>
            <form onSubmit={handleEdit}>
              <div className="modal-body">
                {editError && <ErrorMessage message={editError} variant="error" />}
                <div className="form-group">
                  <label className="form-label">Item Verification</label>
                  <select className="form-select" value={editVerification} onChange={(e) => setEditVerification(e.target.value)}>
                    {VERIFICATION_STATUSES.map((s) => <option key={s}>{s}</option>)}
                  </select>
                </div>
                <div className="grid-form-2">
                  <div className="form-group">
                    <label className="form-label">Refund Status</label>
                    <input type="text" className="form-input" value={editRefundStatus} onChange={(e) => setEditRefundStatus(e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Refund Amount (₹)</label>
                    <input type="number" className="form-input" value={editRefundAmount} onChange={(e) => setEditRefundAmount(e.target.value)} min="0" step="0.01" />
                  </div>
                </div>
                <div className="grid-form-2">
                  <div className="form-group">
                    <label className="form-label">Mode of Refund</label>
                    <select className="form-select" value={editMode} onChange={(e) => setEditMode(e.target.value)}>
                      {REFUND_MODES.map((m) => <option key={m}>{m}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Transaction ID</label>
                    <input type="text" className="form-input" value={editTxId} onChange={(e) => setEditTxId(e.target.value)} />
                  </div>
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
