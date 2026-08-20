/**
 * app/api/return-refund/route.ts
 * GET  /api/return-refund — list all return/refund records
 * POST /api/return-refund — create a new return/refund record
 *
 * Updated with header mapping lookups for position-independent safety and Part 4 schema compatibility.
 */

import { requireAuth } from '@/lib/auth';
import { readAllRows, appendRows } from '@/lib/google/moduleSheet';
import { buildHeaderMap, getCellByHeader, formatRowFromHeaderMap } from '@/lib/google/headerUtils';
import { validate, ReturnRefundSchema } from '@/lib/validation';
import { logActivity } from '@/lib/activityLogger';

export const dynamic = 'force-dynamic';

export async function GET() {
  try { await requireAuth(); }
  catch (e) { if (e instanceof Response) return e; return Response.json({ error: 'Authentication required.' }, { status: 401 }); }

  try {
    const rows = await readAllRows('return_refund');
    if (rows.length === 0) return Response.json({ records: [] });

    const headerMap = buildHeaderMap(rows[0]);
    const records = rows.slice(1).map((row, i) => {
      const rawRef = getCellByHeader(row, headerMap, 'Refund Amount');
      const priceCharged = getCellByHeader(row, headerMap, 'Price Charged (Returned Items)');
      const refNum = parseFloat(rawRef.replace(/[^0-9.]/g, '')) || 0;
      let effectiveRefund = rawRef;
      if (refNum === 0 && priceCharged) {
        const parts = priceCharged.split(',').map((p) => parseFloat(p.replace(/[^0-9.]/g, '')) || 0);
        const sum = parts.reduce((a, b) => a + b, 0);
        if (sum > 0) effectiveRefund = String(sum);
      }

      return {
        rowIndex:           i + 2,
        invoiceNumber:      getCellByHeader(row, headerMap, 'Invoice Number'),
        verificationStatus: getCellByHeader(row, headerMap, 'Item Verification Status'),
        refundStatus:       getCellByHeader(row, headerMap, 'Refund Status'),
        refundAmount:       effectiveRefund || '0',
        refundCompletedAt:  getCellByHeader(row, headerMap, 'Refund Completed Date & Time'),
      transactionId:      getCellByHeader(row, headerMap, 'Transaction ID'),
      modeOfRefund:       getCellByHeader(row, headerMap, 'Mode of Refund'),
      disposition:        getCellByHeader(row, headerMap, 'Disposition of Returned Items'),
      restockDestination: getCellByHeader(row, headerMap, 'Restock Destination'),
      returnedItems:      getCellByHeader(row, headerMap, 'Returned Item(s)'),
      returnedSizes:      getCellByHeader(row, headerMap, 'Returned Item Size(s)'),
      returnedQty:        getCellByHeader(row, headerMap, 'Returned Item Quantity(ies)'),
      priceCharged:       getCellByHeader(row, headerMap, 'Price Charged (Returned Items)'),
      newFinalItems:      getCellByHeader(row, headerMap, 'New Final Items Selected'),
      newFinalSizes:      getCellByHeader(row, headerMap, 'New Final Items Sizes'),
      newFinalQty:        getCellByHeader(row, headerMap, 'Number of New Final Items'),
      newFinalPrices:     getCellByHeader(row, headerMap, 'New Final Items Prices Each'),
      newDiscountApplied: getCellByHeader(row, headerMap, 'New Discount Applied'),
      newFinalTotalAmt:   getCellByHeader(row, headerMap, 'New Final Items Total Amount'),
      createdAt:          getCellByHeader(row, headerMap, 'Created At'),
      createdBy:          getCellByHeader(row, headerMap, 'Created By'),
      updatedAt:          getCellByHeader(row, headerMap, 'Updated At'),
      updatedBy:          getCellByHeader(row, headerMap, 'Updated By'),
      version:            getCellByHeader(row, headerMap, 'Version', '1'),
      };
    }).filter((r) => r.invoiceNumber);

    return Response.json({ records: records.reverse() });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return Response.json({ error: "Couldn't load return/refund records.", detail: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  let admin;
  try { admin = await requireAuth(); }
  catch (e) { if (e instanceof Response) return e; return Response.json({ error: 'Authentication required.' }, { status: 401 }); }

  try {
    const body = await request.json();
    const { valid, data, errors } = validate(ReturnRefundSchema, body);
    if (!valid) return Response.json({ error: 'Validation failed', errors }, { status: 400 });

    const { invoiceNumber, itemVerificationStatus, refundStatus, refundAmount,
            refundCompletedAt, transactionId, modeOfRefund } = data!;

    const rows = await readAllRows('return_refund');
    const headerRow = rows[0] || [];
    const sno = String(rows.length);
    const now = new Date().toISOString();

    const retObj: Record<string, string> = {
      'S.No': sno,
      'Invoice Number': invoiceNumber,
      'Item Verification Status': itemVerificationStatus || 'Not Received — In Transit',
      'Refund Status': refundStatus || 'Refund Pending',
      'Refund Amount': String(refundAmount),
      'Refund Completed Date & Time': refundCompletedAt ?? '',
      'Transaction ID': transactionId ?? '',
      'Mode of Refund': modeOfRefund ?? 'Cash',
      'Created At': now,
      'Created By': admin.name,
      'Updated At': now,
      'Updated By': admin.name,
      'Version': '1',
    };

    await appendRows('return_refund', [formatRowFromHeaderMap(retObj, headerRow)]);

    await logActivity({ adminName: admin.name, action: 'created', module: 'Return/Refund Management', moduleKey: 'return_refund', recordId: invoiceNumber });
    return Response.json({ success: true, message: `Return/Refund for ${invoiceNumber} created.` }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return Response.json({ error: "Couldn't create return/refund record.", detail: message }, { status: 500 });
  }
}
