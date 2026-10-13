/**
 * app/api/sheet-config/route.ts
 *
 * GET /api/sheet-config — list all module → sheet mappings (Admin Control Centre)
 * Read-only reference view of all registered module configurations.
 */

import { requireAuth } from '@/lib/auth';
import { getAllModuleConfigs } from '@/lib/google/sheetConfig';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const admin = await requireAuth();
    void admin;
  } catch (authErr) {
    if (authErr instanceof Response) return authErr;
    return Response.json({ error: 'Authentication required.' }, { status: 401 });
  }

  try {
    const configs = await getAllModuleConfigs();
    return Response.json({ configs });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return Response.json(
      { error: "Couldn't load Sheet Configuration. Check your connection.", detail: message },
      { status: 500 }
    );
  }
}
