import bcrypt from 'bcryptjs';
import { requireAuth } from '@/lib/auth';
import { readAllRows, updateRow } from '@/lib/google/moduleSheet';
import { logActivity } from '@/lib/activityLogger';

export const dynamic = 'force-dynamic';

const COL = {
  sno: 0,
  adminName: 1,
  phone: 2,
  email: 3,
  notifications: 4,
  passwordHash: 5,
  createdAt: 6,
  createdBy: 7,
  updatedAt: 8,
  updatedBy: 9,
};

export async function PUT(request: Request) {
  let admin;
  try {
    admin = await requireAuth();
  } catch (e) {
    if (e instanceof Response) return e;
    return Response.json({ error: 'Auth required.' }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const { currentPassword, newPassword } = body;

    if (!currentPassword) {
      return Response.json({ error: 'Current password is required.' }, { status: 400 });
    }
    if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 8) {
      return Response.json({ error: 'New password must be at least 8 characters long.' }, { status: 400 });
    }

    const rows = await readAllRows('admin_info', true);
    const dataRows = rows.slice(1);
    const targetIdx = dataRows.findIndex(
      (r) =>
        (r[COL.adminName] ?? '').trim().toLowerCase() === admin.name.trim().toLowerCase() ||
        (r[COL.email] ?? '').trim().toLowerCase() === admin.email.trim().toLowerCase()
    );

    if (targetIdx === -1) {
      return Response.json({ error: 'Admin record not found in admin_info sheet.' }, { status: 404 });
    }

    const existingRow = dataRows[targetIdx];
    const sheetRowIndex = targetIdx + 2; // header = row 1
    const storedHash = existingRow[COL.passwordHash] || '';

    // Verify current password if a hash exists
    if (storedHash) {
      const match = await bcrypt.compare(currentPassword, storedHash);
      if (!match) {
        return Response.json({ error: 'Current password is incorrect.' }, { status: 400 });
      }
    }

    // Hash new password and update row
    const newHash = await bcrypt.hash(newPassword, 10);
    const now = new Date().toISOString();

    const updatedRow = [...existingRow];
    // Ensure array is padded to index 9
    while (updatedRow.length < 10) updatedRow.push('');

    updatedRow[COL.passwordHash] = newHash;
    updatedRow[COL.updatedAt] = now;
    updatedRow[COL.updatedBy] = admin.name;

    await updateRow('admin_info', sheetRowIndex, updatedRow);

    await logActivity({
      adminName: admin.name,
      action: 'updated',
      module: 'Admin Control',
      moduleKey: 'admin_info',
      recordId: admin.name,
      customMessage: `Admin '${admin.name}' (${admin.email}) successfully changed their security login password on ${new Date().toLocaleString('en-IN')}.`,
    }).catch(() => {});

    return Response.json({ success: true, message: 'Password updated successfully.' });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return Response.json({ error: 'Failed to change password.', detail: message }, { status: 500 });
  }
}
