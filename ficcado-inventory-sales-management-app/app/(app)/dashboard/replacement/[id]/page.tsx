'use client';

/**
 * app/(app)/dashboard/replacement/[id]/page.tsx
 * Dedicated Replacement Handling & Completion Page.
 *
 * Adheres strictly to Ficcado Design System (docs/DESIGN.md).
 * Includes:
 * - Step 1: Select Old Item(s) to Exchange
 * - Step 2: Select New Replacement Items & Quantities
 * - Step 3: Select New Stock Source Location
 * - Step 4: Mandatory Old Item Disposition & Restock Destination
 * - Step 5: Optional Delivery Charge & Discount Customization
 * - Bottom Summary: New Final Order Basket Breakdown Table & Totals (Subtotal, Discount, Delivery, Grand Total)
 */

import { useEffect, useState, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import LoadingGecko from '@/components/LoadingGecko';
import ErrorMessage, { parseApiError } from '@/components/ErrorMessage';
import MobileBackButton from '@/components/MobileBackButton';
import { calculateSaleTotalAmount } from '@/lib/salesPricing';

interface ReplacementRecord {
  rowIndex: number;
  invoiceNumber: string;
  totalItems: string;
  lastItems: string;
  lastSizes: string;
  newItems: string;
  newSizes: string;
  invoiceStatus: string;
  disposition: string;
  restockDestination: string;
  removedItemFromLastPurchase?: string;
  sizesOfRemovedItemFromLastPurchase?: string;
  numberOfRemovedItemFromLastPurchase?: string;
  newFinalItemsSelected?: string;
  newFinalItemsSizes?: string;
  numberOfNewFinalItems?: string;
  newFinalItemsPricesEach?: string;
  newFinalItemsTotalAmount?: string;
  newStockSource?: string;
  newDeliveryCharge?: string;
  newDiscount?: string;
  createdAt: string;
  createdBy: string;
  version: string;
}

interface SaleDetails {
  invoiceNumber: string;
  customerName: string;
  totalAmount: string;
  itemNames: string;
  sizes: string;
  saleStatus: string;
  deliveryStatus: string;
  discount?: number;
  deliveryChargeToggle?: boolean;
  deliveryChargeAmount?: number;
}

interface InventoryStockItem {
  itemName: string;
  size: string;
  qty: number;
}

interface WarehouseStockItem {
  handler: string;
  location: string;
  itemName: string;
  size: string;
  qty: number;
}

interface SelectedNewItem {
  itemName: string;
  size: string;
  qty: number;
  unitPrice: number;
}

export default function ReplacementDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const invoiceNumber = decodeURIComponent(resolvedParams.id);
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [error, setError] = useState<{ message: string } | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [record, setRecord] = useState<ReplacementRecord | null>(null);
  const [saleDetails, setSaleDetails] = useState<SaleDetails | null>(null);
  const [availableInventory, setAvailableInventory] = useState<InventoryStockItem[]>([]);
  const [warehouseStock, setWarehouseStock] = useState<WarehouseStockItem[]>([]);
  const [admins, setAdmins] = useState<string[]>([]);
  const [catalogPrices, setCatalogPrices] = useState<Record<string, number>>({});

  // Pre-populated state
  const [selectedOldIndices, setSelectedOldIndices] = useState<number[]>([]);
  const [selectedNewItems, setSelectedNewItems] = useState<SelectedNewItem[]>([]);
  const [disposition, setDisposition] = useState<'Returned to Inventory' | 'Sent to Damaged Products'>('Returned to Inventory');
  const [restockDestination, setRestockDestination] = useState('Inventory Only');
  const [newStockSource, setNewStockSource] = useState('Main Inventory');
  const [statusVal, setStatusVal] = useState('Replacement Approved');

  // Step 5: Delivery Charge & Discount Customization
  const [replaceDeliveryToggle, setReplaceDeliveryToggle] = useState(false);
  const [newDeliveryChargeVal, setNewDeliveryChargeVal] = useState('0');

  const [replaceDiscountToggle, setReplaceDiscountToggle] = useState(false);
  const [newDiscountVal, setNewDiscountVal] = useState('0');

  async function loadDetails() {
    setLoading(true);
    setError(null);
    try {
      const [res, itemsRes] = await Promise.all([
        fetch(`/api/replacement/${encodeURIComponent(invoiceNumber)}`),
        fetch('/api/items').catch(() => null),
      ]);

      const data = await res.json();
      if (!res.ok) { setError(parseApiError(data)); return; }

      if (itemsRes && itemsRes.ok) {
        const itemsData = await itemsRes.json();
        if (itemsData.items && Array.isArray(itemsData.items)) {
          const pMap: Record<string, number> = {};
          itemsData.items.forEach((it: any) => {
            if (it.itemName && it.price) pMap[it.itemName.toLowerCase().trim()] = parseFloat(it.price) || 0;
          });
          setCatalogPrices(pMap);
        }
      }

      setRecord(data.replacement);
      setSaleDetails(data.saleDetails);
      setAvailableInventory(data.availableInventory || []);
      setWarehouseStock(data.warehouseStock || []);
      setAdmins(data.admins || []);

      const r = data.replacement as ReplacementRecord;
      if (r) {
        setStatusVal(r.invoiceStatus || 'Replacement Approved');
        if (r.disposition) setDisposition(r.disposition as any);
        if (r.restockDestination) setRestockDestination(r.restockDestination);
        if (r.newStockSource) setNewStockSource(r.newStockSource);

        if (r.newDeliveryCharge !== undefined && r.newDeliveryCharge !== '') {
          setReplaceDeliveryToggle(true);
          setNewDeliveryChargeVal(r.newDeliveryCharge);
        }
        if (r.newDiscount !== undefined && r.newDiscount !== '') {
          setReplaceDiscountToggle(true);
          setNewDiscountVal(r.newDiscount);
        }
      }

      // Pre-select old items (ONLY if previously saved by admin)
      if (data.saleDetails && data.saleDetails.itemNames) {
        const saleItemNames = data.saleDetails.itemNames.split(',').map((s: string) => s.trim());
        const saleItemSizes = (data.saleDetails.sizes || '').split(',').map((s: string) => s.trim());

        const removedNamesStr = r?.removedItemFromLastPurchase || '';
        const removedSizesStr = r?.sizesOfRemovedItemFromLastPurchase || '';
        const removedQtysStr  = r?.numberOfRemovedItemFromLastPurchase || '';

        const initialIndices: number[] = [];

        if (removedNamesStr.trim()) {
          const removedNames = removedNamesStr.split(',').map((s: string) => s.trim());
          const removedSizes = removedSizesStr.split(',').map((s: string) => s.trim());
          const removedQtys  = removedQtysStr.split(',').map((s: string) => parseInt(s.trim(), 10) || 1);

          const usedIndices = new Set<number>();

          removedNames.forEach((remName: string, i: number) => {
            const remSize = removedSizes[i] || '';
            let needed = removedQtys[i] || 1;

            saleItemNames.forEach((name: string, idx: number) => {
              if (needed <= 0 || usedIndices.has(idx)) return;
              const size = saleItemSizes[idx] || '';

              const nameMatch = name.toLowerCase() === remName.toLowerCase();
              const sizeMatch = !remSize || size.toLowerCase() === remSize.toLowerCase();

              if (nameMatch && sizeMatch) {
                usedIndices.add(idx);
                initialIndices.push(idx);
                needed--;
              }
            });
          });
        }

        setSelectedOldIndices(initialIndices);
      }

      // Pre-populate saved new replacement items (ONLY if previously saved by admin)
      if (r) {
        const newNamesStr = r.newItems || '';
        const newSizesStr = r.newSizes || '';

        const finalNamesArr  = (r.newFinalItemsSelected || '').split(',').map((s: string) => s.trim().toLowerCase());
        const finalSizesArr  = (r.newFinalItemsSizes || '').split(',').map((s: string) => s.trim().toLowerCase());
        const finalPricesArr = (r.newFinalItemsPricesEach || '').split(',').map((s: string) => parseFloat(s.trim()) || 0);

        let issuedItemsArr: { name: string; size: string; unitPrice: number }[] = [];

        if (newNamesStr.trim()) {
          const names = newNamesStr.split(',').map((s: string) => s.trim());
          const sizes = newSizesStr.split(',').map((s: string) => s.trim());

          names.forEach((n: string, i: number) => {
            if (n) {
              const sz = sizes[i] || sizes[0] || 'M';
              issuedItemsArr.push({ name: n, size: sz, unitPrice: 0 });
            }
          });
        }

        // Fallback for legacy rows: compute extra items from newFinalItemsSelected minus retained items
        if (r.newFinalItemsSelected && r.newFinalItemsSelected.trim() && data.saleDetails && data.saleDetails.itemNames) {
          const saleItemNames = data.saleDetails.itemNames.split(',').map((s: string) => s.trim());
          const saleItemSizes = (data.saleDetails.sizes || '').split(',').map((s: string) => s.trim());

          const removedNamesStr = r.removedItemFromLastPurchase || '';
          const removedSizesStr = r.sizesOfRemovedItemFromLastPurchase || '';
          const removedQtysStr  = r.numberOfRemovedItemFromLastPurchase || '';

          const retainedList = saleItemNames.map((n: string, idx: number) => ({
            name: n,
            size: saleItemSizes[idx] || 'M',
          }));

          if (removedNamesStr.trim()) {
            const remNames = removedNamesStr.split(',').map((s: string) => s.trim());
            const remSizes = removedSizesStr.split(',').map((s: string) => s.trim());
            const remQtys  = removedQtysStr.split(',').map((s: string) => parseInt(s.trim(), 10) || 1);

            remNames.forEach((remName: string, i: number) => {
              const remSize = remSizes[i] || '';
              let needed = remQtys[i] || 1;
              for (let k = 0; k < retainedList.length && needed > 0; k++) {
                if (
                  retainedList[k].name.toLowerCase() === remName.toLowerCase() &&
                  (!remSize || retainedList[k].size.toLowerCase() === remSize.toLowerCase())
                ) {
                  retainedList.splice(k, 1);
                  k--;
                  needed--;
                }
              }
            });
          }

          const extraIssued: { name: string; size: string; unitPrice: number }[] = [];
          const tempRetained = [...retainedList];

          finalNamesArr.forEach((fn: string, k: number) => {
            const fsz = finalSizesArr[k] || 'm';
            const fprice = finalPricesArr[k] || 0;

            let matchedIdx = -1;
            for (let rIdx = 0; rIdx < tempRetained.length; rIdx++) {
              if (
                tempRetained[rIdx].name.toLowerCase() === fn &&
                tempRetained[rIdx].size.toLowerCase() === fsz
              ) {
                matchedIdx = rIdx;
                break;
              }
            }

            if (matchedIdx >= 0) {
              tempRetained.splice(matchedIdx, 1);
            } else {
              const origNames = (r.newItems || '').split(',').map((s: string) => s.trim());
              const origSizes = (r.newSizes || '').split(',').map((s: string) => s.trim());
              const matchName = origNames.find((n: string) => n.toLowerCase() === fn) || fn;
              const matchSize = origSizes.find((s: string) => s.toLowerCase() === fsz) || fsz.toUpperCase();
              extraIssued.push({ name: matchName, size: matchSize, unitPrice: fprice });
            }
          });

          if (extraIssued.length > issuedItemsArr.length) {
            issuedItemsArr = extraIssued;
          }
        }

        if (issuedItemsArr.length > 0) {
          const newItemsMap = new Map<string, SelectedNewItem>();

          issuedItemsArr.forEach((item) => {
            const key = `${item.name.toLowerCase()}:::${item.size.toLowerCase()}`;

            let itemPrice = item.unitPrice;
            if (!itemPrice) {
              const finalIdx = finalNamesArr.findIndex(
                (fn: string, k: number) => fn === item.name.toLowerCase() && (finalSizesArr[k] || '') === item.size.toLowerCase()
              );
              if (finalIdx >= 0 && finalPricesArr[finalIdx] > 0) {
                itemPrice = finalPricesArr[finalIdx];
              } else if (catalogPrices[item.name.toLowerCase()]) {
                itemPrice = catalogPrices[item.name.toLowerCase()];
              }
            }

            if (newItemsMap.has(key)) {
              const existing = newItemsMap.get(key)!;
              existing.qty += 1;
              if (itemPrice > 0 && (!existing.unitPrice || existing.unitPrice === 0)) {
                existing.unitPrice = itemPrice;
              }
            } else {
              newItemsMap.set(key, {
                itemName:  item.name,
                size:      item.size,
                qty:       1,
                unitPrice: itemPrice,
              });
            }
          });

          setSelectedNewItems(Array.from(newItemsMap.values()));
        } else {
          setSelectedNewItems([]);
        }
      }
    } catch {
      setError({ message: "Couldn't load replacement details." });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadDetails(); }, [invoiceNumber]);

  function toggleOldItemIndex(idx: number) {
    if (selectedOldIndices.includes(idx)) {
      setSelectedOldIndices(selectedOldIndices.filter((i) => i !== idx));
    } else {
      setSelectedOldIndices([...selectedOldIndices, idx]);
    }
  }

  const getSelectedOldItems = (): { itemName: string; size: string; qty: number }[] => {
    if (!saleDetails || !saleDetails.itemNames) return [];
    const itemNamesArr = saleDetails.itemNames.split(',').map((s: string) => s.trim());
    const sizesArr = saleDetails.sizes.split(',').map((s: string) => s.trim());

    return selectedOldIndices.map((idx) => ({
      itemName: itemNamesArr[idx] || '',
      size: sizesArr[idx] || 'M',
      qty: 1,
    })).filter((i) => i.itemName);
  };

  function handleAddNewItemChoice(key: string) {
    const [itemName, size] = key.split(':');
    if (!itemName || !size) return;
    if (!selectedNewItems.some((i) => i.itemName === itemName && i.size === size)) {
      const price = catalogPrices[itemName.toLowerCase()] || 0;
      setSelectedNewItems([...selectedNewItems, { itemName, size, qty: 1, unitPrice: price }]);
    }
  }

  function updateNewItemQty(itemName: string, size: string, delta: number) {
    setSelectedNewItems(selectedNewItems.map((i) => {
      if (i.itemName === itemName && i.size === size) {
        return { ...i, qty: Math.max(1, i.qty + delta) };
      }
      return i;
    }));
  }

  function updateNewItemPrice(itemName: string, size: string, price: number) {
    setSelectedNewItems(selectedNewItems.map((i) => {
      if (i.itemName === itemName && i.size === size) {
        return { ...i, unitPrice: Math.max(0, price) };
      }
      return i;
    }));
  }

  function removeNewItemChoice(itemName: string, size: string) {
    setSelectedNewItems(selectedNewItems.filter((i) => !(i.itemName === itemName && i.size === size)));
  }

  // 1. Calculate retained items from immutable original purchase record
  const origItemNamesArr = record?.lastItems
    ? record.lastItems.split(',').map((s) => s.trim()).filter(Boolean)
    : (saleDetails?.itemNames ? saleDetails.itemNames.split(',').map((s) => s.trim()).filter(Boolean) : []);

  const origSizesArr = record?.lastSizes
    ? record.lastSizes.split(',').map((s) => s.trim()).filter(Boolean)
    : (saleDetails?.sizes ? saleDetails.sizes.split(',').map((s) => s.trim()).filter(Boolean) : []);

  const originalBasket = origItemNamesArr.map((name, idx) => ({
    name,
    size: origSizesArr[idx] || 'M',
    originalIdx: idx,
  }));

  // Filter out items selected for replacement
  const retainedBasket = originalBasket.filter((item) => !selectedOldIndices.includes(item.originalIdx));

  // Combine retained items + new replacement items into new final basket
  const finalOrderBasketLines: { name: string; size: string; qty: number; unitPrice: number; isReplacement: boolean }[] = [];

  retainedBasket.forEach((item) => {
    const catalogPrice = catalogPrices[item.name.toLowerCase()] || 0;
    const existing = finalOrderBasketLines.find((f) => !f.isReplacement && f.name.toLowerCase() === item.name.toLowerCase() && f.size === item.size);
    if (existing) {
      existing.qty += 1;
    } else {
      finalOrderBasketLines.push({
        name: item.name,
        size: item.size,
        qty: 1,
        unitPrice: catalogPrice,
        isReplacement: false,
      });
    }
  });

  selectedNewItems.forEach((item) => {
    finalOrderBasketLines.push({
      name: item.itemName,
      size: item.size,
      qty: item.qty,
      unitPrice: item.unitPrice,
      isReplacement: true,
    });
  });

  const finalBasketSubtotal = finalOrderBasketLines.reduce((sum, line) => sum + (line.unitPrice * line.qty), 0);

  // Pricing calculations
  const effectiveDiscount = replaceDiscountToggle
    ? (parseFloat(newDiscountVal || '0') || 0)
    : (saleDetails?.discount || 0);

  const effectiveDeliveryCharge = replaceDeliveryToggle
    ? (parseFloat(newDeliveryChargeVal || '0') || 0)
    : (saleDetails?.deliveryChargeToggle ? (saleDetails?.deliveryChargeAmount || 0) : 0);

  const grandTotalCalc = calculateSaleTotalAmount({
    items: finalBasketSubtotal,
    discount: effectiveDiscount,
    deliveryCharge: effectiveDeliveryCharge,
  });

  function validateFormFields(): string | null {
    const oldItems = getSelectedOldItems();
    if (oldItems.length === 0) return 'Select at least one old item to replace.';
    if (selectedNewItems.length === 0) return 'Select at least one new replacement item.';
    if (!disposition) return 'Mandatory disposition selection is required.';
    if (!restockDestination && disposition === 'Returned to Inventory') return 'Restock Destination is required.';
    if (!newStockSource) return 'Select a valid new stock dispatch location.';

    // Stock availability validation
    for (const newItem of selectedNewItems) {
      let availQty = 0;
      if (newStockSource === 'Main Inventory' || newStockSource === 'Inventory Only') {
        const found = availableInventory.find((i) => i.itemName.toLowerCase() === newItem.itemName.toLowerCase() && i.size === newItem.size);
        availQty = found ? found.qty : 0;
        if (availQty < newItem.qty) {
          return `Main Inventory does not have sufficient stock for '${newItem.itemName} (Size ${newItem.size})'. Available: ${availQty} piece(s), Requested: ${newItem.qty}.`;
        }
      } else {
        const matches = warehouseStock.filter(
          (w) => w.handler.trim().toLowerCase() === newStockSource.trim().toLowerCase() &&
            w.itemName.toLowerCase() === newItem.itemName.toLowerCase() &&
            w.size === newItem.size
        );
        availQty = matches.reduce((sum, w) => sum + w.qty, 0);
        if (availQty < newItem.qty) {
          return `Handler '${newStockSource}' does not have sufficient stock for '${newItem.itemName} (Size ${newItem.size})' in their warehouse allocation. Available: ${availQty} piece(s), Requested: ${newItem.qty}.`;
        }
      }
    }

    return null;
  }

  async function handleSaveChanges() {
    if (!record) return;

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch(`/api/replacement/${encodeURIComponent(invoiceNumber)}`, {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          version:                     record.version,
          oldItemsToReplace:           getSelectedOldItems(),
          newItemsChosen:              selectedNewItems,
          disposition,
          restockDestination:          disposition === 'Returned to Inventory' ? restockDestination : undefined,
          newStockSource,
          invoiceStatus:               statusVal,
          newDeliveryCharge:           replaceDeliveryToggle ? newDeliveryChargeVal : undefined,
          newDiscount:                 replaceDiscountToggle ? newDiscountVal : undefined,
          replaceDeliveryChargeToggle: replaceDeliveryToggle,
          replaceDiscountToggle:       replaceDiscountToggle,
          action:                      'draft',
        }),
      });

      const data = await res.json();
      if (!res.ok) { setError(parseApiError(data)); return; }

      setSuccess('Replacement progress & updated totals saved successfully.');
      loadDetails();
    } catch {
      setError({ message: "Couldn't save replacement draft." });
    } finally {
      setSaving(false);
    }
  }

  async function handleMarkCompleted() {
    if (!record) return;
    const valErr = validateFormFields();
    if (valErr) {
      setError({ message: `Cannot complete replacement: ${valErr}` });
      return;
    }

    setCompleting(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch(`/api/replacement/${encodeURIComponent(invoiceNumber)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          version:                     record.version,
          oldItemsToReplace:           getSelectedOldItems(),
          newItemsChosen:              selectedNewItems,
          disposition,
          restockDestination:          disposition === 'Returned to Inventory' ? restockDestination : undefined,
          newStockSource,
          invoiceStatus:               'Satisfied / Completed Order',
          newDeliveryCharge:           replaceDeliveryToggle ? newDeliveryChargeVal : undefined,
          newDiscount:                 replaceDiscountToggle ? newDiscountVal : undefined,
          replaceDeliveryChargeToggle: replaceDeliveryToggle,
          replaceDiscountToggle:       replaceDiscountToggle,
          action:                      'complete',
        }),
      });

      const data = await res.json();
      if (!res.ok) { setError(parseApiError(data)); return; }

      router.push('/dashboard/replacement');
    } catch {
      setError({ message: "Couldn't complete replacement." });
    } finally {
      setCompleting(false);
    }
  }

  async function handleDelete() {
    if (!confirm(`Delete replacement record for invoice '${invoiceNumber}'?`)) return;
    try {
      const res = await fetch(`/api/replacement/${encodeURIComponent(invoiceNumber)}`, { method: 'DELETE' });
      if (!res.ok) { setError({ message: 'Failed to delete record.' }); return; }
      router.push('/dashboard/replacement');
    } catch {
      setError({ message: "Couldn't delete record." });
    }
  }

  if (loading) {
    return (
      <div style={{ padding: 60, textAlign: 'center' }}>
        <LoadingGecko label="Loading replacement details & stock levels…" />
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 880, margin: '0 auto', paddingBottom: 40 }}>
      <MobileBackButton />

      {/* Top Header & Action Bar */}
      <div style={{ marginBottom: 16 }}>
        <Link href="/dashboard/replacement" style={{ fontSize: 13, textDecoration: 'none', color: 'var(--color-brand-primary)', fontWeight: 600 }}>
          ← Back to Replacement Management
        </Link>
      </div>

      <div className="page-header" style={{ alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 className="page-title" style={{ color: 'var(--color-brand-primary)' }}>
            Replacement Handling: {invoiceNumber}
          </h1>
          <div style={{ fontSize: 13, color: 'var(--color-ink-muted)', marginTop: 4 }}>
            Status: <span className="badge badge-warning">{record?.invoiceStatus || statusVal}</span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={handleDelete}
            style={{ color: 'var(--color-error)' }}
          >
            Delete
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleSaveChanges}
            disabled={saving || completing}
          >
            {saving ? <LoadingGecko size="inline" label="Saving…" /> : '💾 Save Progress'}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleMarkCompleted}
            disabled={saving || completing}
            style={{ background: 'var(--color-success)', borderColor: 'var(--color-success)', color: '#fff' }}
          >
            {completing ? <LoadingGecko size="inline" label="Completing…" /> : '✓ Replacement Completed'}
          </button>
        </div>
      </div>

      {error && <ErrorMessage message={error.message} variant="error" onDismiss={() => setError(null)} />}
      {success && <ErrorMessage message={success} variant="success" onDismiss={() => setSuccess(null)} />}

      {/* Original Sale Context Card */}
      {saleDetails && (
        <div className="card" style={{ background: 'rgba(43,98,198,0.05)', borderRadius: 10, padding: 16, marginBottom: 20 }}>
          <div style={{ fontWeight: 700, fontSize: 13, textTransform: 'uppercase', color: 'var(--color-brand-primary)', marginBottom: 8, letterSpacing: '0.04em' }}>
            Original Order Context ({saleDetails.invoiceNumber})
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, fontSize: 13 }}>
            <div><strong>Customer:</strong> {saleDetails.customerName}</div>
            <div><strong>Original Total:</strong> <span className="tabular-nums">₹{saleDetails.totalAmount}</span></div>
            <div><strong>Original Items:</strong> {saleDetails.itemNames} ({saleDetails.sizes})</div>
            <div><strong>Order Status:</strong> <span className="badge badge-neutral">{saleDetails.saleStatus}</span></div>
          </div>
        </div>
      )}

      {/* Replacement Edit Form Container */}
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 20, marginBottom: 24 }}>
        {/* Step 1: Select Old Items to Exchange */}
        <div className="form-group">
          <label className="form-label" style={{ fontWeight: 700, fontSize: 14 }}>
            Step 1: Select Old Item(s) to Exchange (Removed from Last Purchase) *
          </label>
          {saleDetails && saleDetails.itemNames ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 12, border: '1px solid var(--color-border)', borderRadius: 8, background: '#fff' }}>
              {saleDetails.itemNames.split(',').map((it: string, idx: number) => {
                const sz = saleDetails.sizes.split(',')[idx]?.trim() || 'M';
                const name = it.trim();
                const isChecked = selectedOldIndices.includes(idx);
                return (
                  <label key={idx} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 13 }}>
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggleOldItemIndex(idx)}
                    />
                    <span><strong>{name}</strong> — Size {sz}</span>
                  </label>
                );
              })}
            </div>
          ) : (
            <div style={{ fontSize: 13, color: 'var(--color-ink-muted)' }}>Items: {record?.lastItems}</div>
          )}
        </div>

        {/* Step 2: Select New Replacement Items */}
        <div className="form-group">
          <label className="form-label" style={{ fontWeight: 700, fontSize: 14 }}>
            Step 2: Select New Replacement Final Item(s) & Quantities *
          </label>
          <select
            className="form-select"
            onChange={(e) => { handleAddNewItemChoice(e.target.value); e.target.value = ''; }}
          >
            <option value="">-- Choose replacement item from live inventory --</option>
            {availableInventory.map((inv) => (
              <option key={`${inv.itemName}:${inv.size}`} value={`${inv.itemName}:${inv.size}`}>
                {inv.itemName} — Size {inv.size} ({inv.qty} available)
              </option>
            ))}
          </select>

          {selectedNewItems.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
              {selectedNewItems.map((item) => (
                <div
                  key={`${item.itemName}:${item.size}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 14px',
                    border: '1px solid var(--color-border)',
                    borderRadius: 8,
                    background: '#fff',
                    flexWrap: 'wrap',
                    gap: 10,
                  }}
                >
                  <div>
                    <span style={{ fontWeight: 700, fontSize: 13 }}>{item.itemName}</span>
                    <span className="badge badge-neutral" style={{ marginLeft: 8, fontSize: 11 }}>Size {item.size}</span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 12, color: 'var(--color-ink-muted)' }}>Qty:</span>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        style={{ padding: '2px 8px', height: 26, minWidth: 26 }}
                        onClick={() => updateNewItemQty(item.itemName, item.size, -1)}
                      >
                        -
                      </button>
                      <span style={{ fontWeight: 700, fontSize: 13, minWidth: 20, textAlign: 'center' }}>{item.qty}</span>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        style={{ padding: '2px 8px', height: 26, minWidth: 26 }}
                        onClick={() => updateNewItemQty(item.itemName, item.size, 1)}
                      >
                        +
                      </button>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 12, color: 'var(--color-ink-muted)' }}>Price each: ₹</span>
                      <input
                        type="number"
                        className="form-input"
                        style={{ width: 80, padding: '4px 8px', fontSize: 13 }}
                        value={item.unitPrice || 0}
                        onChange={(e) => updateNewItemPrice(item.itemName, item.size, parseFloat(e.target.value) || 0)}
                      />
                    </div>

                    <div style={{ fontWeight: 700, fontSize: 13, minWidth: 80, textAlign: 'right' }} className="tabular-nums">
                      Subtotal: ₹{(item.unitPrice * item.qty).toLocaleString('en-IN')}
                    </div>

                    <button
                      type="button"
                      onClick={() => removeNewItemChoice(item.itemName, item.size)}
                      style={{ background: 'none', border: 'none', color: 'var(--color-error)', cursor: 'pointer', fontWeight: 700, fontSize: 16 }}
                    >
                      ×
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Step 3: New Stock Source Location */}
        <div className="form-group" style={{ background: 'rgba(43,98,198,0.05)', padding: 14, borderRadius: 8, border: '1px solid var(--color-border)' }}>
          <label className="form-label" style={{ fontWeight: 700, color: 'var(--color-brand-primary)' }}>
            Step 3: New Stock Dispatch Location (Source) *
          </label>
          <select
            className="form-select"
            value={newStockSource}
            onChange={(e) => setNewStockSource(e.target.value)}
          >
            <option value="Main Inventory">Main Inventory (Unassigned Main Stock)</option>
            {admins.map((adm) => (
              <option key={adm} value={adm}>Handler: {adm}</option>
            ))}
          </select>

          {selectedNewItems.length > 0 && (
            <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px dashed var(--color-border)' }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--color-ink-muted)', marginBottom: 6 }}>
                Stock Check ({newStockSource}):
              </div>
              {selectedNewItems.map((item) => {
                let availQty = 0;
                if (newStockSource === 'Main Inventory' || newStockSource === 'Inventory Only') {
                  const found = availableInventory.find((i) => i.itemName.toLowerCase() === item.itemName.toLowerCase() && i.size === item.size);
                  availQty = found ? found.qty : 0;
                } else {
                  const matches = warehouseStock.filter(
                    (w) => w.handler.trim().toLowerCase() === newStockSource.trim().toLowerCase() &&
                      w.itemName.toLowerCase() === item.itemName.toLowerCase() &&
                      w.size === item.size
                  );
                  availQty = matches.reduce((sum, w) => sum + w.qty, 0);
                }
                const isEnough = availQty >= item.qty;
                return (
                  <div key={item.itemName + item.size} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12, marginTop: 4 }}>
                    <span>• {item.itemName} (Size {item.size}) — {item.qty} requested</span>
                    <span className={`badge ${isEnough ? 'badge-success' : 'badge-danger'}`}>
                      {isEnough ? `✓ ${availQty} piece(s) available` : `✕ Only ${availQty} in stock`}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Step 4: Mandatory Old Item Disposition */}
        <div className="form-group" style={{ background: 'rgba(255,152,0,0.06)', padding: 14, borderRadius: 8, border: '1px solid rgba(255,152,0,0.25)' }}>
          <label className="form-label" style={{ fontWeight: 700, color: '#e65100' }}>
            Step 4: Mandatory Old Item Disposition *
          </label>
          <div style={{ display: 'flex', gap: 20, marginTop: 8 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
              <input
                type="radio"
                name="disposition"
                value="Returned to Inventory"
                checked={disposition === 'Returned to Inventory'}
                onChange={() => setDisposition('Returned to Inventory')}
              />
              Return to Inventory / Warehouse Stock
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
              <input
                type="radio"
                name="disposition"
                value="Sent to Damaged Products"
                checked={disposition === 'Sent to Damaged Products'}
                onChange={() => setDisposition('Sent to Damaged Products')}
              />
              Send to Damaged Products Log
            </label>
          </div>

          {disposition === 'Returned to Inventory' && (
            <div className="form-group" style={{ marginTop: 12, margin: 0 }}>
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

        {/* Step 5: Delivery Charge & Discount Customization */}
        <div className="form-group" style={{ background: 'var(--color-surface)', padding: 16, borderRadius: 8, border: '1px solid var(--color-border)' }}>
          <label className="form-label" style={{ fontWeight: 700, fontSize: 14, marginBottom: 10 }}>
            Step 5: Delivery Charge & Discount Options (Optional)
          </label>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Delivery Charge Toggle */}
            <div style={{ border: '1px solid var(--color-border)', borderRadius: 6, padding: 12, background: '#fff' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
                <input
                  type="checkbox"
                  checked={replaceDeliveryToggle}
                  onChange={(e) => setReplaceDeliveryToggle(e.target.checked)}
                />
                <span>Do you want to update or replace the current delivery charge?</span>
              </label>

              {replaceDeliveryToggle && (
                <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 10, maxWidth: 280 }}>
                  <span style={{ fontSize: 12, color: 'var(--color-ink-muted)' }}>New Delivery Charge: ₹</span>
                  <input
                    type="number"
                    className="form-input"
                    value={newDeliveryChargeVal}
                    onChange={(e) => setNewDeliveryChargeVal(e.target.value)}
                    min="0"
                    step="0.01"
                    placeholder="e.g. 50"
                  />
                </div>
              )}
            </div>

            {/* Discount Toggle */}
            <div style={{ border: '1px solid var(--color-border)', borderRadius: 6, padding: 12, background: '#fff' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
                <input
                  type="checkbox"
                  checked={replaceDiscountToggle}
                  onChange={(e) => setReplaceDiscountToggle(e.target.checked)}
                />
                <span>Do you want to update or apply a discount?</span>
              </label>

              {replaceDiscountToggle && (
                <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 10, maxWidth: 280 }}>
                  <span style={{ fontSize: 12, color: 'var(--color-ink-muted)' }}>New Discount Amount: ₹</span>
                  <input
                    type="number"
                    className="form-input"
                    value={newDiscountVal}
                    onChange={(e) => setNewDiscountVal(e.target.value)}
                    min="0"
                    step="0.01"
                    placeholder="e.g. 100"
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Step 6: Status Progression */}
        <div className="form-group">
          <label className="form-label" style={{ fontWeight: 700 }}>
            Status Progression
          </label>
          <select className="form-select" value={statusVal} onChange={(e) => setStatusVal(e.target.value)}>
            <option value="Replacement Approved">Replacement Approved</option>
            <option value="Replacement Dispatched">Replacement Dispatched</option>
            <option value="Replacement Received">Replacement Received</option>
            <option value="Satisfied / Completed Order">Satisfied / Completed Order (Unlocks Sale)</option>
          </select>
        </div>
      </div>

      {/* ── BOTTOM SUMMARY SECTION (DESIGN.md Styled Breakdown Table & Totals) ─────────── */}
      <div className="card" style={{ background: 'var(--color-surface)', borderRadius: 10, border: '1.5px solid var(--color-border)' }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 16, color: 'var(--color-ink)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>📊 New Final Order Summary Breakdown</span>
        </h2>
        <p style={{ fontSize: 12.5, color: 'var(--color-ink-muted)', marginBottom: 16 }}>
          Live summary table showing the resulting final order basket (retained items + new replacements), item pricing, discounts, delivery charges, and updated total amount.
        </p>

        {/* Breakdown Table */}
        <div style={{ overflowX: 'auto', marginBottom: 16 }}>
          <table className="table" style={{ width: '100%', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'rgba(43,98,198,0.04)' }}>
                <th style={{ textAlign: 'left' }}>Item Name</th>
                <th style={{ textAlign: 'center' }}>Size</th>
                <th style={{ textAlign: 'center' }}>Quantity</th>
                <th style={{ textAlign: 'right' }}>Price per Item</th>
                <th style={{ textAlign: 'right' }}>Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {finalOrderBasketLines.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', color: 'var(--color-ink-muted)', padding: 20 }}>
                    No items selected in final order.
                  </td>
                </tr>
              ) : (
                finalOrderBasketLines.map((line, idx) => (
                  <tr key={idx}>
                    <td>
                      <span style={{ fontWeight: 600 }}>{line.name}</span>
                      {line.isReplacement && (
                        <span className="badge badge-info" style={{ marginLeft: 8, fontSize: 10 }}>New Replacement</span>
                      )}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <span className="badge badge-neutral" style={{ fontSize: 11 }}>{line.size}</span>
                    </td>
                    <td style={{ textAlign: 'center', fontWeight: 600 }}>{line.qty} piece(s)</td>
                    <td style={{ textAlign: 'right' }} className="tabular-nums">
                      ₹{line.unitPrice.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 700 }} className="tabular-nums">
                      ₹{(line.qty * line.unitPrice).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Totals Breakdown Block */}
        <div style={{
          borderTop: '1.5px solid var(--color-border)',
          paddingTop: 12,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-end',
          gap: 6,
          fontSize: 13,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', width: 300, color: 'var(--color-ink-muted)' }}>
            <span>Basket Subtotal:</span>
            <span className="tabular-nums" style={{ fontWeight: 600, color: 'var(--color-ink)' }}>
              ₹{finalBasketSubtotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </span>
          </div>

          {effectiveDiscount > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', width: 300, color: 'var(--color-error)' }}>
              <span>Discount Applied{replaceDiscountToggle ? ' (Updated)' : ''}:</span>
              <span className="tabular-nums" style={{ fontWeight: 600 }}>
                −₹{effectiveDiscount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </span>
            </div>
          )}

          {effectiveDeliveryCharge > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', width: 300, color: 'var(--color-ink-muted)' }}>
              <span>Delivery Charge{replaceDeliveryToggle ? ' (Updated)' : ''}:</span>
              <span className="tabular-nums" style={{ fontWeight: 600, color: 'var(--color-ink)' }}>
                +₹{effectiveDeliveryCharge.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </span>
            </div>
          )}

          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            width: 300,
            borderTop: '1.5px solid var(--color-border)',
            paddingTop: 8,
            marginTop: 4,
            fontSize: 16,
            fontWeight: 700,
            color: 'var(--color-brand-primary)',
          }}>
            <span>New Grand Total Amount:</span>
            <span className="tabular-nums">
              ₹{grandTotalCalc.grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
