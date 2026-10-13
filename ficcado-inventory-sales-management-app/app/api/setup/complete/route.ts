/**
 * app/api/setup/complete/route.ts
 *
 * POST /api/setup/complete
 * Marks onboarding setup as completed and creates the first operational admin (with header-mapped formatting).
 */

import bcrypt from 'bcryptjs';
import { requireSuperadmin } from '@/lib/auth';
import { setAppMeta } from '@/lib/google/appMeta';
import { readAllRows, appendRows, updateRow } from '@/lib/google/moduleSheet';
import { buildHeaderMap, getCellByHeader, formatRowFromHeaderMap } from '@/lib/google/headerUtils';
import { logActivity } from '@/lib/activityLogger';
import { MODULE_REGISTRY } from '@/lib/google/moduleRegistry';

export const dynamic = 'force-dynamic';

const EXPECTED_ADMIN_HEADERS = MODULE_REGISTRY.admin_info.headers;

export async function POST(request: Request) {
  try {
    await requireSuperadmin();
  } catch (authErr) {
    if (authErr instanceof Response) return authErr;
    return Response.json({ error: 'Authentication required.' }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const firstAdmin = body.firstAdmin || {};

    if (firstAdmin.name && firstAdmin.phone && firstAdmin.email && firstAdmin.password) {
      const existingRows = await readAllRows('admin_info').catch(() => []);
      if (existingRows.length === 0 || (existingRows[0] && existingRows[0].length < EXPECTED_ADMIN_HEADERS.length)) {
        await updateRow('admin_info', 1, EXPECTED_ADMIN_HEADERS).catch(() => {});
      }

      const headerMap = buildHeaderMap(existingRows[0] ?? []);
      const duplicate = existingRows.slice(1).find(
        (r) => getCellByHeader(r, headerMap, 'Admin Name').trim().toLowerCase() === String(firstAdmin.name).trim().toLowerCase() ||
               getCellByHeader(r, headerMap, 'Email ID').trim().toLowerCase() === String(firstAdmin.email).trim().toLowerCase()
      );

      if (!duplicate) {
        const passwordHash = await bcrypt.hash(firstAdmin.password, 10);
        const now = new Date().toISOString();
        const sno = String(Math.max(existingRows.length - 1, 0) + 1);

        const adminObj = {
          'S.No':          sno,
          'Admin Name':    firstAdmin.name.trim(),
          'Phone Number':  firstAdmin.phone.trim(),
          'Email ID':      firstAdmin.email.trim(),
          'Notifications': 'Enabled',
          'Password Hash': passwordHash,
          'Created At':    now,
          'Created By':    'Superadmin',
          'Updated At':    now,
          'Updated By':    'Superadmin',
        };

        const newRow = formatRowFromHeaderMap(adminObj, EXPECTED_ADMIN_HEADERS);
        await appendRows('admin_info', [newRow]);

        await logActivity({
          adminName: 'Superadmin',
          action: 'created',
          module: 'Admin Information',
          moduleKey: 'admin_info',
          recordId: firstAdmin.name,
          customMessage: `Superadmin successfully created initial operational admin '${firstAdmin.name}' (${firstAdmin.email}) with full permissions during onboarding setup on ${new Date().toLocaleString('en-IN')}.`,
        }).catch(() => {});
      }
    }

    await setAppMeta('setup_completed', 'true');
    return Response.json({ success: true, message: 'First admin registered and setup marked as complete.' });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return Response.json(
      { error: "Couldn't complete setup & register first admin.", detail: message },
      { status: 500 }
    );
  }
}
