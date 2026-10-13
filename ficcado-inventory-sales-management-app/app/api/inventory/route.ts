/**
 * app/api/inventory/route.ts
 * GET  /api/inventory — list all inventory rows & items dropdown
 * POST /api/inventory — add or update inventory entry (Items-sourced)
 */

import { getAuthSession } from '@/lib/auth';
import { readAllRows, appendRows, updateRow } from '@/lib/google/moduleSheet';
import { buildHeaderMap, getCellByHeader, formatRowFromHeaderMap } from '@/lib/google/headerUtils';
import { validate, InventorySchema } from '@/lib/validation';
import { logActivity } from '@/lib/activityLogger';
import { recordInventoryHistory } from '@/lib/inventoryHistory';

export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await getAuthSession();
  if ('errorResponse' in auth) return auth.errorResponse;

  try {
    const [invRows, itemRows] = await Promise.all([
      readAllRows('inventory'),
      readAllRows('items'),
    ]);

    let inventory: any[] = [];
    if (invRows.length > 0) {
      const invMap = buildHeaderMap(invRows[0]);
      inventory = invRows.slice(1).map((row, i) => {
        const qtyNum = parseInt(getCellByHeader(row, invMap, 'Total Quantity Available', '0'), 10) || 0;
        const itemName = getCellByHeader(row, invMap, 'Item Name');
        return {
          rowIndex:      i + 2,
          sno:           getCellByHeader(row, invMap, 'S.No'),
          itemName,
          size:          getCellByHeader(row, invMap, 'Size'),
          qty:           qtyNum,
          addedBy:       getCellByHeader(row, invMap, 'Added By (Admin)'),
          updatedAt:     getCellByHeader(row, invMap, 'Updated At'),
          updatedBy:     getCellByHeader(row, invMap, 'Updated By (Admin)'),
          createdAt:     getCellByHeader(row, invMap, 'Created At'),
          currentStatus: qtyNum > 0 ? 'In Stock' : 'Out of Stock',
        };
      }).filter((inv) => inv.itemName);
    }

    let items: any[] = [];
    if (itemRows.length > 0) {
      const itemMap = buildHeaderMap(itemRows[0]);
      items = itemRows.slice(1).map((r) => {
        const itemName = getCellByHeader(r, itemMap, 'Item Name');
        const sizesStr = getCellByHeader(r, itemMap, 'Available Sizes');
        return {
          itemName,
          sizes:  sizesStr ? sizesStr.split(/,\s*/).filter(Boolean) : ['XS', 'S', 'M', 'L', 'XL'],
          status: getCellByHeader(r, itemMap, 'Current Status', 'In Stock'),
        };
      }).filter((it) => it.itemName);
    }

    return Response.json({ inventory, items });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return Response.json({ error: "Couldn't load inventory.", detail: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await getAuthSession();
  if ('errorResponse' in auth) return auth.errorResponse;
  const admin = auth.admin;

  try {
    const body = await request.json();
    const validation = validate(InventorySchema, body);
    if (!validation.valid) return Response.json({ error: validation.errorMessage, errors: validation.errors }, { status: 400 });

    const { itemName, size, totalQuantityAvailable } = validation.data!;

    const [invRows, itemRows] = await Promise.all([
      readAllRows('inventory'),
      readAllRows('items'),
    ]);

    const itemMap = itemRows.length > 0 ? buildHeaderMap(itemRows[0]) : new Map();
    const validItems = itemRows.slice(1).map((r) => getCellByHeader(r, itemMap, 'Item Name').trim()).filter(Boolean);
    if (!validItems.includes(itemName.trim())) {
      return Response.json(
        { error: `Item '${itemName}' does not exist in Items Management. Please select a valid item.` },
        { status: 400 }
      );
    }

    const invHeaderRow = invRows[0] || ['S.No', 'Item Name', 'Size', 'Total Quantity Available', 'Added By (Admin)', 'Updated At', 'Updated By (Admin)', 'Created At'];
    const invMap = buildHeaderMap(invHeaderRow);

    const now = new Date().toISOString();

    const existingIdx = invRows.slice(1).findIndex(
      (r) => getCellByHeader(r, invMap, 'Item Name').toLowerCase() === itemName.toLowerCase() && getCellByHeader(r, invMap, 'Size') === size
    );

    if (existingIdx >= 0) {
      const rowIndex = existingIdx + 2;
      const row = invRows[existingIdx + 1];
      const oldQty = parseInt(getCellByHeader(row, invMap, 'Total Quantity Available', '0'), 10) || 0;
      const diff = totalQuantityAvailable - oldQty;

      const invObj = {
        'S.No':                     getCellByHeader(row, invMap, 'S.No'),
        'Item Name':                 itemName,
        'Size':                      size,
        'Total Quantity Available': String(totalQuantityAvailable),
        'Added By (Admin)':          getCellByHeader(row, invMap, 'Added By (Admin)') || admin.name,
        'Updated At':                now,
        'Updated By (Admin)':        admin.name,
        'Created At':                getCellByHeader(row, invMap, 'Created At') || now,
      };

      await updateRow('inventory', rowIndex, formatRowFromHeaderMap(invObj, invHeaderRow));

      if (diff !== 0) {
        await recordInventoryHistory({
          itemName,
          size,
          quantityChange: diff,
          affectedSheet: 'Inventory',
          transactionType: 'Manual Adjustment',
          resultingBalance: totalQuantityAvailable,
          createdBy: admin.name,
          notes: 'Updated via Inventory Management Add/Update',
        });
      }

      await logActivity({ adminName: admin.name, action: 'updated', module: 'Inventory Management', moduleKey: 'inventory', recordId: `${itemName} (${size})` });
      return Response.json({ success: true, message: `Inventory for ${itemName} (${size}) updated to ${totalQuantityAvailable} piece(s).` });
    }

    const sno = String(invRows.length);
    const invObj = {
      'S.No':                     sno,
      'Item Name':                 itemName,
      'Size':                      size,
      'Total Quantity Available': String(totalQuantityAvailable),
      'Added By (Admin)':          admin.name,
      'Updated At':                now,
      'Updated By (Admin)':        admin.name,
      'Created At':                now,
    };

    await appendRows('inventory', [formatRowFromHeaderMap(invObj, invHeaderRow)]);

    if (totalQuantityAvailable > 0) {
      await recordInventoryHistory({
        itemName,
        size,
        quantityChange: totalQuantityAvailable,
        affectedSheet: 'Inventory',
        transactionType: 'Manual Adjustment',
        resultingBalance: totalQuantityAvailable,
        createdBy: admin.name,
        notes: 'Added via Inventory Management',
      });
    }

    await logActivity({ adminName: admin.name, action: 'created', module: 'Inventory Management', moduleKey: 'inventory', recordId: `${itemName} (${size})` });
    return Response.json({ success: true, message: `Inventory for ${itemName} (${size}) added (${totalQuantityAvailable} piece(s)).` }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return Response.json({ error: "Couldn't update inventory.", detail: message }, { status: 500 });
  }
}
