'use client';

/**
 * app/(app)/dashboard/warehouse/page.tsx
 * Warehouse Management Handler — Part 2 Implementation.
 *
 * Requirements:
 *   1. Handler Name MUST be selected from live registered admins list.
 *   2. Items+sizes sourced live from Inventory (not Items), showing remaining unallocated piece(s).
 *   3. Allocation capped by remaining balance (hard validation on server & soft indicator on UI).
 *   4. Full CRUD + reconciliation view.
 */

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import LoadingGecko from '@/components/LoadingGecko';
import ErrorMessage, { parseApiError } from '@/components/ErrorMessage';

interface InventoryStockItem {
  itemName:     string;
  size:         string;
  totalQty:     number;
  allocatedQty: number;
  remainingQty: number;
}

interface SizeQty { size: string; qty: number; max: number; }
interface ItemEntry { itemName: string; sizes: SizeQty[]; }

export default function WarehousePage() {
  const [warehouse, setWarehouse]         = useState<any[]>([]);
  const [admins, setAdmins]               = useState<string[]>([]);
  const [inventoryStock, setInventoryStock] = useState<InventoryStockItem[]>([]);
  const [inventory, setInventory]         = useState<any[]>([]);  // for reconciliation
  const [loading, setLoading]             = useState(true);
  const [error, setError]                 = useState<{ message: string } | null>(null);
  const [success, setSuccess]             = useState<string | null>(null);
  const [activeTab, setActiveTab]         = useState<'allocations' | 'reconciliation'>('allocations');

  // Create modal state
  const [showCreate, setShowCreate]         = useState(false);
  const [creating, setCreating]             = useState(false);
  const [createError, setCreateError]       = useState<string | null>(null);
  const [location, setLocation]             = useState('');
  const [handler, setHandler]               = useState('');
  const [selectedItemsMap, setSelectedItemsMap] = useState<Record<string, string[]>>({}); // itemName -> size[]
  const [itemEntries, setItemEntries]         = useState<ItemEntry[]>([]);

  // Delete
  const [deleting, setDeleting] = useState<number | null>(null);

  async function loadData() {
    setLoading(true);
    try {
      const [whRes, invRes] = await Promise.all([
        fetch('/api/warehouse').then((r) => r.json()),
        fetch('/api/inventory').then((r) => r.json()),
      ]);

      if (whRes.warehouse)      setWarehouse(whRes.warehouse);
      if (whRes.admins)         setAdmins(whRes.admins);
      if (whRes.inventoryStock) setInventoryStock(whRes.inventoryStock);
      if (invRes.inventory)     setInventory(invRes.inventory);

      if (!whRes.warehouse) setError(parseApiError(whRes));
    } catch { setError({ message: "Couldn't load warehouse data." }); }
    finally { setLoading(false); }
  }

  useEffect(() => { loadData(); }, []);

  // Group available inventory stock by itemName
  const itemNamesWithStock = Array.from(new Set(inventoryStock.map((i) => i.itemName)));

  function toggleItemSizeSelection(itemName: string, size: string) {
    const currentSizes = selectedItemsMap[itemName] || [];
    let updatedSizes: string[];

    if (currentSizes.includes(size)) {
      updatedSizes = currentSizes.filter((s) => s !== size);
    } else {
      updatedSizes = [...currentSizes, size];
    }

    const nextMap = { ...selectedItemsMap };
    if (updatedSizes.length === 0) {
      delete nextMap[itemName];
    } else {
      nextMap[itemName] = updatedSizes;
    }
    setSelectedItemsMap(nextMap);

    // Update itemEntries
    rebuildItemEntries(nextMap);
  }

  function rebuildItemEntries(map: Record<string, string[]>) {
    const newEntries: ItemEntry[] = [];

    for (const [itemName, sizes] of Object.entries(map)) {
      const sizeQtys: SizeQty[] = sizes.map((size) => {
        const stock = inventoryStock.find((st) => st.itemName === itemName && st.size === size);
        const max = stock ? stock.remainingQty : 0;
        // preserve existing qty if present
        const existingEntry = itemEntries.find((e) => e.itemName === itemName);
        const existingSize = existingEntry?.sizes.find((s) => s.size === size);
        return { size, qty: existingSize ? existingSize.qty : 0, max };
      });
      newEntries.push({ itemName, sizes: sizeQtys });
    }

    setItemEntries(newEntries);
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
    if (!handler.trim())  { setCreateError('Select a registered admin as handler.'); return; }
    if (itemEntries.length === 0) { setCreateError('Select at least one item and size to allocate.'); return; }

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
          })).filter((e) => e.sizes.length > 0),
        }),
      });
      const data = await res.json();
      if (!res.ok) { setCreateError(data.error || 'Failed to add warehouse record.'); return; }
      setShowCreate(false);
      setLocation(''); setHandler(''); setSelectedItemsMap({}); setItemEntries([]);
      setSuccess('Warehouse allocation added successfully.');
      loadData();
    } catch { setCreateError("Couldn't save warehouse data."); }
    finally { setCreating(false); }
  }

  async function handleDelete(rowIndex: number, locationName: string) {
    if (!confirm(`Delete this warehouse record for '${locationName}'?`)) return;
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
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <Link href="/dashboard/reconciliation" className="btn btn-secondary btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            ⚖ Dedicated Reconciliation Page →
          </Link>
          <button className="btn btn-primary" onClick={() => { setCreateError(null); setShowCreate(true); }}>+ Add Allocation</button>
        </div>
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
                      <td><span className="badge badge-info">👤 {w.handler}</span></td>
                      <td>{w.itemName}</td>
                      <td><span className="badge badge-neutral">{w.size}</span></td>
                      <td className="tabular-nums" style={{ fontWeight: 700 }}>{w.qty} piece(s)</td>
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
                      <td className="tabular-nums">{r.inventory} piece(s)</td>
                      <td className="tabular-nums">{r.warehouse} piece(s)</td>
                      <td>
                        {r.mismatch ? (
                          <span className="badge badge-error">⚠ Mismatch ({r.inventory - r.warehouse > 0 ? '+' : ''}{r.inventory - r.warehouse} piece(s))</span>
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

      {/* Create Modal — Inventory-aware + Admin Handler */}
      {showCreate && (
        <div className="modal-backdrop" onClick={() => setShowCreate(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 650, maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div className="modal-header" style={{ flexShrink: 0 }}>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 18 }}>Add Warehouse Allocation</h2>
              <button className="btn-icon" onClick={() => setShowCreate(false)}>×</button>
            </div>
            <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
              <div className="modal-body" style={{ flex: 1, overflowY: 'auto' }}>
                {createError && <ErrorMessage message={createError} variant="error" />}

                {/* Location + Handler (Admin Selection) */}
                <div className="grid-form-2">
                  <div className="form-group">
                    <label className="form-label">Warehouse Location *</label>
                    <input type="text" className="form-input" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Cochin Warehouse" autoFocus />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Handler (Admin) *</label>
                    <select className="form-select" value={handler} onChange={(e) => setHandler(e.target.value)}>
                      <option value="">-- Select Handler (Admin) --</option>
                      {admins.map((adm) => (
                        <option key={adm} value={adm}>{adm}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Live Inventory Stock Items Selector */}
                <div className="form-group">
                  <label className="form-label">Select Items & Sizes from Live Inventory *</label>
                  <div style={{ fontSize: 12, color: 'var(--color-ink-muted)', marginBottom: 8 }}>
                    Quantities are capped by live unallocated Inventory balance.
                  </div>

                  {itemNamesWithStock.length === 0 ? (
                    <div className="empty-state" style={{ padding: 16 }}>No items in Inventory. Add inventory items first.</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxHeight: 180, overflowY: 'auto', border: '1px solid var(--color-border)', borderRadius: 8, padding: 10 }}>
                      {itemNamesWithStock.map((itemName) => {
                        const sizesForItem = inventoryStock.filter((st) => st.itemName === itemName);
                        return (
                          <div key={itemName} style={{ borderBottom: '1px solid var(--color-border)', paddingBottom: 8 }}>
                            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>{itemName}</div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                              {sizesForItem.map((st) => {
                                const isSelected = (selectedItemsMap[itemName] || []).includes(st.size);
                                const isDisabled = st.remainingQty <= 0;
                                return (
                                  <button
                                    key={st.size}
                                    type="button"
                                    disabled={isDisabled}
                                    onClick={() => toggleItemSizeSelection(itemName, st.size)}
                                    className={`btn btn-sm ${isSelected ? 'btn-primary' : 'btn-ghost'}`}
                                    style={{ fontSize: 11, opacity: isDisabled ? 0.5 : 1 }}
                                  >
                                    {st.size} ({st.remainingQty} left)
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Per-item, per-size quantity entry */}
                {itemEntries.map((entry) => (
                  <div key={entry.itemName} style={{ background: 'rgba(43,98,198,0.06)', borderRadius: 8, padding: '12px 14px', marginBottom: 12 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10 }}>{entry.itemName}</div>
                    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(entry.sizes.length, 5)}, 1fr)`, gap: 8 }}>
                      {entry.sizes.map((s) => (
                        <div key={s.size} className="form-group" style={{ margin: 0 }}>
                          <label className="form-label" style={{ fontSize: 11, marginBottom: 4 }}>
                            {s.size} <span style={{ color: 'var(--color-ink-muted)' }}>(Max {s.max})</span>
                          </label>
                          <input
                            type="number"
                            className="form-input"
                            placeholder="add the number of piece"
                            value={s.qty || ''}
                            min="0"
                            max={s.max}
                            onChange={(e) => {
                              const val = parseInt(e.target.value || '0', 10);
                              updateQty(entry.itemName, s.size, val);
                            }}
                            style={{ padding: '6px 8px', textAlign: 'center' }}
                          />
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
