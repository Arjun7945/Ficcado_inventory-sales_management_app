/**
 * app/api/sheet-config/route.ts
 *
 * GET  /api/sheet-config — list all module → sheet mappings (Admin Control Centre)
 * POST /api/sheet-config — update a module's spreadsheet ID / tab name (with test-read)
 */

import { requireAuth } from '@/lib/auth';
import { getAllModuleConfigs, setModuleConfig, bustConfigCache } from '@/lib/google/sheetConfig';
import { getSheetsClient } from '@/lib/google/sheetsClient';
import { validate, SheetConfigSchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const admin = await requireAuth();
    // Cast to avoid unused variable warning — auth check is the goal
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

export async function POST(request: Request) {
  let admin;
  try {
    admin = await requireAuth();
  } catch (authErr) {
    if (authErr instanceof Response) return authErr;
    return Response.json({ error: 'Authentication required.' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { valid, data, errors } = validate(SheetConfigSchema, body);

    if (!valid) {
      return Response.json({ error: 'Validation failed', errors }, { status: 400 });
    }

    const { moduleKey, displayName, spreadsheetId, tabName } = data!;

    // Test-read the new sheet before saving (validates ID + tab)
    const sheets = await getSheetsClient();
    try {
      await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `${tabName}!A1:A2`,
      });
    } catch {
      return Response.json(
        {
          error:
            `Can't find that spreadsheet or tab — double-check the Spreadsheet ID ` +
            `and tab name for '${displayName}'. Make sure the service account has access.`,
        },
        { status: 422 }
      );
    }

    await setModuleConfig(moduleKey, { spreadsheetId, tabName, displayName }, admin.name);
    bustConfigCache();

    return Response.json({
      success: true,
      message: `Sheet Configuration for '${displayName}' updated successfully.`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[sheet-config POST]', message);
    return Response.json(
      { error: "Couldn't update Sheet Configuration. Check your connection.", detail: message },
      { status: 500 }
    );
  }
}

/** PUT is identical to POST — kept for RESTful semantics in the Admin Control Centre UI */
export { POST as PUT };

