/**
 * app/api/return-refund/[id]/route.ts
 * GET, PUT, DELETE for a single return/refund record
 */
import { requireAuth } from '@/lib/auth';
import { readAllRows, updateRow, deleteRow } from '@/lib/google/moduleSheet';
import { logActivity } from '@/lib/activityLogger';

export const dynamic = 'force-dynamic';
const COL = { sno: 0, invoiceNumber: 1, verificationStatus: 2, refundStatus: 3, refundAmount: 4, refundCompletedAt: 5, transactionId: 6, modeOfRefund: 7, createdAt: 8, createdBy: 9, updatedAt: 10, updatedBy: 11, version: 12 };

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try { await requireAuth(); } catch (e) { if (e instanceof Response) return e; return Response.json({ error: 'Auth required.' }, { status: 401 }); }
  try {
    const rows = await readAllRows('return_refund');
    const idx = rows.slice(1).findIndex((r) => r[COL.invoiceNumber] === id);
    if (idx === -1) return Response.json({ error: 'Return/refund record not found.' }, { status: 404 });
    const r = rows[idx + 1];
    return Response.json({ record: {
      rowIndex: idx + 2, invoiceNumber: r[COL.invoiceNumber],
      verificationStatus: r[COL.verificationStatus], refundStatus: r[COL.refundStatus],
      refundAmount: r[COL.refundAmount], refundCompletedAt: r[COL.refundCompletedAt],
      transactionId: r[COL.transactionId], modeOfRefund: r[COL.modeOfRefund],
      createdAt: r[COL.createdAt], version: r[COL.version] || '1',
    }});
  } catch (err) { return Response.json({ error: 'Failed.', detail: (err as Error).message }, { status: 500 }); }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let admin;
  try { admin = await requireAuth(); } catch (e) { if (e instanceof Response) return e; return Response.json({ error: 'Auth required.' }, { status: 401 }); }
  try {
    const body = await request.json();
    const rows = await readAllRows('return_refund');
    const idx = rows.slice(1).findIndex((r) => r[COL.invoiceNumber] === id);
    if (idx === -1) return Response.json({ error: 'Return/refund record not found.' }, { status: 404 });

    const row = rows[idx + 1];
    const currentVersion = parseInt(row[COL.version] || '1', 10);
    const clientVersion  = parseInt(body.version || '1', 10);
    if (clientVersion !== currentVersion) {
      return Response.json({ error: 'Conflict: record was updated by another admin. Reload and try again.', currentVersion }, { status: 409 });
    }

    const now = new Date().toISOString();
    await updateRow('return_refund', idx + 2, [
      row[COL.sno], row[COL.invoiceNumber],
      body.verificationStatus || row[COL.verificationStatus],
      body.refundStatus       || row[COL.refundStatus],
      String(body.refundAmount ?? row[COL.refundAmount]),
      body.refundCompletedAt  || row[COL.refundCompletedAt],
      body.transactionId      || row[COL.transactionId],
      body.modeOfRefund       || row[COL.modeOfRefund],
      row[COL.createdAt], row[COL.createdBy], now, admin.name, String(currentVersion + 1),
    ]);
    await logActivity({ adminName: admin.name, action: 'updated', module: 'Return/Refund Management', moduleKey: 'return_refund', recordId: id });
    return Response.json({ success: true, version: String(currentVersion + 1) });
  } catch (err) { return Response.json({ error: 'Failed to update return/refund.', detail: (err as Error).message }, { status: 500 }); }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let admin;
  try { admin = await requireAuth(); } catch (e) { if (e instanceof Response) return e; return Response.json({ error: 'Auth required.' }, { status: 401 }); }
  try {
    const rows = await readAllRows('return_refund');
    const idx = rows.slice(1).findIndex((r) => r[COL.invoiceNumber] === id);
    if (idx === -1) return Response.json({ error: 'Return/refund record not found.' }, { status: 404 });
    await deleteRow('return_refund', idx + 2);
    await logActivity({ adminName: admin.name, action: 'deleted', module: 'Return/Refund Management', moduleKey: 'return_refund', recordId: id });
    return Response.json({ success: true });
  } catch (err) { return Response.json({ error: 'Failed to delete return/refund.', detail: (err as Error).message }, { status: 500 }); }
}
