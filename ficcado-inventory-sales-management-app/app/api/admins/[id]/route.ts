/**
 * app/api/admins/[id]/route.ts
 * GET    /api/admins/[id] — get a single admin by S.No or name (header-mapped)
 * PUT    /api/admins/[id] — update admin profile (header-mapped)
 * DELETE /api/admins/[id] — delete admin (header-mapped)
 */

import { requireAuth } from '@/lib/auth';
import { readAllRows, updateRow, deleteRow } from '@/lib/google/moduleSheet';
import { buildHeaderMap, getCellByHeader, formatRowFromHeaderMap } from '@/lib/google/headerUtils';
import { validate, AdminSchema } from '@/lib/validation';
import { logActivity } from '@/lib/activityLogger';
import { MODULE_REGISTRY } from '@/lib/google/moduleRegistry';

export const dynamic = 'force-dynamic';

const EXPECTED_HEADERS = MODULE_REGISTRY.admin_info.headers;

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try { await requireAuth(); }
  catch (e) { if (e instanceof Response) return e; return Response.json({ error: 'Authentication required.' }, { status: 401 }); }

  try {
    const rows = await readAllRows('admin_info');
    if (rows.length < 2) return Response.json({ error: 'Admin not found.' }, { status: 404 });

    const headerMap = buildHeaderMap(rows[0]);
    const idx = rows.slice(1).findIndex(
      (r) => getCellByHeader(r, headerMap, 'S.No') === id ||
        getCellByHeader(r, headerMap, 'Admin Name').toLowerCase() === id.toLowerCase() ||
        getCellByHeader(r, headerMap, 'Email ID').toLowerCase() === id.toLowerCase()
    );

    if (idx === -1) return Response.json({ error: 'Admin not found.' }, { status: 404 });
    const row = rows[idx + 1];
    return Response.json({
      admin: {
        sno:           getCellByHeader(row, headerMap, 'S.No'),
        adminName:     getCellByHeader(row, headerMap, 'Admin Name'),
        phone:         getCellByHeader(row, headerMap, 'Phone Number'),
        email:         getCellByHeader(row, headerMap, 'Email ID'),
        notifications: getCellByHeader(row, headerMap, 'Notifications', 'Enabled'),
        createdAt:     getCellByHeader(row, headerMap, 'Created At'),
        updatedAt:     getCellByHeader(row, headerMap, 'Updated At'),
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
    if (rows.length < 2) return Response.json({ error: 'Admin not found.' }, { status: 404 });

    if (rows[0] && rows[0].length < EXPECTED_HEADERS.length) {
      await updateRow('admin_info', 1, EXPECTED_HEADERS).catch(() => {});
    }

    const headerMap = buildHeaderMap(rows[0]);
    const idx = rows.slice(1).findIndex(
      (r) => getCellByHeader(r, headerMap, 'S.No') === id ||
        getCellByHeader(r, headerMap, 'Admin Name').toLowerCase() === id.toLowerCase() ||
        getCellByHeader(r, headerMap, 'Email ID').toLowerCase() === id.toLowerCase()
    );

    if (idx === -1) return Response.json({ error: 'Admin not found.' }, { status: 404 });

    const row = rows[idx + 1];
    const rowIndex = idx + 2;
    const now = new Date().toISOString();

    const adminObj = {
      'S.No':          getCellByHeader(row, headerMap, 'S.No'),
      'Admin Name':    data!.adminName,
      'Phone Number':  data!.phoneNumber,
      'Email ID':      data!.emailId,
      'Notifications': data!.notifications,
      'Password Hash': getCellByHeader(row, headerMap, 'Password Hash'),
      'Created At':    getCellByHeader(row, headerMap, 'Created At'),
      'Created By':    getCellByHeader(row, headerMap, 'Created By'),
      'Updated At':    now,
      'Updated By':    admin.name,
    };

    const updatedRow = formatRowFromHeaderMap(adminObj, EXPECTED_HEADERS);
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
    if (rows.length < 2) return Response.json({ error: 'Admin not found.' }, { status: 404 });

    const headerMap = buildHeaderMap(rows[0]);
    const idx = rows.slice(1).findIndex(
      (r) => getCellByHeader(r, headerMap, 'S.No') === id ||
        getCellByHeader(r, headerMap, 'Admin Name').toLowerCase() === id.toLowerCase() ||
        getCellByHeader(r, headerMap, 'Email ID').toLowerCase() === id.toLowerCase()
    );

    if (idx === -1) return Response.json({ error: 'Admin not found.' }, { status: 404 });

    const rowIndex = idx + 2;
    const adminName = getCellByHeader(rows[idx + 1], headerMap, 'Admin Name');
    await deleteRow('admin_info', rowIndex);
    await logActivity({ adminName: admin.name, action: 'deleted', module: 'Admin Information', moduleKey: 'admin_info', recordId: adminName });

    return Response.json({ success: true, message: `Admin '${adminName}' deleted.` });
  } catch (err) {
    return Response.json({ error: 'Failed to delete admin.', detail: (err as Error).message }, { status: 500 });
  }
}
