/**
 * app/api/admins/[id]/route.ts
 * GET    /api/admins/[id] — get a single admin by S.No or name
 * PUT    /api/admins/[id] — update admin profile
 * DELETE /api/admins/[id] — delete admin
 */

import { requireAuth } from '@/lib/auth';
import { readAllRows, updateRow, deleteRow } from '@/lib/google/moduleSheet';
import { validate, AdminSchema } from '@/lib/validation';
import { logActivity } from '@/lib/activityLogger';

export const dynamic = 'force-dynamic';

const COL = { sno: 0, adminName: 1, phone: 2, email: 3, notifications: 4, passwordHash: 5, createdAt: 6, createdBy: 7, updatedAt: 8, updatedBy: 9 };

function findRow(rows: any[][], id: string) {
  return rows.slice(1).findIndex(
    (r) => r[COL.sno] === id || r[COL.adminName]?.toLowerCase() === id.toLowerCase() || r[COL.email]?.toLowerCase() === id.toLowerCase()
  );
}

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try { await requireAuth(); }
  catch (e) { if (e instanceof Response) return e; return Response.json({ error: 'Authentication required.' }, { status: 401 }); }

  try {
    const rows = await readAllRows('admin_info');
    const idx = findRow(rows, id);
    if (idx === -1) return Response.json({ error: 'Admin not found.' }, { status: 404 });
    const row = rows[idx + 1];
    return Response.json({
      admin: {
        sno: row[COL.sno], adminName: row[COL.adminName], phone: row[COL.phone],
        email: row[COL.email], notifications: row[COL.notifications],
        createdAt: row[COL.createdAt], updatedAt: row[COL.updatedAt],
      }
    });
  } catch (err) {
    return Response.json({ error: 'Failed to load admin.', detail: (err as Error).message }, { status: 500 });
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let admin;
  try { admin = await requireAuth(); }
  catch (e) { if (e instanceof Response) return e; return Response.json({ error: 'Authentication required.' }, { status: 401 }); }

  try {
    const body = await request.json();
    const { valid, data, errors } = validate(AdminSchema.omit({ password: true }), body);
    if (!valid) return Response.json({ error: 'Validation failed', errors }, { status: 400 });

    const rows = await readAllRows('admin_info');
    const idx = findRow(rows, id);
    if (idx === -1) return Response.json({ error: 'Admin not found.' }, { status: 404 });

    const row = rows[idx + 1];
    const rowIndex = idx + 2;
    const now = new Date().toISOString();

    const updatedRow = [
      row[COL.sno], data!.adminName, data!.phoneNumber, data!.emailId,
      data!.notifications, row[COL.passwordHash],
      row[COL.createdAt], row[COL.createdBy], now, admin.name,
    ];

    await updateRow('admin_info', rowIndex, updatedRow);
    await logActivity({ adminName: admin.name, action: 'updated', module: 'Admin Information', moduleKey: 'admin_info', recordId: data!.adminName });

    return Response.json({ success: true, message: `Admin '${data!.adminName}' updated.` });
  } catch (err) {
    return Response.json({ error: 'Failed to update admin.', detail: (err as Error).message }, { status: 500 });
  }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let admin;
  try { admin = await requireAuth(); }
  catch (e) { if (e instanceof Response) return e; return Response.json({ error: 'Authentication required.' }, { status: 401 }); }

  try {
    const rows = await readAllRows('admin_info');
    const idx = findRow(rows, id);
    if (idx === -1) return Response.json({ error: 'Admin not found.' }, { status: 404 });

    const rowIndex = idx + 2;
    const adminName = rows[idx + 1][COL.adminName];
    await deleteRow('admin_info', rowIndex);
    await logActivity({ adminName: admin.name, action: 'deleted', module: 'Admin Information', moduleKey: 'admin_info', recordId: adminName });

    return Response.json({ success: true, message: `Admin '${adminName}' deleted.` });
  } catch (err) {
    return Response.json({ error: 'Failed to delete admin.', detail: (err as Error).message }, { status: 500 });
  }
}
