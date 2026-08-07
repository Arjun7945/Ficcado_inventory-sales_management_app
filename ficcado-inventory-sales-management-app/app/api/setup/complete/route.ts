import bcrypt from 'bcryptjs';
import { requireSuperadmin } from '@/lib/auth';
import { setAppMeta } from '@/lib/google/appMeta';
import { readAllRows, appendRows } from '@/lib/google/moduleSheet';
import { logActivity } from '@/lib/activityLogger';

export const dynamic = 'force-dynamic';

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
      const duplicate = existingRows.slice(1).find(
        (r) => (r[1] ?? '').trim().toLowerCase() === String(firstAdmin.name).trim().toLowerCase() ||
               (r[3] ?? '').trim().toLowerCase() === String(firstAdmin.email).trim().toLowerCase()
      );

      if (!duplicate) {
        const passwordHash = await bcrypt.hash(firstAdmin.password, 10);
        const now = new Date().toISOString();

        await appendRows('admin_info', [[
          String(existingRows.length),
          firstAdmin.name.trim(),
          firstAdmin.phone.trim(),
          firstAdmin.email.trim(),
          'Enabled',
          passwordHash,
          now,
          'Superadmin',
          now,
          'Superadmin',
        ]]);

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
