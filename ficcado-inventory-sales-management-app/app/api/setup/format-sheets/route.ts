/**
 * app/api/setup/format-sheets/route.ts
 *
 * POST /api/setup/format-sheets — Formats all sheets in the registered spreadsheet
 * with professional headers, frozen top row, column auto-fit, and text wrapping.
 */

import { getAuthSession } from '@/lib/auth';
import { getSheetConfig } from '@/lib/google/sheetConfig';
import { formatAllSheets } from '@/lib/google/sheetFormatter';

export const dynamic = 'force-dynamic';

export async function POST() {
  const auth = await getAuthSession();
  if ('errorResponse' in auth) return auth.errorResponse;

  try {
    const configMap = await getSheetConfig();
    const firstConfig = Array.from(configMap.values())[0];
    if (!firstConfig || !firstConfig.spreadsheetId) {
      return Response.json({ error: 'Spreadsheet not registered yet.' }, { status: 400 });
    }

    const result = await formatAllSheets(firstConfig.spreadsheetId);
    return Response.json({
      success: true,
      message: 'Sheet formatting applied successfully to all registered tabs.',
      formattedSheets: result.formattedSheets,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return Response.json({ error: 'Failed to format sheets.', detail: message }, { status: 500 });
  }
}
