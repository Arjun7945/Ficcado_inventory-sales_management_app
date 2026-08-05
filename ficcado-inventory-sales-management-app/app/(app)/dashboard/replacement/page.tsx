'use client';

/**
 * app/(app)/dashboard/replacement/page.tsx
 * Replacement Management — Part 2 Implementation.
 *
 * Full multi-step edit flow:
 * 1. Order History context view
 * 2. Old-item tick selection & live Inventory-sourced new item selection
 * 3. Side-by-side Old vs. New confirmation screen
 * 4. Mandatory disposition prompt (Returned to Inventory + Restock Destination vs. Damaged Products)
 * 5. Full status progression (Approved -> Dispatched -> Received -> Satisfied / Completed Order)
 */

import React, { useEffect, useState } from 'react';
import LoadingGecko from '@/components/LoadingGecko';
import ErrorMessage, { parseApiError } from '@/components/ErrorMessage';

interface ReplacementRecord {
  rowIndex:           number;
  invoiceNumber:      string;
  totalItems:         string;
  lastItems:          string;
  lastSizes:          string;
  newItems:           string;
  newSizes:           string;
  invoiceStatus:      string;
  disposition:        string;
  restockDestination: string;
  createdAt:          string;
  createdBy:          string;
  version:            string;
}

interface SaleDetails {
  invoiceNumber:  string;
  customerName:   string;
  totalAmount:    string;
  itemNames:      string;
  sizes:          string;
  saleStatus:     string;
  deliveryStatus: string;
}

interface InventoryStockItem {
  itemName: string;
  size:     string;
  qty:      number;
}

export default function ReplacementPage() {
  const [replacements, setReplacements] = useState<ReplacementRecord[]>([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState<{ message: string } | null>(null);
  const [success, setSuccess]           = useState<string | null>(null);
  const [search, setSearch]             = useState('');

  // Workflow edit modal
  const [activeRecord, setActiveRecord]         = useState<ReplacementRecord | null>(null);
  const [saleDetails, setSaleDetails]           = useState<SaleDetails | null>(null);
  const [availableInventory, setAvailableInventory] = useState<InventoryStockItem[]>([]);
  const [admins, setAdmins]                     = useState<string[]>([]);
  const [modalLoading, setModalLoading]         = useState(false);
  const [modalError, setModalError]             = useState<string | null>(null);

  // Workflow steps: 1 = select items & disposition, 2 = confirm old vs new, 3 = simple status edit
  const [step, setStep]                         = useState<1 | 2 | 3>(1);
  const [selectedOldItems, setSelectedOldItems] = useState<{ itemName: string; size: string; qty: number }[]>([]);
  const [selectedNewItems, setSelectedNewItems] = useState<{ itemName: string; size: string; qty: number }[]>([]);
  const [disposition, setDisposition]           = useState<'Returned to Inventory' | 'Sent to Damaged Products'>('Returned to Inventory');
  const [restockDestination, setRestockDestination] = useState('Inventory Only');
  const [statusVal, setStatusVal]               = useState('Replacement Approved');
  const [saving, setSaving]                     = useState(false);
  const [deleting, setDeleting]                 = useState<string | null>(null);

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

  async function openWorkflowModal(record: ReplacementRecord) {
    setActiveRecord(record);
    setModalLoading(true);
    setModalError(null);
    setStep(1);

    try {
      const res = await fetch(`/api/replacement/${encodeURIComponent(record.invoiceNumber)}`);
      const data = await res.json();
      if (!res.ok) { setError(parseApiError(data)); setActiveRecord(null); return; }

      if (data.replacement) setActiveRecord(data.replacement);
      setSaleDetails(data.saleDetails);
      setAvailableInventory(data.availableInventory || []);
      setAdmins(data.admins || []);
      setStatusVal(data.replacement?.invoiceStatus || record.invoiceStatus || 'Replacement Approved');
      setDisposition((data.replacement?.disposition as any) || (record.disposition as any) || 'Returned to Inventory');
      setRestockDestination(data.replacement?.restockDestination || record.restockDestination || 'Inventory Only');

      // Pre-select old items from saleDetails if present
      if (data.saleDetails && data.saleDetails.itemNames) {
        const itemNamesArr = data.saleDetails.itemNames.split(',').map((s: string) => s.trim());
        const sizesArr = data.saleDetails.sizes.split(',').map((s: string) => s.trim());
        const initialOld = itemNamesArr.map((it: string, idx: number) => ({
          itemName: it,
          size: sizesArr[idx] || 'M',
          qty: 1,
        }));
        setSelectedOldItems(initialOld);
      } else {
        setSelectedOldItems([]);
      }

      // Start with empty new items selection so admin explicitly chooses
      setSelectedNewItems([]);
    } catch {
      setError({ message: "Couldn't load replacement workflow details." });
      setActiveRecord(null);
    } finally {
      setModalLoading(false);
    }
  }

  function toggleOldItem(itemName: string, size: string) {
    const exists = selectedOldItems.some((i) => i.itemName === itemName && i.size === size);
    if (exists) {
      setSelectedOldItems(selectedOldItems.filter((i) => !(i.itemName === itemName && i.size === size)));
    } else {
      setSelectedOldItems([...selectedOldItems, { itemName, size, qty: 1 }]);
    }
  }

  function handleAddNewItemChoice(key: string) {
    const [itemName, size] = key.split(':');
    if (!itemName || !size) return;
    if (!selectedNewItems.some((i) => i.itemName === itemName && i.size === size)) {
      setSelectedNewItems([...selectedNewItems, { itemName, size, qty: 1 }]);
    }
  }

  function removeNewItemChoice(itemName: string, size: string) {
    setSelectedNewItems(selectedNewItems.filter((i) => !(i.itemName === itemName && i.size === size)));
  }

  function goToStep2(e: React.FormEvent) {
    e.preventDefault();
    setModalError(null);
    if (selectedOldItems.length === 0) { setModalError('Select at least one old item to replace.'); return; }
    if (selectedNewItems.length === 0) { setModalError('Select at least one new replacement item.'); return; }
    if (!disposition) { setModalError('Mandatory disposition selection is required.'); return; }
    setStep(2);
  }

  async function handleConfirmReplacement() {
    if (!activeRecord) return;
    setSaving(true);
    setModalError(null);

    try {
      const res = await fetch(`/api/replacement/${encodeURIComponent(activeRecord.invoiceNumber)}`, {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          version:            activeRecord.version,
          oldItemsToReplace:  selectedOldItems,
          newItemsChosen:     selectedNewItems,
          disposition,
          restockDestination: disposition === 'Returned to Inventory' ? restockDestination : undefined,
          invoiceStatus:      'Replacement Approved',
        }),
      });

      const data = await res.json();
      if (!res.ok) { setModalError(data.error || 'Failed to update replacement.'); setStep(1); return; }

      setActiveRecord(null);
      setSuccess(data.message || `Replacement for ${activeRecord.invoiceNumber} approved.`);
      loadReplacements();
    } catch { setModalError("Couldn't save replacement changes."); setStep(1); }
    finally { setSaving(false); }
  }

  async function handleSimpleStatusUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (!activeRecord) return;
    setSaving(true);
    setModalError(null);

    try {
      const res = await fetch(`/api/replacement/${encodeURIComponent(activeRecord.invoiceNumber)}`, {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          version:       activeRecord.version,
          invoiceStatus: statusVal,
        }),
      });

      const data = await res.json();
      if (!res.ok) { setModalError(data.error || 'Failed to update status.'); return; }

      setActiveRecord(null);
      setSuccess(data.message || `Status updated for ${activeRecord.invoiceNumber}.`);
      loadReplacements();
    } catch { setModalError("Couldn't update status."); }
    finally { setSaving(false); }
  }

  async function handleDelete(invoiceNum: string) {
    if (!confirm(`Delete replacement record for '${invoiceNum}'?`)) return;
    setDeleting(invoiceNum);
    try {
      const res  = await fetch(`/api/replacement/${encodeURIComponent(invoiceNum)}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) { setError(parseApiError(data)); return; }
      setSuccess(`Replacement for ${invoiceNum} deleted.`);
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
      </div>

      {error   && <ErrorMessage message={error.message}   variant="error"   onDismiss={() => setError(null)} />}
      {success && <ErrorMessage message={success}          variant="success" onDismiss={() => setSuccess(null)} />}

      {/* Search */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        <div className="search-bar" style={{ flex: 1, maxWidth: 360 }}>
          <span style={{ color: 'var(--color-ink-muted)' }}>⌕</span>
          <input
            type="text"
            placeholder="Search by invoice number or item name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <button className="btn btn-ghost btn-sm" onClick={loadReplacements}>↻ Refresh</button>
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state">
          <div style={{ fontSize: 28 }}>⟳</div>
          <div className="empty-state-title">No replacement records</div>
          <div style={{ fontSize: 13, color: 'var(--color-ink-muted)' }}>
            Sales marked as &quot;Replace Requested&quot; will automatically appear here for configuration.
          </div>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Invoice #</th>
                  <th>Original Items</th>
                  <th>New Items</th>
                  <th>Disposition</th>
                  <th>Restock Dest.</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, i) => {
                  const isDone = r.invoiceStatus === 'Satisfied / Completed Order';
                  return (
                    <tr key={i}>
                      <td style={{ fontWeight: 700, color: 'var(--color-brand-primary)', fontFamily: 'var(--font-display)' }}>
                        {r.invoiceNumber}
                      </td>
                      <td>{r.lastItems} <span style={{ color: 'var(--color-ink-muted)', fontSize: 12 }}>({r.lastSizes})</span></td>
                      <td>{r.newItems || '—'} <span style={{ color: 'var(--color-ink-muted)', fontSize: 12 }}>({r.newSizes})</span></td>
                      <td>{r.disposition ? <span className="badge badge-info">{r.disposition}</span> : '—'}</td>
                      <td>{r.restockDestination ? <span className="badge badge-neutral">{r.restockDestination}</span> : '—'}</td>
                      <td>
                        <span className={`badge ${isDone ? 'badge-success' : 'badge-warning'}`}>
                          {r.invoiceStatus}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button className="btn btn-secondary btn-sm" onClick={() => openWorkflowModal(r)}>
                            Manage / Update
                          </button>
                          <button className="btn btn-danger btn-sm" onClick={() => handleDelete(r.invoiceNumber)} disabled={deleting === r.invoiceNumber}>
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

      {/* Multi-step Workflow Edit Modal */}
      {activeRecord && (
        <div className="modal-backdrop" onClick={() => setActiveRecord(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 680, maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div className="modal-header" style={{ flexShrink: 0 }}>
              <div>
                <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 18 }}>
                  Replacement Order: {activeRecord.invoiceNumber}
                </h2>
                <div style={{ fontSize: 12, color: 'var(--color-ink-muted)' }}>
                  Current Status: <span className="badge badge-warning">{activeRecord.invoiceStatus}</span>
                </div>
              </div>
              <button className="btn-icon" onClick={() => setActiveRecord(null)}>×</button>
            </div>

            {modalLoading ? (
              <div style={{ padding: 40 }}><LoadingGecko size="full" label="Loading order history & inventory stock…" /></div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
                <div className="modal-body" style={{ flex: 1, overflowY: 'auto' }}>
                  {modalError && <ErrorMessage message={modalError} variant="error" />}

                  {/* 1. Full Order History View */}
                  {saleDetails && (
                    <div style={{ background: 'rgba(43,98,198,0.06)', borderRadius: 8, padding: '12px 14px', marginBottom: 16 }}>
                      <div style={{ fontWeight: 700, fontSize: 13, textTransform: 'uppercase', color: 'var(--color-brand-primary)', marginBottom: 6 }}>
                        Original Sale Context
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, fontSize: 13 }}>
                        <div><strong>Customer:</strong> {saleDetails.customerName}</div>
                        <div><strong>Total Amount:</strong> ₹{saleDetails.totalAmount}</div>
                        <div><strong>Original Items:</strong> {saleDetails.itemNames} ({saleDetails.sizes})</div>
                      </div>
                    </div>
                  )}

                  {/* STEP 1: Select Items & Disposition */}
                  {step === 1 && (
                    <form onSubmit={goToStep2}>
                      <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 10, borderBottom: '1px solid var(--color-border)', paddingBottom: 4 }}>
                        Step 1: Select Items to Exchange & Disposition
                      </div>

                      {/* Tick selection for old items */}
                      <div className="form-group">
                        <label className="form-label">Select Old Item(s) to Replace *</label>
                        {saleDetails && saleDetails.itemNames ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 8, border: '1px solid var(--color-border)', borderRadius: 6 }}>
                            {saleDetails.itemNames.split(',').map((it: string, idx: number) => {
                              const sz = saleDetails.sizes.split(',')[idx]?.trim() || 'M';
                              const name = it.trim();
                              const isChecked = selectedOldItems.some((i) => i.itemName === name && i.size === sz);
                              return (
                                <label key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={() => toggleOldItem(name, sz)}
                                  />
                                  <span>{name} — Size {sz}</span>
                                </label>
                              );
                            })}
                          </div>
                        ) : (
                          <div style={{ fontSize: 13, color: 'var(--color-ink-muted)' }}>Original item list: {activeRecord.lastItems}</div>
                        )}
                      </div>

                      {/* Dropdown for new items sourced live from Inventory */}
                      <div className="form-group">
                        <label className="form-label">Select New Item(s) from Live Inventory *</label>
                        <select
                          className="form-select"
                          onChange={(e) => { handleAddNewItemChoice(e.target.value); e.target.value = ''; }}
                        >
                          <option value="">-- Add replacement item from stock --</option>
                          {availableInventory.map((inv) => (
                            <option key={`${inv.itemName}:${inv.size}`} value={`${inv.itemName}:${inv.size}`}>
                              {inv.itemName} — Size {inv.size} ({inv.qty} piece(s) available)
                            </option>
                          ))}
                        </select>

                        {selectedNewItems.length > 0 && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                            {selectedNewItems.map((item) => (
                              <span key={`${item.itemName}:${item.size}`} className="badge badge-info" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                {item.itemName} ({item.size})
                                <button type="button" onClick={() => removeNewItemChoice(item.itemName, item.size)} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', fontWeight: 700 }}>×</button>
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Mandatory Disposition Selector */}
                      <div className="form-group" style={{ background: 'rgba(255,152,0,0.08)', padding: 12, borderRadius: 8 }}>
                        <label className="form-label" style={{ fontWeight: 700, color: '#e65100' }}>
                          Mandatory Old Item Disposition *
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

                      {/* Status Progression */}
                      <div className="form-group">
                        <label className="form-label">Status Progression</label>
                        <select className="form-select" value={statusVal} onChange={(e) => setStatusVal(e.target.value)}>
                          <option value="Replacement Approved">Replacement Approved</option>
                          <option value="Replacement Dispatched">Replacement Dispatched</option>
                          <option value="Replacement Received">Replacement Received</option>
                          <option value="Satisfied / Completed Order">Satisfied / Completed Order (Unlocks Sale)</option>
                        </select>
                      </div>

                      <div className="modal-footer" style={{ padding: '12px 0 0' }}>
                        <button type="button" className="btn btn-ghost" onClick={() => setActiveRecord(null)}>Cancel</button>
                        <button type="submit" className="btn btn-primary">
                          Proceed to Confirmation →
                        </button>
                      </div>
                    </form>
                  )}

                  {/* STEP 2: Side-by-side Confirmation Screen */}
                  {step === 2 && (
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12, color: 'var(--color-brand-primary)' }}>
                        Step 2: Confirm Replacement Mapping & Stock Changes
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                        <div style={{ border: '1px solid var(--color-border)', borderRadius: 8, padding: 12, background: '#fff' }}>
                          <div style={{ fontWeight: 700, fontSize: 13, color: '#e53935', marginBottom: 8 }}>
                            OLD ITEM(S) TO BE REPLACED
                          </div>
                          {selectedOldItems.map((i) => (
                            <div key={i.itemName + i.size} style={{ fontSize: 13, marginBottom: 4 }}>
                              • {i.itemName} (Size {i.size}) — {i.qty} piece(s)
                            </div>
                          ))}
                          <div style={{ fontSize: 12, color: 'var(--color-ink-muted)', marginTop: 8, paddingTop: 6, borderTop: '1px dashed var(--color-border)' }}>
                            <strong>Disposition:</strong> {disposition} {disposition === 'Returned to Inventory' ? `(${restockDestination})` : ''}
                          </div>
                        </div>

                        <div style={{ border: '1px solid var(--color-border)', borderRadius: 8, padding: 12, background: '#fff' }}>
                          <div style={{ fontWeight: 700, fontSize: 13, color: '#2e7d32', marginBottom: 8 }}>
                            NEW REPLACEMENT ITEM(S)
                          </div>
                          {selectedNewItems.map((i) => (
                            <div key={i.itemName + i.size} style={{ fontSize: 13, marginBottom: 4 }}>
                              • {i.itemName} (Size {i.size}) — {i.qty} piece(s)
                            </div>
                          ))}
                          <div style={{ fontSize: 12, color: 'var(--color-ink-muted)', marginTop: 8, paddingTop: 6, borderTop: '1px dashed var(--color-border)' }}>
                            Will reduce main Inventory total by selected quantities.
                          </div>
                        </div>
                      </div>

                      <div className="modal-footer" style={{ padding: '12px 0 0' }}>
                        <button type="button" className="btn btn-ghost" onClick={() => setStep(1)} disabled={saving}>
                          ← Back to Edit
                        </button>
                        <button type="button" className="btn btn-primary" onClick={handleConfirmReplacement} disabled={saving}>
                          {saving ? <LoadingGecko size="inline" label="Saving replacement…" /> : 'Confirm & Commit Replacement'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
