/**
 * app/api/replacement/[id]/route.ts
 * GET, PUT, DELETE for a single replacement record
 */
import { requireAuth } from '@/lib/auth';
import { readAllRows, updateRow, deleteRow } from '@/lib/google/moduleSheet';
import { validate, ReplacementSchema } from '@/lib/validation';
import { logActivity } from '@/lib/activityLogger';

export const dynamic = 'force-dynamic';
const COL = { sno: 0, invoiceNumber: 1, totalItems: 2, lastItems: 3, lastSizes: 4, newItems: 5, newSizes: 6, invoiceStatus: 7, createdAt: 8, createdBy: 9, updatedAt: 10, updatedBy: 11, version: 12 };

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try { await requireAuth(); } catch (e) { if (e instanceof Response) return e; return Response.json({ error: 'Auth required.' }, { status: 401 }); }
  try {
    const rows = await readAllRows('replacement');
    const idx = rows.slice(1).findIndex((r) => r[COL.invoiceNumber] === id);
    if (idx === -1) return Response.json({ error: 'Replacement record not found.' }, { status: 404 });
    const r = rows[idx + 1];
    return Response.json({ replacement: {
      rowIndex: idx + 2, invoiceNumber: r[COL.invoiceNumber], totalItems: r[COL.totalItems],
      lastItems: r[COL.lastItems], lastSizes: r[COL.lastSizes], newItems: r[COL.newItems],
      newSizes: r[COL.newSizes], invoiceStatus: r[COL.invoiceStatus],
      createdAt: r[COL.createdAt], createdBy: r[COL.createdBy], version: r[COL.version] || '1',
    }});
  } catch (err) { return Response.json({ error: 'Failed.', detail: (err as Error).message }, { status: 500 }); }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let admin;
  try { admin = await requireAuth(); } catch (e) { if (e instanceof Response) return e; return Response.json({ error: 'Auth required.' }, { status: 401 }); }
  try {
    const body = await request.json();
    const rows = await readAllRows('replacement');
    const idx = rows.slice(1).findIndex((r) => r[COL.invoiceNumber] === id);
    if (idx === -1) return Response.json({ error: 'Replacement record not found.' }, { status: 404 });

    const row = rows[idx + 1];
    const currentVersion = parseInt(row[COL.version] || '1', 10);
    const clientVersion  = parseInt(body.version || '1', 10);
    if (clientVersion !== currentVersion) {
      return Response.json({ error: 'Conflict: record was updated by another admin. Reload and try again.', currentVersion }, { status: 409 });
    }

    const now = new Date().toISOString();
    await updateRow('replacement', idx + 2, [
      row[COL.sno], row[COL.invoiceNumber], row[COL.totalItems],
      row[COL.lastItems], row[COL.lastSizes],
      body.newItems || row[COL.newItems], body.newSizes || row[COL.newSizes],
      body.invoiceStatus || row[COL.invoiceStatus],
      row[COL.createdAt], row[COL.createdBy], now, admin.name, String(currentVersion + 1),
    ]);
    await logActivity({ adminName: admin.name, action: 'updated', module: 'Replacement Management', moduleKey: 'replacement', recordId: id });
    return Response.json({ success: true, version: String(currentVersion + 1) });
  } catch (err) { return Response.json({ error: 'Failed to update replacement.', detail: (err as Error).message }, { status: 500 }); }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let admin;
  try { admin = await requireAuth(); } catch (e) { if (e instanceof Response) return e; return Response.json({ error: 'Auth required.' }, { status: 401 }); }
  try {
    const rows = await readAllRows('replacement');
    const idx = rows.slice(1).findIndex((r) => r[COL.invoiceNumber] === id);
    if (idx === -1) return Response.json({ error: 'Replacement record not found.' }, { status: 404 });
    await deleteRow('replacement', idx + 2);
    await logActivity({ adminName: admin.name, action: 'deleted', module: 'Replacement Management', moduleKey: 'replacement', recordId: id });
    return Response.json({ success: true });
  } catch (err) { return Response.json({ error: 'Failed to delete replacement.', detail: (err as Error).message }, { status: 500 }); }
}
