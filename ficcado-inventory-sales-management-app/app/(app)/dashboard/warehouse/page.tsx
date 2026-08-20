'use client';

/**
 * app/(app)/dashboard/warehouse/page.tsx
 * Warehouse Management — Requirement 1 Overhaul.
 *
 * Displays stock allocations grouped into Handler Stock Cards (Boxes) with View/Edit and Delete capabilities.
 * Supports both Registered Admins and Custom/External Handler names.
 */

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import LoadingGecko from '@/components/LoadingGecko';
import ErrorMessage, { parseApiError } from '@/components/ErrorMessage';
import StatusBadge from '@/components/StatusBadge';

interface WarehouseAllocationRow {
  rowIndex: number;
  location: string;
  handler: string;
  itemName: string;
  size: string;
  qty: number;
  updatedAt: string;
}

interface HandlerStockBox {
  id: string; // `${location}:${handler}`
  location: string;
  handler: string;
  isAdmin: boolean;
  totalItems: number;
  totalPieces: number;
  allocations: { itemName: string; size: string; qty: number; rowIndex: number }[];
}

interface InventoryStockItem {
  itemName: string;
  size: string;
  totalQty: number;
  allocatedQty: number;
  remainingQty: number;
}

export default function WarehousePage() {
  const [warehouseRows, setWarehouseRows] = useState<WarehouseAllocationRow[]>([]);
  const [admins, setAdmins] = useState<string[]>([]);
  const [inventoryStock, setInventoryStock] = useState<InventoryStockItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ message: string } | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  // Modal State (Create & Edit)
  const [showModal, setShowModal] = useState(false);
  const [editingHandlerBox, setEditingHandlerBox] = useState<HandlerStockBox | null>(null);
  const [locationInput, setLocationInput] = useState('');
  const [handlerType, setHandlerType] = useState<'admin' | 'custom'>('admin');
  const [selectedAdmin, setSelectedAdmin] = useState('');
  const [customHandler, setCustomHandler] = useState('');

  // Map of selected items: itemName -> array of size strings
  const [selectedItemsMap, setSelectedItemsMap] = useState<Record<string, string[]>>({});
  // Map of item+size quantities: `${itemName}:${size}` -> qty
  const [qtyMap, setQtyMap] = useState<Record<string, number>>({});

  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);

  async function loadData() {
    setLoading(true);
    try {
      const res = await fetch('/api/warehouse');
      const data = await res.json();
      if (!res.ok) { setError(parseApiError(data)); return; }
      setWarehouseRows(data.warehouse || []);
      setAdmins(data.admins || []);
      setInventoryStock(data.inventoryStock || []);
      if (data.admins && data.admins.length > 0 && !selectedAdmin) {
        setSelectedAdmin(data.admins[0]);
      }
    } catch {
      setError({ message: "Couldn't load warehouse allocations." });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadData(); }, []);

  // Group allocation rows into Handler Stock Boxes
  const handlerBoxes: HandlerStockBox[] = React.useMemo(() => {
    const map: Record<string, HandlerStockBox> = {};

    for (const row of warehouseRows) {
      const key = `${row.location.trim().toLowerCase()}:${row.handler.trim().toLowerCase()}`;
      if (!map[key]) {
        map[key] = {
          id: key,
          location: row.location.trim(),
          handler: row.handler.trim(),
          isAdmin: admins.includes(row.handler.trim()),
          totalItems: 0,
          totalPieces: 0,
          allocations: [],
        };
      }
      map[key].allocations.push({
        itemName: row.itemName,
        size: row.size,
        qty: row.qty,
        rowIndex: row.rowIndex,
      });
      map[key].totalPieces += row.qty;
    }

    return Object.values(map).map((box) => ({
      ...box,
      totalItems: box.allocations.length,
    }));
  }, [warehouseRows, admins]);

  function handleOpenCreate() {
    setEditingHandlerBox(null);
    setLocationInput('');
    setHandlerType('admin');
    setSelectedAdmin(admins[0] || '');
    setCustomHandler('');
    setSelectedItemsMap({});
    setQtyMap({});
    setModalError(null);
    setShowModal(true);
  }

  function handleOpenEdit(box: HandlerStockBox) {
    setEditingHandlerBox(box);
    setLocationInput(box.location);
    if (admins.includes(box.handler)) {
      setHandlerType('admin');
      setSelectedAdmin(box.handler);
      setCustomHandler('');
    } else {
      setHandlerType('custom');
      setCustomHandler(box.handler);
      setSelectedAdmin(admins[0] || '');
    }

    // Populate selected items and quantities
    const newItemsMap: Record<string, string[]> = {};
    const newQtyMap: Record<string, number> = {};

    for (const alloc of box.allocations) {
      if (!newItemsMap[alloc.itemName]) newItemsMap[alloc.itemName] = [];
      newItemsMap[alloc.itemName].push(alloc.size);
      newQtyMap[`${alloc.itemName}:${alloc.size}`] = alloc.qty;
    }

    setSelectedItemsMap(newItemsMap);
    setQtyMap(newQtyMap);
    setModalError(null);
    setShowModal(true);
  }

  function toggleItemSizeSelection(itemName: string, size: string) {
    const currentSizes = selectedItemsMap[itemName] || [];
    const exists = currentSizes.includes(size);
    let nextSizes: string[];

    if (exists) {
      nextSizes = currentSizes.filter((s) => s !== size);
      // clear qty
      const copy = { ...qtyMap };
      delete copy[`${itemName}:${size}`];
      setQtyMap(copy);
    } else {
      nextSizes = [...currentSizes, size];
      // default qty to 1 or max
      const stockObj = inventoryStock.find((st) => st.itemName === itemName && st.size === size);
      const defaultQty = Math.min(1, stockObj?.remainingQty || 1);
      setQtyMap((prev) => ({ ...prev, [`${itemName}:${size}`]: defaultQty }));
    }

    if (nextSizes.length === 0) {
      const copyMap = { ...selectedItemsMap };
      delete copyMap[itemName];
      setSelectedItemsMap(copyMap);
    } else {
      setSelectedItemsMap({ ...selectedItemsMap, [itemName]: nextSizes });
    }
  }

  function updateQty(itemName: string, size: string, val: number) {
    setQtyMap((prev) => ({ ...prev, [`${itemName}:${size}`]: val }));
  }

  async function handleSaveHandlerStock(e: React.FormEvent) {
    e.preventDefault();
    setModalError(null);

    const finalLocation = locationInput.trim();
    const finalHandler = handlerType === 'admin' ? selectedAdmin.trim() : customHandler.trim();

    if (!finalLocation) { setModalError('Warehouse location name is required.'); return; }
    if (!finalHandler) { setModalError('Handler name is required.'); return; }

    // Build items array
    const itemsToSave: { itemName: string; size: string; qty: number }[] = [];
    Object.entries(selectedItemsMap).forEach(([itemName, sizes]) => {
      sizes.forEach((size) => {
        const qty = qtyMap[`${itemName}:${size}`] || 0;
        if (qty > 0) {
          itemsToSave.push({ itemName, size, qty });
        }
      });
    });

    if (itemsToSave.length === 0) {
      setModalError('Select at least one item variant and enter a quantity greater than 0.');
      return;
    }

    setSubmitting(true);
    try {
      let res;
      if (editingHandlerBox) {
        // PUT update handler stock
        res = await fetch('/api/warehouse/handler', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            originalLocation: editingHandlerBox.location,
            originalHandler: editingHandlerBox.handler,
            newLocation: finalLocation,
            newHandler: finalHandler,
            items: itemsToSave,
          }),
        });
      } else {
        // POST create warehouse allocation
        res = await fetch('/api/warehouse', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            warehouseLocation: finalLocation,
            handlerName: finalHandler,
            items: itemsToSave,
          }),
        });
      }

      const data = await res.json();
      if (!res.ok) { setModalError(data.error || 'Failed to save handler stock.'); return; }

      setShowModal(false);
      setSuccess(data.message || 'Warehouse stock allocation saved.');
      loadData();
    } catch {
      setModalError("Couldn't save warehouse allocation.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeleteHandler(box: HandlerStockBox) {
    if (!confirm(`Delete all warehouse stock allocations for ${box.handler} at ${box.location}?`)) return;
    setDeletingId(box.id);
    try {
      const res = await fetch(`/api/warehouse/handler?location=${encodeURIComponent(box.location)}&handler=${encodeURIComponent(box.handler)}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) { setError(parseApiError(data)); return; }
      setSuccess(data.message || `Deleted allocations for ${box.handler}.`);
      loadData();
    } catch {
      setError({ message: "Couldn't delete handler allocations." });
    } finally {
      setDeletingId(null);
    }
  }

  const filteredBoxes = handlerBoxes.filter((b) => {
    const q = search.toLowerCase();
    return !q ||
      b.handler.toLowerCase().includes(q) ||
      b.location.toLowerCase().includes(q) ||
      b.allocations.some((a) => a.itemName.toLowerCase().includes(q));
  });

  const itemNamesWithStock = Array.from(new Set(inventoryStock.map((s) => s.itemName)));

  // Array of items selected for quantity entry in modal
  const itemEntries = Object.entries(selectedItemsMap).map(([itemName, sizes]) => ({
    itemName,
    sizes: sizes.map((size) => {
      const stockObj = inventoryStock.find((st) => st.itemName === itemName && st.size === size);
      const isEditingThis = editingHandlerBox?.allocations.some((a) => a.itemName === itemName && a.size === size);
      const maxAlloc = (stockObj?.remainingQty || 0) + (isEditingThis ? (qtyMap[`${itemName}:${size}`] || 0) : 0);
      return {
        size,
        max: Math.max(1, maxAlloc),
        qty: qtyMap[`${itemName}:${size}`] || 0,
      };
    }),
  }));

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Warehouse Management</h1>
          <div className="page-subtitle">Track stock allocations by Handler & Location — {handlerBoxes.length} Handler Box{handlerBoxes.length !== 1 ? 'es' : ''}</div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button className="btn btn-ghost btn-sm" onClick={loadData} disabled={loading}>
            ⟳ Refresh
          </button>
          <Link href="/dashboard/reconciliation" className="btn btn-secondary btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            ⚖ Dedicated Reconciliation Page →
          </Link>
          <button className="btn btn-primary" onClick={handleOpenCreate}>+ Add Handler Allocation</button>
        </div>
      </div>

      {error && <ErrorMessage message={error.message} variant="error" onDismiss={() => setError(null)} />}
      {success && <ErrorMessage message={success} variant="success" onDismiss={() => setSuccess(null)} />}

      {/* Search Bar */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
        <div className="search-bar" style={{ flex: 1, maxWidth: 380 }}>
          <span style={{ color: 'var(--color-ink-muted)' }}>⌕</span>
          <input
            type="text"
            placeholder="Search handler, location, or item name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* HANDLER STOCK BOX CARDS GRID */}
      {loading ? (
        <div className="card" style={{ padding: 48, textAlign: 'center' }}>
          <LoadingGecko label="Loading warehouse handler allocations…" />
        </div>
      ) : filteredBoxes.length === 0 ? (
        <div className="empty-state">
          <div style={{ fontSize: 28 }}>⬡</div>
          <div className="empty-state-title">No handler stock boxes found</div>
          <div style={{ fontSize: 13, color: 'var(--color-ink-muted)' }}>
            Click &quot;+ Add Handler Allocation&quot; to assign main inventory stock to a handler at a warehouse location.
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16 }}>
          {filteredBoxes.map((box) => (
            <div key={box.id} className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', border: '1px solid var(--color-border)', borderRadius: 12, padding: 18 }}>
              <div>
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                  <div>
                    <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 16, color: 'var(--color-ink)', display: 'flex', alignItems: 'center', gap: 6 }}>
                      👤 {box.handler}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--color-brand-primary)', fontWeight: 600, marginTop: 2 }}>
                      📍 {box.location}
                    </div>
                  </div>
                  <StatusBadge status={box.isAdmin ? 'Admin' : 'Default'} variant={box.isAdmin ? 'info' : 'neutral'}>
                    {box.isAdmin ? 'Admin Handler' : 'Custom Handler'}
                  </StatusBadge>
                </div>

                {/* Summary Metrics */}
                <div style={{ background: 'rgba(0,0,0,0.03)', borderRadius: 8, padding: '8px 12px', marginBottom: 12, display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}>
                  <span>Allocated Items: <strong>{box.totalItems} variants</strong></span>
                  <span>Total Pieces: <strong>{box.totalPieces} piece(s)</strong></span>
                </div>

                {/* Item allocations list */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16, maxHeight: 180, overflowY: 'auto' }}>
                  {box.allocations.map((alloc, idx) => (
                    <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, borderBottom: '1px border-subtle var(--color-border)', paddingBottom: 4 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontWeight: 600 }}>{alloc.itemName}</span>
                        <span className="badge badge-neutral" style={{ fontSize: 10 }}>{alloc.size}</span>
                      </div>
                      <span className="tabular-nums" style={{ fontWeight: 700, color: 'var(--color-brand-primary)' }}>
                        {alloc.qty} piece(s)
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: 8, paddingTop: 10, borderTop: '1px solid var(--color-border)' }}>
                <button
                  className="btn btn-secondary btn-sm"
                  style={{ flex: 1, justifyContent: 'center' }}
                  onClick={() => handleOpenEdit(box)}
                >
                  👁 View / Edit Handler Stock
                </button>
                <button
                  className="btn btn-danger btn-sm"
                  disabled={deletingId === box.id}
                  onClick={() => handleDeleteHandler(box)}
                >
                  {deletingId === box.id ? '…' : '🗑 Delete'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* CREATE / EDIT HANDLER MODAL */}
      {showModal && (
        <div className="modal-backdrop" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 580, maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div className="modal-header" style={{ flexShrink: 0 }}>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 18 }}>
                {editingHandlerBox ? `View / Edit Handler Stock: ${editingHandlerBox.handler}` : 'Add Warehouse Handler Allocation'}
              </h2>
              <button className="btn-icon" onClick={() => setShowModal(false)}>×</button>
            </div>

            <form onSubmit={handleSaveHandlerStock} style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
              <div className="modal-body" style={{ flex: 1, overflowY: 'auto' }}>
                {modalError && <ErrorMessage message={modalError} variant="error" />}

                <div className="form-group">
                  <label className="form-label">Warehouse Location *</label>
                  <input
                    type="text"
                    className="form-input"
                    value={locationInput}
                    onChange={(e) => setLocationInput(e.target.value)}
                    placeholder="e.g. OTTAPALAM, COCHIN, HUB-1"
                  />
                </div>

                {/* Handler Type Choice */}
                <div className="form-group" style={{ background: 'rgba(43,98,198,0.05)', padding: 12, borderRadius: 8 }}>
                  <label className="form-label" style={{ fontWeight: 700 }}>Handler Selection Mode *</label>
                  <div style={{ display: 'flex', gap: 16, margin: '6px 0 10px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13 }}>
                      <input
                        type="radio"
                        name="handlerType"
                        checked={handlerType === 'admin'}
                        onChange={() => setHandlerType('admin')}
                      />
                      Select Registered Admin
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13 }}>
                      <input
                        type="radio"
                        name="handlerType"
                        checked={handlerType === 'custom'}
                        onChange={() => setHandlerType('custom')}
                      />
                      Enter Custom Person / Handler Name
                    </label>
                  </div>

                  {handlerType === 'admin' ? (
                    <select
                      className="form-select"
                      value={selectedAdmin}
                      onChange={(e) => setSelectedAdmin(e.target.value)}
                    >
                      {admins.map((adm) => (
                        <option key={adm} value={adm}>Admin: {adm}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      className="form-input"
                      value={customHandler}
                      onChange={(e) => setCustomHandler(e.target.value)}
                      placeholder="Enter handler or manager name (e.g. Arjun, Vipin)"
                    />
                  )}
                </div>

                {/* Live Inventory Stock Item Selector */}
                <div className="form-group">
                  <label className="form-label">Select Items & Sizes from Live Inventory *</label>
                  <div style={{ fontSize: 12, color: 'var(--color-ink-muted)', marginBottom: 8 }}>
                    Quantities are capped by live unallocated Inventory balance.
                  </div>

                  {inventoryStock.length === 0 ? (
                    <div style={{ padding: 12, background: 'rgba(255,152,0,0.1)', borderRadius: 6, fontSize: 13, color: '#e65100' }}>
                      ⚠️ No inventory stock available to allocate. Add stock to main Inventory first.
                    </div>
                  ) : (
                    <div style={{ border: '1px solid var(--color-border)', borderRadius: 8, padding: 10, maxHeight: 180, overflowY: 'auto' }}>
                      {itemNamesWithStock.map((itemName) => {
                        const sizesForItem = inventoryStock.filter((st) => st.itemName === itemName);
                        return (
                          <div key={itemName} style={{ borderBottom: '1px solid var(--color-border)', paddingBottom: 8, marginBottom: 8 }}>
                            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>{itemName}</div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                              {sizesForItem.map((st) => {
                                const isSelected = (selectedItemsMap[itemName] || []).includes(st.size);
                                const isEditingThis = editingHandlerBox?.allocations.some((a) => a.itemName === itemName && a.size === st.size);
                                const maxAvailable = st.remainingQty + (isEditingThis ? (qtyMap[`${itemName}:${st.size}`] || 0) : 0);
                                const isDisabled = maxAvailable <= 0 && !isSelected;

                                return (
                                  <button
                                    key={st.size}
                                    type="button"
                                    disabled={isDisabled}
                                    onClick={() => toggleItemSizeSelection(itemName, st.size)}
                                    className={`btn btn-sm ${isSelected ? 'btn-primary' : 'btn-ghost'}`}
                                    style={{ fontSize: 11, opacity: isDisabled ? 0.5 : 1 }}
                                  >
                                    {st.size} ({maxAvailable} left)
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

                {/* Per-item quantity input */}
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
                <button type="button" className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? <LoadingGecko size="inline" label="Saving allocation…" /> : 'Save Allocation'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
