/**
 * app/api/bootstrap/status/route.ts
 *
 * GET /api/bootstrap/status
 * Returns the current app setup state so the root page can route correctly:
 *  - claimed: false → show "Claim This Installation" screen
 *  - claimed: true, setupComplete: false → show Setup Wizard
 *  - claimed: true, setupComplete: true → show normal Login page
 */

import { getAppMetaMulti } from '@/lib/google/appMeta';
import { getBootstrapSpreadsheetId } from '@/lib/google/bootstrap';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // Trigger bootstrap sheet discovery/creation if needed
    await getBootstrapSpreadsheetId();

    const meta = await getAppMetaMulti(['superadmin_claimed', 'setup_completed']);

    return Response.json({
      claimed:       meta.superadmin_claimed === 'true',
      setupComplete: meta.setup_completed === 'true',
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[bootstrap/status]', message);
    return Response.json(
      {
        error: message.includes('Service Account') ? message : "Couldn't connect to Google Sheets. Check that GOOGLE_SERVICE_ACCOUNT_KEY is set correctly.",
        detail: message,
      },
      { status: 500 }
    );
  }
}
