'use client';

/**
 * app/(app)/dashboard/return-refund/page.tsx
 * Return & Refund Management — Part 2 Implementation.
 *
 * Supports item disposition (Returned to Inventory + Restock Destination vs Sent to Damaged Products),
 * order history display, and automatic Sales record unlocking on refund completion.
 */

import React, { useEffect, useState } from 'react';
import LoadingGecko from '@/components/LoadingGecko';
import ErrorMessage, { parseApiError } from '@/components/ErrorMessage';

const VERIFICATION_STATUSES = ['No Damage', 'Damage Found on Returned Item(s)'];
const REFUND_MODES          = ['Cash', 'UPI', 'Card', 'Bank Transfer'];

interface ReturnRecord {
  rowIndex:           number;
  invoiceNumber:      string;
  verificationStatus: string;
  refundStatus:       string;
  refundAmount:       string;
  refundCompletedAt:  string;
  transactionId:      string;
  modeOfRefund:       string;
  disposition:        string;
  restockDestination: string;
  createdAt:          string;
  createdBy:          string;
  version:            string;
}

interface SaleDetails {
  invoiceNumber: string;
  customerName:  string;
  itemNames:     string;
  sizes:         string;
  totalItems:    string;
}

export default function ReturnRefundPage() {
  const [records, setRecords]   = useState<ReturnRecord[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<{ message: string } | null>(null);
  const [success, setSuccess]   = useState<string | null>(null);
  const [search, setSearch]     = useState('');

  // Edit Modal State
  const [activeItem, setActiveItem]         = useState<ReturnRecord | null>(null);
  const [saleDetails, setSaleDetails]       = useState<SaleDetails | null>(null);
  const [admins, setAdmins]                 = useState<string[]>([]);
  const [modalLoading, setModalLoading]     = useState(false);
  const [saving, setSaving]                 = useState(false);
  const [editError, setEditError]           = useState<string | null>(null);

  // Form Fields
  const [editVerification, setEditVerification]   = useState('No Damage');
  const [editRefundStatus, setEditRefundStatus]   = useState('Pending');
  const [editRefundAmount, setEditRefundAmount]   = useState('');
  const [editMode, setEditMode]                   = useState('Cash');
  const [editTxId, setEditTxId]                   = useState('');
  const [disposition, setDisposition]             = useState<'Returned to Inventory' | 'Sent to Damaged Products'>('Returned to Inventory');
  const [restockDestination, setRestockDestination] = useState('Inventory Only');
  const [deleting, setDeleting]                   = useState<string | null>(null);

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

  async function openEditModal(r: ReturnRecord) {
    setActiveItem(r);
    setModalLoading(true);
    setEditError(null);

    setEditVerification(r.verificationStatus || 'No Damage');
    setEditRefundStatus(r.refundStatus || 'Pending');
    setEditRefundAmount(r.refundAmount || '');
    setEditMode(r.modeOfRefund || 'Cash');
    setEditTxId(r.transactionId || '');
    setDisposition((r.disposition as any) || 'Returned to Inventory');
    setRestockDestination(r.restockDestination || 'Inventory Only');

    try {
      const res = await fetch(`/api/return-refund/${encodeURIComponent(r.invoiceNumber)}`);
      const data = await res.json();
      if (data.saleDetails) setSaleDetails(data.saleDetails);
      if (data.admins)      setAdmins(data.admins);
    } catch {
      // non-fatal if saleDetails lookup fails
    } finally {
      setModalLoading(false);
    }
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!activeItem) return;
    setSaving(true); setEditError(null);

    // Build returnedItems array from saleDetails if available
    let returnedItems: { itemName: string; size: string; qty: number }[] | undefined;
    if (saleDetails && saleDetails.itemNames) {
      const itemNamesArr = saleDetails.itemNames.split(',').map((s) => s.trim());
      const sizesArr = saleDetails.sizes.split(',').map((s) => s.trim());
      returnedItems = itemNamesArr.map((it, idx) => ({
        itemName: it,
        size: sizesArr[idx] || 'M',
        qty: 1,
      }));
    }

    try {
      const res  = await fetch(`/api/return-refund/${encodeURIComponent(activeItem.invoiceNumber)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          version:            activeItem.version,
          verificationStatus: editVerification,
          refundStatus:       editRefundStatus,
          refundAmount:       parseFloat(editRefundAmount || '0'),
          modeOfRefund:       editMode,
          transactionId:      editTxId,
          disposition,
          restockDestination: disposition === 'Returned to Inventory' ? restockDestination : undefined,
          returnedItems,
          refundCompletedAt:  editRefundStatus === 'Completed' || editRefundStatus === 'Refund Completed' ? new Date().toISOString() : undefined,
        }),
      });

      const data = await res.json();
      if (res.status === 409) { setEditError(data.error || 'Conflict — reload and try again.'); return; }
      if (!res.ok) { setEditError(data.error || 'Failed to update.'); return; }

      setActiveItem(null);
      setSuccess(data.message || `Return/Refund for ${activeItem.invoiceNumber} updated.`);
      loadRecords();
    } catch { setEditError("Couldn't save changes."); }
    finally { setSaving(false); }
  }

  async function handleDelete(r: ReturnRecord) {
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
      </div>

      {error   && <ErrorMessage message={error.message}   variant="error"   onDismiss={() => setError(null)} />}
      {success && <ErrorMessage message={success}          variant="success" onDismiss={() => setSuccess(null)} />}

      {/* Search */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        <div className="search-bar" style={{ flex: 1, maxWidth: 360 }}>
          <span style={{ color: 'var(--color-ink-muted)' }}>⌕</span>
          <input type="text" className="form-input" placeholder="Search by invoice number…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <button className="btn btn-ghost btn-sm" onClick={loadRecords}>↻ Refresh</button>
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state">
          <div style={{ fontSize: 28 }}>↩</div>
          <div className="empty-state-title">No return/refund records</div>
          <div style={{ fontSize: 13, color: 'var(--color-ink-muted)' }}>
            Sales marked as &quot;Refund Requested&quot; will automatically appear here for disposition & processing.
          </div>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Invoice #</th>
                  <th>Verification</th>
                  <th>Refund Status</th>
                  <th>Amount</th>
                  <th>Disposition</th>
                  <th>Restock Dest.</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, i) => {
                  const isDone = r.refundStatus === 'Completed' || r.refundStatus === 'Refund Completed';
                  return (
                    <tr key={i}>
                      <td style={{ fontWeight: 700, color: 'var(--color-brand-primary)', fontFamily: 'var(--font-display)' }}>
                        {r.invoiceNumber}
                      </td>
                      <td>
                        <span className={`badge ${r.verificationStatus === 'No Damage' ? 'badge-success' : 'badge-error'}`}>
                          {r.verificationStatus}
                        </span>
                      </td>
                      <td>
                        <span className={`badge ${isDone ? 'badge-success' : 'badge-warning'}`}>
                          {r.refundStatus}
                        </span>
                      </td>
                      <td style={{ fontWeight: 600 }} className="tabular-nums">₹{r.refundAmount}</td>
                      <td>{r.disposition ? <span className="badge badge-info">{r.disposition}</span> : '—'}</td>
                      <td>{r.restockDestination ? <span className="badge badge-neutral">{r.restockDestination}</span> : '—'}</td>
                      <td>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button className="btn btn-secondary btn-sm" onClick={() => openEditModal(r)}>
                            Manage / Disposition
                          </button>
                          <button className="btn btn-danger btn-sm" onClick={() => handleDelete(r)} disabled={deleting === r.invoiceNumber}>
                            {deleting === r.invoiceNumber ? '…' : 'Delete'}
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

      {/* Edit Modal */}
      {activeItem && (
        <div className="modal-backdrop" onClick={() => setActiveItem(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520 }}>
            <div className="modal-header">
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 18 }}>
                Process Refund: {activeItem.invoiceNumber}
              </h2>
              <button className="btn-icon" onClick={() => setActiveItem(null)}>×</button>
            </div>
            {modalLoading ? (
              <div style={{ padding: 30 }}><LoadingGecko size="full" label="Loading details…" /></div>
            ) : (
              <form onSubmit={handleEdit}>
                <div className="modal-body">
                  {editError && <ErrorMessage message={editError} variant="error" />}

                  {saleDetails && (
                    <div style={{ background: 'rgba(43,98,198,0.07)', borderRadius: 8, padding: '10px 12px', marginBottom: 12, fontSize: 13 }}>
                      <div style={{ fontWeight: 700 }}>Customer: {saleDetails.customerName}</div>
                      <div>Item(s): {saleDetails.itemNames} ({saleDetails.sizes})</div>
                    </div>
                  )}

                  <div className="form-group">
                    <label className="form-label">Item Verification *</label>
                    <select className="form-select" value={editVerification} onChange={(e) => setEditVerification(e.target.value)}>
                      {VERIFICATION_STATUSES.map((s) => <option key={s}>{s}</option>)}
                    </select>
                  </div>

                  <div className="grid-form-2">
                    <div className="form-group">
                      <label className="form-label">Refund Status *</label>
                      <select className="form-select" value={editRefundStatus} onChange={(e) => setEditRefundStatus(e.target.value)}>
                        <option value="Pending">Pending</option>
                        <option value="Approved">Approved</option>
                        <option value="Completed">Completed (Unlocks Sale)</option>
                      </select>
                    </div>

                    <div className="form-group">
                      <label className="form-label">Refund Amount (₹) *</label>
                      <input type="number" className="form-input" value={editRefundAmount} onChange={(e) => setEditRefundAmount(e.target.value)} min="0" step="0.01" />
                    </div>
                  </div>

                  {/* Mandatory Disposition Selector */}
                  <div className="form-group" style={{ background: 'rgba(255,152,0,0.08)', padding: 12, borderRadius: 8 }}>
                    <label className="form-label" style={{ fontWeight: 700, color: '#e65100' }}>
                      Item Disposition Path *
                    </label>
                    <div style={{ display: 'flex', gap: 16, marginTop: 6 }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13 }}>
                        <input
                          type="radio"
                          name="disposition"
                          value="Returned to Inventory"
                          checked={disposition === 'Returned to Inventory'}
                          onChange={() => setDisposition('Returned to Inventory')}
                        />
                        Return to Inventory
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13 }}>
                        <input
                          type="radio"
                          name="disposition"
                          value="Sent to Damaged Products"
                          checked={disposition === 'Sent to Damaged Products'}
                          onChange={() => setDisposition('Sent to Damaged Products')}
                        />
                        Send to Damaged Products
                      </label>
                    </div>

                    {disposition === 'Returned to Inventory' && (
                      <div className="form-group" style={{ marginTop: 10, margin: 0 }}>
                        <label className="form-label">Restock Destination *</label>
                        <select
                          className="form-select"
                          value={restockDestination}
                          onChange={(e) => setRestockDestination(e.target.value)}
                        >
                          <option value="Inventory Only">Inventory Only (Unassigned Main Stock)</option>
                          {admins.map((adm) => (
                            <option key={adm} value={adm}>Handler: {adm}</option>
                          ))}
                        </select>
                      </div>
                    )}
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
                      <input type="text" className="form-input" value={editTxId} onChange={(e) => setEditTxId(e.target.value)} placeholder="Txn Ref #" />
                    </div>
                  </div>
                </div>

                <div className="modal-footer">
                  <button type="button" className="btn btn-ghost" onClick={() => setActiveItem(null)}>Cancel</button>
                  <button type="submit" className="btn btn-primary" disabled={saving}>
                    {saving ? <LoadingGecko size="inline" label="Saving…" /> : 'Save & Update Refund'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
