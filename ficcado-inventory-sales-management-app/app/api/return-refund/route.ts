/**
 * app/api/return-refund/route.ts
 * GET  /api/return-refund — list all return/refund records
 * POST /api/return-refund — create a new return/refund record
 */

import { requireAuth } from '@/lib/auth';
import { readAllRows, appendRows } from '@/lib/google/moduleSheet';
import { validate, ReturnRefundSchema } from '@/lib/validation';
import { logActivity } from '@/lib/activityLogger';

export const dynamic = 'force-dynamic';

const COL = {
  sno:                 0,
  invoiceNumber:       1,
  verificationStatus:  2,
  refundStatus:        3,
  refundAmount:        4,
  refundCompletedAt:   5,
  transactionId:       6,
  modeOfRefund:        7,
  disposition:         8,
  restockDestination:  9,
  createdAt:           10,
  createdBy:           11,
  updatedAt:           12,
  updatedBy:           13,
  version:             14,
};

export async function GET() {
  try { await requireAuth(); }
  catch (e) { if (e instanceof Response) return e; return Response.json({ error: 'Authentication required.' }, { status: 401 }); }

  try {
    const rows = await readAllRows('return_refund');
    const records = rows.slice(1).map((row, i) => ({
      rowIndex:           i + 2,
      invoiceNumber:      row[COL.invoiceNumber]      ?? '',
      verificationStatus: row[COL.verificationStatus] ?? '',
      refundStatus:       row[COL.refundStatus]       ?? '',
      refundAmount:       row[COL.refundAmount]       ?? '',
      refundCompletedAt:  row[COL.refundCompletedAt]  ?? '',
      transactionId:      row[COL.transactionId]      ?? '',
      modeOfRefund:       row[COL.modeOfRefund]       ?? '',
      disposition:        row[COL.disposition]        ?? '',
      restockDestination: row[COL.restockDestination] ?? '',
      createdAt:          row[COL.createdAt]           ?? '',
      createdBy:          row[COL.createdBy]           ?? '',
      updatedAt:          row[COL.updatedAt]           ?? '',
      updatedBy:          row[COL.updatedBy]           ?? '',
      version:            row[COL.version]             ?? '1',
    })).filter((r) => r.invoiceNumber);
    return Response.json({ records });
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
    const sno = String(rows.length);
    const now = new Date().toISOString();

    await appendRows('return_refund', [[
      sno, invoiceNumber, itemVerificationStatus, refundStatus,
      String(refundAmount), refundCompletedAt ?? '', transactionId ?? '',
      modeOfRefund, now, admin.name, now, admin.name, '1',
    ]]);

    await logActivity({ adminName: admin.name, action: 'created', module: 'Return/Refund Management', moduleKey: 'return_refund', recordId: invoiceNumber });
    return Response.json({ success: true, message: `Return/Refund for ${invoiceNumber} created.` }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return Response.json({ error: "Couldn't create return/refund record.", detail: message }, { status: 500 });
  }
}
