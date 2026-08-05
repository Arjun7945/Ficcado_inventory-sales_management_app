/**
 * app/api/setup/register-sheet/route.ts
 *
 * POST /api/setup/register-sheet
 * Setup Wizard Step 2: register a module's Google Sheet tab.
 *
 * Body (link existing):  { moduleKey, spreadsheetId, tabName, action: 'link' }
 * Body (auto-create):    { moduleKey, action: 'create' }
 *
 * On 'create': Automatically creates a dedicated tab inside the shared Ficcado-System-Config
 *              spreadsheet with correct bold header row and registers it in SheetConfig.
 * On 'link':   Validates external spreadsheet ID + tab name by test-reading, then registers it.
 */

import { requireSuperadmin } from '@/lib/auth';
import { getSheetsClient } from '@/lib/google/sheetsClient';
import { getBootstrapSpreadsheetId } from '@/lib/google/bootstrap';
import { setModuleConfig } from '@/lib/google/sheetConfig';

export const dynamic = 'force-dynamic';

/** Headers for each module sheet, matching spec Section 3.x exactly. */
const MODULE_HEADERS: Record<string, string[]> = {
  items:          ['S.No', 'Item Name', 'Item Type', 'Price of Item', 'Available Sizes', 'Created By', 'Created At', 'Updated By', 'Updated At', 'Current Status'],
  inventory:      ['S.No', 'Item Name', 'Size', 'Total Quantity Available', 'Added By (Admin)', 'Updated At', 'Updated By (Admin)', 'Created At'],
  warehouse:      ['S.No', 'Warehouse Location', 'Handler Name', 'Item Name', 'Size', 'Quantity', 'Created By', 'Created At', 'Updated By', 'Updated At'],
  sales:          ['S.No', 'Invoice Number', 'Sale Status', 'Customer Name', 'Customer Phone Number', 'Customer Address', 'Total Number of Items Purchased', 'Item(s) Name(s)', 'Size(s) Chosen', 'Total Amount', 'Payment Status', 'Mode of Payment', 'Transaction ID', 'Created At', 'Created By (Admin)', 'Updated At', 'Updated By', 'Version'],
  replacement:    ['S.No', 'Invoice Number', 'Total Number of Items Purchased', 'Last Purchased Item(s)', 'Last Purchased Item(s) Size', 'New Item(s)', 'New Item(s) Size', 'Invoice Status', 'Created At', 'Created By', 'Updated At', 'Updated By', 'Version'],
  return_refund:  ['S.No', 'Invoice Number', 'Item Verification Status', 'Refund Status', 'Refund Amount', 'Refund Completed Date & Time', 'Transaction ID', 'Mode of Refund', 'Created At', 'Created By', 'Updated At', 'Updated By', 'Version'],
  admin_info:     ['S.No', 'Admin Name', 'Phone Number', 'Email ID', 'Notifications', 'Password Hash', 'Created At', 'Created By', 'Updated At', 'Updated By'],
  keep_notes:     ['S.No', 'Note Content', 'Created By (Admin)', 'Created At', 'Updated By', 'Updated At'],
  activity_log:   ['S.No', 'Admin Name', 'Action', 'Module', 'Module Key', 'Record ID', 'Timestamp', 'Message'],
};

const MODULE_DISPLAY_NAMES: Record<string, string> = {
  items:         'Items Management Sheet',
  inventory:     'Inventory Management Sheet',
  warehouse:     'Warehouse Management Sheet',
  sales:         'Sales Management Sheet',
  replacement:   'Replacement Management Sheet',
  return_refund: 'Return/Refund Management Sheet',
  admin_info:    'Admin Information Sheet',
  keep_notes:    'Keep Notes Sheet',
  activity_log:  'Activity Log Sheet',
};

const MODULE_TAB_NAMES: Record<string, string> = {
  items:         'Items Management',
  inventory:     'Inventory Management',
  warehouse:     'Warehouse Management',
  sales:         'Sales Management',
  replacement:   'Replacement Management',
  return_refund: 'Return Refund Management',
  admin_info:    'Admin Information',
  keep_notes:    'Keep Notes',
  activity_log:  'Activity Log',
};

export async function POST(request: Request) {
  let admin;
  try {
    admin = await requireSuperadmin();
  } catch (authErr) {
    if (authErr instanceof Response) return authErr;
    return Response.json({ error: 'Authentication required.' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { moduleKey, action, spreadsheetId: pastedId, tabName: pastedTab } = body;

    if (!moduleKey || !MODULE_HEADERS[moduleKey]) {
      return Response.json(
        { error: `Unknown module key '${moduleKey}'. Valid keys: ${Object.keys(MODULE_HEADERS).join(', ')}` },
        { status: 400 }
      );
    }

    const displayName = MODULE_DISPLAY_NAMES[moduleKey] ?? moduleKey;
    const sheets = await getSheetsClient();

    if (action === 'create') {
      // ── Create a dedicated tab inside the shared Ficcado-System-Config sheet ─
      const { spreadsheetId } = await getBootstrapSpreadsheetId();
      const tabName = MODULE_TAB_NAMES[moduleKey] ?? moduleKey;
      const headers = MODULE_HEADERS[moduleKey];

      // Check if tab already exists
      const meta = await sheets.spreadsheets.get({ spreadsheetId });
      const existingTabs = (meta.data.sheets ?? []).map((s) => s.properties?.title).filter(Boolean);

      if (!existingTabs.includes(tabName)) {
        // Create tab
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId,
          requestBody: {
            requests: [
              { addSheet: { properties: { title: tabName } } },
            ],
          },
        });
      }

      // Write header row
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${tabName}!A1:${columnLetter(headers.length)}1`,
        valueInputOption: 'RAW',
        requestBody: {
          values: [headers],
        },
      });

      await setModuleConfig(
        moduleKey,
        { spreadsheetId, tabName, displayName },
        admin.name
      );

      return Response.json({
        success:       true,
        spreadsheetId,
        tabName,
        message:       `Created tab "${tabName}" in system sheet and registered ${displayName}.`,
      });
    }

    if (action === 'link') {
      if (!pastedId || !pastedTab) {
        return Response.json(
          { error: 'spreadsheetId and tabName are required for link action.' },
          { status: 400 }
        );
      }

      // Test-read to validate
      try {
        await sheets.spreadsheets.values.get({
          spreadsheetId: pastedId,
          range: `${pastedTab}!A1:A2`,
        });
      } catch {
        return Response.json(
          {
            error:
              `Can't find that spreadsheet or tab. ` +
              `Double-check the Spreadsheet ID and tab name for '${displayName}'. ` +
              `Make sure the service account (ficcado-sheets-service@ficcado-inventory-app.iam.gserviceaccount.com) has Editor access.`,
          },
          { status: 422 }
        );
      }

      await setModuleConfig(
        moduleKey,
        { spreadsheetId: pastedId, tabName: pastedTab, displayName },
        admin.name
      );

      return Response.json({
        success:       true,
        spreadsheetId: pastedId,
        tabName:       pastedTab,
        message:       `Successfully linked ${displayName}.`,
      });
    }

    return Response.json({ error: "action must be 'create' or 'link'." }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[setup/register-sheet]', message);
    return Response.json(
      { error: "Couldn't register sheet tab.", detail: message },
      { status: 500 }
    );
  }
}

function columnLetter(n: number): string {
  let result = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    result = String.fromCharCode(65 + rem) + result;
    n = Math.floor((n - 1) / 26);
  }
  return result;
}
