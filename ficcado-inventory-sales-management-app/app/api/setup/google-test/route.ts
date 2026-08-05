/**
 * app/api/setup/google-test/route.ts
 *
 * POST /api/setup/google-test
 * Setup Wizard Step 1: verify the Service Account credentials work by
 * performing a live read/write test against the bootstrap spreadsheet.
 *
 * Returns: { success: boolean, message: string }
 */

import { requireSuperadmin } from '@/lib/auth';
import { getBootstrapSpreadsheetId, APP_META_TAB, BOOTSTRAP_SHEET_NAME } from '@/lib/google/bootstrap';
import { getSheetsClient } from '@/lib/google/sheetsClient';

export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    await requireSuperadmin();
  } catch (authErr) {
    if (authErr instanceof Response) return authErr;
    return Response.json({ error: 'Authentication required.' }, { status: 401 });
  }

  try {
    const { spreadsheetId, status } = await getBootstrapSpreadsheetId();
    const sheets = await getSheetsClient();

    // Test read: fetch the AppMeta tab headers
    const readRes = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${APP_META_TAB}!A1:C1`,
    });

    const headers = readRes.data.values?.[0] ?? [];
    const hasExpectedHeaders =
      headers.includes('key') &&
      headers.includes('value');

    if (!hasExpectedHeaders && status === 'found') {
      return Response.json({
        success: false,
        message:
          `Found the ${BOOTSTRAP_SHEET_NAME} spreadsheet but its headers look wrong. ` +
          "It may have been modified manually. Check the AppMeta tab.",
      });
    }

    return Response.json({
      success: true,
      spreadsheetId,
      status,
      message:
        status === 'created'
          ? `Successfully created the ${BOOTSTRAP_SHEET_NAME} spreadsheet (ID: ${spreadsheetId}).`
          : `Successfully connected to the existing ${BOOTSTRAP_SHEET_NAME} spreadsheet.`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[setup/google-test]', message);

    // Return a plain-language error per DESIGN.md messaging rules
    let userMessage = "Couldn't connect to Google Sheets.";
    if (message.includes('invalid_grant') || message.includes('unauthorized')) {
      userMessage =
        'The service account credentials are invalid or expired. ' +
        'Regenerate the key in Google Cloud Console and update GOOGLE_SERVICE_ACCOUNT_KEY.';
    } else if (message.includes('quota')) {
      userMessage =
        'Google Sheets API quota exceeded. Wait a minute and try again.';
    } else if (message.includes('not found') || message.includes('404')) {
      userMessage =
        "Couldn't find the spreadsheet. The service account may not have Drive access. " +
        'Ensure the service account has at least Drive API enabled.';
    }

    return Response.json({ success: false, message: userMessage, detail: message }, { status: 500 });
  }
}
