/**
 * app/api/setup/complete/route.ts
 *
 * POST /api/setup/complete
 * Called by the wizard after Step 4 to mark setup as complete.
 * Writes setup_completed=true to AppMeta.
 */

import { requireSuperadmin } from '@/lib/auth';
import { setAppMeta } from '@/lib/google/appMeta';

export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    await requireSuperadmin();
  } catch (authErr) {
    if (authErr instanceof Response) return authErr;
    return Response.json({ error: 'Authentication required.' }, { status: 401 });
  }

  try {
    await setAppMeta('setup_completed', 'true');
    return Response.json({ success: true, message: 'Setup marked as complete.' });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return Response.json(
      { error: "Couldn't mark setup as complete.", detail: message },
      { status: 500 }
    );
  }
}
