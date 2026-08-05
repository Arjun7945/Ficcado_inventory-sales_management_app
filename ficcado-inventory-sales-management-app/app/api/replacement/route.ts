/**
 * app/api/replacement/route.ts
 * GET  /api/replacement — list all replacements
 * POST /api/replacement — create replacement from an existing sale
 */

import { requireAuth } from '@/lib/auth';
import { readAllRows, appendRows } from '@/lib/google/moduleSheet';
import { validate, ReplacementSchema } from '@/lib/validation';
import { logActivity } from '@/lib/activityLogger';

export const dynamic = 'force-dynamic';

const COL = {
  sno: 0, invoiceNumber: 1, totalItems: 2, lastItems: 3, lastSizes: 4,
  newItems: 5, newSizes: 6, invoiceStatus: 7, createdAt: 8, createdBy: 9,
  updatedAt: 10, updatedBy: 11, version: 12,
};

export async function GET() {
  try { await requireAuth(); }
  catch (e) { if (e instanceof Response) return e; return Response.json({ error: 'Authentication required.' }, { status: 401 }); }

  try {
    const rows = await readAllRows('replacement');
    const replacements = rows.slice(1).map((row, i) => ({
      rowIndex:      i + 2,
      invoiceNumber: row[COL.invoiceNumber] ?? '',
      totalItems:    row[COL.totalItems]    ?? '',
      lastItems:     row[COL.lastItems]     ?? '',
      lastSizes:     row[COL.lastSizes]     ?? '',
      newItems:      row[COL.newItems]      ?? '',
      newSizes:      row[COL.newSizes]      ?? '',
      invoiceStatus: row[COL.invoiceStatus] ?? '',
      createdAt:     row[COL.createdAt]     ?? '',
      createdBy:     row[COL.createdBy]     ?? '',
      updatedAt:     row[COL.updatedAt]     ?? '',
      updatedBy:     row[COL.updatedBy]     ?? '',
      version:       row[COL.version]       ?? '1',
    })).filter((r) => r.invoiceNumber);
    return Response.json({ replacements });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return Response.json({ error: "Couldn't load replacements.", detail: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  let admin;
  try { admin = await requireAuth(); }
  catch (e) { if (e instanceof Response) return e; return Response.json({ error: 'Authentication required.' }, { status: 401 }); }

  try {
    const body = await request.json();
    const { valid, data, errors } = validate(ReplacementSchema, body);
    if (!valid) return Response.json({ error: 'Validation failed', errors }, { status: 400 });

    const { invoiceNumber, totalNumberOfItems, lastPurchasedItems, lastPurchasedItemsSizes,
            newItems, newItemsSizes, invoiceStatus } = data!;

    const rows = await readAllRows('replacement');
    const sno = String(rows.length);
    const now = new Date().toISOString();

    await appendRows('replacement', [[
      sno, invoiceNumber, String(totalNumberOfItems),
      Array.isArray(lastPurchasedItems) ? lastPurchasedItems.join(', ') : lastPurchasedItems,
      Array.isArray(lastPurchasedItemsSizes) ? lastPurchasedItemsSizes.join(', ') : lastPurchasedItemsSizes,
      Array.isArray(newItems) ? newItems.join(', ') : newItems,
      Array.isArray(newItemsSizes) ? newItemsSizes.join(', ') : newItemsSizes,
      invoiceStatus ?? 'Replacement Pending',
      now, admin.name, now, admin.name, '1',
    ]]);

    await logActivity({ adminName: admin.name, action: 'created', module: 'Replacement Management', moduleKey: 'replacement', recordId: invoiceNumber });
    return Response.json({ success: true, message: `Replacement for ${invoiceNumber} created.` }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return Response.json({ error: "Couldn't create replacement.", detail: message }, { status: 500 });
  }
}
