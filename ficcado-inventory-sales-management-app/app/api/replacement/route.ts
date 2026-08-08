/**
 * app/api/replacement/route.ts
 * GET  /api/replacement — list all replacements
 * POST /api/replacement — create replacement from an existing sale
 *
 * Updated with header-map column resolution for position-independent read/write safety.
 */

import { requireAuth } from '@/lib/auth';
import { readAllRows, appendRows } from '@/lib/google/moduleSheet';
import { buildHeaderMap, getCellByHeader, formatRowFromHeaderMap } from '@/lib/google/headerUtils';
import { validate, ReplacementSchema } from '@/lib/validation';
import { logActivity } from '@/lib/activityLogger';

export const dynamic = 'force-dynamic';

export async function GET() {
  try { await requireAuth(); }
  catch (e) { if (e instanceof Response) return e; return Response.json({ error: 'Authentication required.' }, { status: 401 }); }

  try {
    const rows = await readAllRows('replacement');
    if (rows.length === 0) return Response.json({ replacements: [] });

    const headerMap = buildHeaderMap(rows[0]);
    const replacements = rows.slice(1).map((row, i) => ({
      rowIndex:                            i + 2,
      invoiceNumber:                       getCellByHeader(row, headerMap, 'Invoice Number'),
      totalItems:                          getCellByHeader(row, headerMap, 'Total Number of Items Purchased'),
      lastItems:                           getCellByHeader(row, headerMap, 'Last Purchased Item(s)'),
      lastSizes:                           getCellByHeader(row, headerMap, 'Last Purchased Item(s) Size'),
      newItems:                            getCellByHeader(row, headerMap, 'New Item(s)'),
      newSizes:                            getCellByHeader(row, headerMap, 'New Item(s) Size'),
      invoiceStatus:                       getCellByHeader(row, headerMap, 'Invoice Status'),
      disposition:                         getCellByHeader(row, headerMap, 'Disposition of Old Items'),
      restockDestination:                  getCellByHeader(row, headerMap, 'Restock Destination'),
      removedItemFromLastPurchase:         getCellByHeader(row, headerMap, 'Removed Item from Last Purchase'),
      sizesOfRemovedItemFromLastPurchase:  getCellByHeader(row, headerMap, 'Sizes of Removed Item from Last Purchase'),
      numberOfRemovedItemFromLastPurchase: getCellByHeader(row, headerMap, 'Number of Removed Item from Last Purchase'),
      newFinalItemsSelected:               getCellByHeader(row, headerMap, 'New Final Items Selected'),
      newFinalItemsSizes:                  getCellByHeader(row, headerMap, 'New Final Items Sizes'),
      numberOfNewFinalItems:               getCellByHeader(row, headerMap, 'Number of New Final Items'),
      newFinalItemsPricesEach:             getCellByHeader(row, headerMap, 'New Final Items Prices Each'),
      newFinalItemsTotalAmount:            getCellByHeader(row, headerMap, 'New Final Items Total Amount'),
      newStockSource:                      getCellByHeader(row, headerMap, 'New Stock Source'),
      createdAt:                           getCellByHeader(row, headerMap, 'Created At'),
      createdBy:                           getCellByHeader(row, headerMap, 'Created By'),
      updatedAt:                           getCellByHeader(row, headerMap, 'Updated At'),
      updatedBy:                           getCellByHeader(row, headerMap, 'Updated By'),
      version:                             getCellByHeader(row, headerMap, 'Version', '1'),
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
    const headerRow = rows[0] || [
      'S.No', 'Invoice Number', 'Total Number of Items Purchased', 'Last Purchased Item(s)', 'Last Purchased Item(s) Size',
      'New Item(s)', 'New Item(s) Size', 'Invoice Status', 'Disposition of Old Items', 'Restock Destination',
      'Removed Item from Last Purchase', 'Sizes of Removed Item from Last Purchase', 'Number of Removed Item from Last Purchase',
      'New Final Items Selected', 'New Final Items Sizes', 'Number of New Final Items', 'New Final Items Prices Each',
      'New Final Items Total Amount', 'New Stock Source', 'Created At', 'Created By', 'Updated At', 'Updated By', 'Version'
    ];

    const sno = String(rows.length);
    const now = new Date().toISOString();

    const rowObj: Record<string, string> = {
      'S.No': sno,
      'Invoice Number': invoiceNumber,
      'Total Number of Items Purchased': String(totalNumberOfItems),
      'Last Purchased Item(s)': Array.isArray(lastPurchasedItems) ? lastPurchasedItems.join(', ') : lastPurchasedItems,
      'Last Purchased Item(s) Size': Array.isArray(lastPurchasedItemsSizes) ? lastPurchasedItemsSizes.join(', ') : lastPurchasedItemsSizes,
      'New Item(s)': Array.isArray(newItems) ? newItems.join(', ') : (newItems || ''),
      'New Item(s) Size': Array.isArray(newItemsSizes) ? newItemsSizes.join(', ') : (newItemsSizes || ''),
      'Invoice Status': invoiceStatus ?? 'Replacement Pending',
      'Created At': now,
      'Created By': admin.name,
      'Updated At': now,
      'Updated By': admin.name,
      'Version': '1',
    };

    const formattedRow = formatRowFromHeaderMap(rowObj, headerRow);
    await appendRows('replacement', [formattedRow]);

    await logActivity({ adminName: admin.name, action: 'created', module: 'Replacement Management', moduleKey: 'replacement', recordId: invoiceNumber });
    return Response.json({ success: true, message: `Replacement for ${invoiceNumber} created.` }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return Response.json({ error: "Couldn't create replacement.", detail: message }, { status: 500 });
  }
}
