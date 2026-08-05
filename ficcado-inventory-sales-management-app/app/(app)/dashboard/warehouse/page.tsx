'use client';

/**
 * app/(app)/dashboard/warehouse/page.tsx
 * Warehouse Management Handler — full spec Section 6 implementation.
 *
 * Create flow:
 *   1. Select Warehouse Location + Handler Name
 *   2. Multi-select items from Items sheet
 *   3. For each selected item, enter qty per size (XS, S, M, L, XL)
 *   4. Save — writes to Warehouse Management sheet
 *
 * Also shows Inventory ↔ Warehouse reconciliation view.
 */

import React, { useEffect, useState } from 'react';
import LoadingGecko from '@/components/LoadingGecko';
import ErrorMessage, { parseApiError } from '@/components/ErrorMessage';

const SIZES = ['XS', 'S', 'M', 'L', 'XL'];

interface SizeQty { size: string; qty: number; }
interface ItemEntry { itemName: string; sizes: SizeQty[]; }

export default function WarehousePage() {
  const [warehouse, setWarehouse]   = useState<any[]>([]);
  const [allItems, setAllItems]     = useState<any[]>([]);  // from /api/items
  const [inventory, setInventory]   = useState<any[]>([]);  // for reconciliation
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<{ message: string } | null>(null);
  const [success, setSuccess]       = useState<string | null>(null);
  const [activeTab, setActiveTab]   = useState<'allocations' | 'reconciliation'>('allocations');

  // Create modal state
  const [showCreate, setShowCreate]   = useState(false);
  const [creating, setCreating]       = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [location, setLocation]       = useState('');
  const [handler, setHandler]         = useState('');
  const [selectedItemNames, setSelectedItemNames] = useState<string[]>([]);
  const [itemEntries, setItemEntries]   = useState<ItemEntry[]>([]);

  // Delete
  const [deleting, setDeleting] = useState<number | null>(null);

  async function loadData() {
    setLoading(true);
    try {
      const [whRes, itemRes, invRes] = await Promise.all([
        fetch('/api/warehouse').then((r) => r.json()),
        fetch('/api/items').then((r) => r.json()),
        fetch('/api/inventory').then((r) => r.json()),
      ]);
      if (whRes.warehouse)   setWarehouse(whRes.warehouse);
      if (itemRes.items)     setAllItems(itemRes.items);
      if (invRes.inventory)  setInventory(invRes.inventory);
      if (!whRes.warehouse)  setError(parseApiError(whRes));
    } catch { setError({ message: "Couldn't load warehouse data." }); }
    finally { setLoading(false); }
  }

  useEffect(() => { loadData(); }, []);

  function toggleItemSelection(itemName: string) {
    if (selectedItemNames.includes(itemName)) {
      setSelectedItemNames(selectedItemNames.filter((n) => n !== itemName));
      setItemEntries(itemEntries.filter((e) => e.itemName !== itemName));
    } else {
      setSelectedItemNames([...selectedItemNames, itemName]);
      // Find item's available sizes from allItems
      const item = allItems.find((it) => it.itemName === itemName);
      const availSizes = item?.sizes ? item.sizes.split(/,\s*/).filter(Boolean) : SIZES;
      setItemEntries([...itemEntries, {
        itemName,
        sizes: availSizes.map((s: string) => ({ size: s, qty: 0 })),
      }]);
    }
  }

  function updateQty(itemName: string, size: string, qty: number) {
    setItemEntries(itemEntries.map((entry) =>
      entry.itemName !== itemName ? entry
        : { ...entry, sizes: entry.sizes.map((s) => s.size === size ? { ...s, qty } : s) }
    ));
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreateError(null);
    if (!location.trim()) { setCreateError('Warehouse location is required.'); return; }
    if (!handler.trim())  { setCreateError('Handler name is required.'); return; }
    if (itemEntries.length === 0) { setCreateError('Select at least one item.'); return; }

    setCreating(true);
    try {
      const res  = await fetch('/api/warehouse', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          warehouseLocation: location,
          handlerName:       handler,
          items:             itemEntries.map((e) => ({
            itemName: e.itemName,
            sizes:    e.sizes.filter((s) => s.qty > 0).map((s) => ({ size: s.size, quantity: s.qty })),
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) { setCreateError(data.error || 'Failed to add warehouse record.'); return; }
      setShowCreate(false);
      setLocation(''); setHandler(''); setSelectedItemNames([]); setItemEntries([]);
      setSuccess('Warehouse allocation added.');
      loadData();
    } catch { setCreateError("Couldn't save warehouse data."); }
    finally { setCreating(false); }
  }

  async function handleDelete(rowIndex: number, location: string) {
    if (!confirm(`Delete this warehouse record for '${location}'?`)) return;
    setDeleting(rowIndex);
    try {
      const res  = await fetch(`/api/warehouse/${rowIndex}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) { setError(parseApiError(data)); return; }
      setSuccess('Warehouse record deleted.');
      loadData();
    } catch { setError({ message: "Couldn't delete warehouse record." }); }
    finally { setDeleting(null); }
  }

  // Compute reconciliation: sum warehouse quantities by itemName+size vs inventory
  function getReconciliation() {
    const warehouseMap: Record<string, number> = {};
    for (const w of warehouse) {
      const key = `${w.itemName}||${w.size}`;
      warehouseMap[key] = (warehouseMap[key] || 0) + parseInt(w.qty || '0', 10);
    }
    return inventory.map((inv) => {
      const key    = `${inv.itemName}||${inv.size}`;
      const wTotal = warehouseMap[key] || 0;
      const iTotal = parseInt(inv.totalQty || inv.quantity || '0', 10);
      return { itemName: inv.itemName, size: inv.size, inventory: iTotal, warehouse: wTotal, mismatch: iTotal !== wTotal };
    });
  }

  if (loading) return <LoadingGecko size="full" label="Loading warehouse data…" />;

  const recon = getReconciliation();

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Warehouse Management</h1>
          <div className="page-subtitle">Track per-location stock — {warehouse.length} allocation{warehouse.length !== 1 ? 's' : ''}</div>
        </div>
        <button className="btn btn-primary" onClick={() => setShowCreate(true)}>+ Add Allocation</button>
      </div>

      {error   && <ErrorMessage message={error.message}   variant="error"   onDismiss={() => setError(null)} />}
      {success && <ErrorMessage message={success}          variant="success" onDismiss={() => setSuccess(null)} />}

      {/* Tabs */}
      <div className="tab-list">
        <div className={`tab-item ${activeTab === 'allocations' ? 'active' : ''}`} onClick={() => setActiveTab('allocations')}>
          Stock Allocations ({warehouse.length})
        </div>
        <div className={`tab-item ${activeTab === 'reconciliation' ? 'active' : ''}`} onClick={() => setActiveTab('reconciliation')}>
          Reconciliation {recon.filter((r) => r.mismatch).length > 0 && (
            <span style={{ marginLeft: 6, background: '#e53935', color: '#fff', borderRadius: '50%', width: 18, height: 18, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700 }}>
              {recon.filter((r) => r.mismatch).length}
            </span>
          )}
        </div>
      </div>

      {/* ALLOCATIONS TAB */}
      {activeTab === 'allocations' && (
        warehouse.length === 0 ? (
          <div className="empty-state">
            <div style={{ fontSize: 28 }}>⬡</div>
            <div className="empty-state-title">No warehouse allocations</div>
            <div style={{ fontSize: 13, color: 'var(--color-ink-muted)' }}>Add your first allocation to start tracking per-location stock.</div>
          </div>
        ) : (
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Location</th>
                    <th>Handler</th>
                    <th>Item Name</th>
                    <th>Size</th>
                    <th>Quantity</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {warehouse.map((w, i) => (
                    <tr key={i}>
                      <td style={{ fontWeight: 600 }}>{w.location}</td>
                      <td>{w.handler}</td>
                      <td>{w.itemName}</td>
                      <td><span className="badge badge-neutral">{w.size}</span></td>
                      <td className="tabular-nums" style={{ fontWeight: 700 }}>{w.qty}</td>
                      <td>
                        <button className="btn btn-danger btn-sm" onClick={() => handleDelete(w.rowIndex, w.location)} disabled={deleting === w.rowIndex}>
                          {deleting === w.rowIndex ? '…' : 'Delete'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      )}

      {/* RECONCILIATION TAB */}
      {activeTab === 'reconciliation' && (
        recon.length === 0 ? (
          <div className="empty-state">
            <div style={{ fontSize: 28 }}>✓</div>
            <div className="empty-state-title">No inventory data to reconcile</div>
            <div style={{ fontSize: 13, color: 'var(--color-ink-muted)' }}>Add inventory records to see the reconciliation view.</div>
          </div>
        ) : (
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Item Name</th>
                    <th>Size</th>
                    <th>Inventory Total</th>
                    <th>Warehouse Total</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {recon.map((r, i) => (
                    <tr key={i} style={r.mismatch ? { background: 'rgba(229,57,53,0.06)' } : {}}>
                      <td style={{ fontWeight: 600 }}>{r.itemName}</td>
                      <td><span className="badge badge-neutral">{r.size}</span></td>
                      <td className="tabular-nums">{r.inventory}</td>
                      <td className="tabular-nums">{r.warehouse}</td>
                      <td>
                        {r.mismatch ? (
                          <span className="badge badge-error">⚠ Mismatch ({r.inventory - r.warehouse > 0 ? '+' : ''}{r.inventory - r.warehouse} diff)</span>
                        ) : (
                          <span className="badge badge-success">✓ Reconciled</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      )}

      {/* Create Modal — Multi-step per spec Section 6 */}
      {showCreate && (
        <div className="modal-backdrop" onClick={() => setShowCreate(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 600, maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div className="modal-header" style={{ flexShrink: 0 }}>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 18 }}>Add Warehouse Allocation</h2>
              <button className="btn-icon" onClick={() => setShowCreate(false)}>×</button>
            </div>
            <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
              <div className="modal-body" style={{ flex: 1, overflowY: 'auto' }}>
                {createError && <ErrorMessage message={createError} variant="error" />}

                {/* Step 1: Location + Handler */}
                <div className="grid-form-2">
                  <div className="form-group">
                    <label className="form-label">Warehouse Location *</label>
                    <input type="text" className="form-input" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Cochin" autoFocus />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Handler Name *</label>
                    <input type="text" className="form-input" value={handler} onChange={(e) => setHandler(e.target.value)} placeholder="e.g. Arjun" />
                  </div>
                </div>

                {/* Step 2: Multi-select items */}
                <div className="form-group">
                  <label className="form-label">Select Items *</label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, maxHeight: 130, overflowY: 'auto', padding: 4 }}>
                    {allItems.length === 0 ? (
                      <div style={{ fontSize: 13, color: 'var(--color-ink-muted)' }}>No items found. Add items first in the Items module.</div>
                    ) : allItems.map((item) => (
                      <button key={item.itemName} type="button"
                        onClick={() => toggleItemSelection(item.itemName)}
                        className={`btn btn-sm ${selectedItemNames.includes(item.itemName) ? 'btn-primary' : 'btn-ghost'}`}>
                        {item.itemName}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Step 3: Per-item, per-size quantity entry */}
                {itemEntries.map((entry) => (
                  <div key={entry.itemName} style={{ background: 'rgba(43,98,198,0.06)', borderRadius: 8, padding: '12px 14px', marginBottom: 12 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10 }}>{entry.itemName}</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
                      {entry.sizes.map((s) => (
                        <div key={s.size} className="form-group" style={{ margin: 0 }}>
                          <label className="form-label" style={{ fontSize: 11, marginBottom: 4 }}>{s.size}</label>
                          <input type="number" className="form-input" value={s.qty || ''} min="0"
                            onChange={(e) => updateQty(entry.itemName, s.size, parseInt(e.target.value || '0', 10))}
                            style={{ padding: '6px 8px', textAlign: 'center' }} />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <div className="modal-footer" style={{ flexShrink: 0 }}>
                <button type="button" className="btn btn-ghost" onClick={() => setShowCreate(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={creating}>
                  {creating ? <LoadingGecko size="inline" label="Saving…" /> : 'Save Allocation'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
