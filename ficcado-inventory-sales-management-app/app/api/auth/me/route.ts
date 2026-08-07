import { getSessionAdmin } from '@/lib/auth';
import { readAllRows } from '@/lib/google/moduleSheet';

export const dynamic = 'force-dynamic';

export async function GET() {
  const sessionAdmin = await getSessionAdmin();
  if (!sessionAdmin) {
    return Response.json({ admin: null }, { status: 401 });
  }

  try {
    const adminRows = await readAllRows('admin_info');
    const match = adminRows.slice(1).find(
      (r) => (r[1] ?? '').trim().toLowerCase() === sessionAdmin.name.trim().toLowerCase() ||
             (r[3] ?? '').trim().toLowerCase() === sessionAdmin.email.trim().toLowerCase()
    );

    if (match) {
      return Response.json({
        admin: {
          id:            sessionAdmin.id,
          name:          match[1] ?? sessionAdmin.name,
          phone:         match[2] ?? '',
          phoneNumber:   match[2] ?? '',
          email:         match[3] ?? sessionAdmin.email,
          notifications: match[4] ?? 'Enabled',
          role:          sessionAdmin.role,
        },
      });
    }
  } catch {
    // Silent catch fallback
  }

  return Response.json({
    admin: {
      ...sessionAdmin,
      phone: '',
      phoneNumber: '',
      notifications: 'Enabled',
    },
  });
}
