/**
 * app/api/setup/register-sheet/route.ts
 *
 * POST /api/setup/register-sheet
 * Setup Wizard Step 2: register module Google Sheet tabs.
 *
 * Actions:
 *  - 'auto-create-all': Takes a pasted Google Spreadsheet ID / URL, creates all 12 module tabs with pre-formatted headers, and registers them automatically.
 *  - 'link': Links an individual module Spreadsheet ID + Tab Name.
 */

import { requireSuperadmin } from '@/lib/auth';
import { getSheetsClient, getDriveClient } from '@/lib/google/sheetsClient';
import { setModuleConfig } from '@/lib/google/sheetConfig';

export const dynamic = 'force-dynamic';

/** Headers for each module sheet, matching spec Section 3.x and Part 2 & 3. */
const MODULE_HEADERS: Record<string, string[]> = {
  items:             ['S.No', 'Item Name', 'Item Type', 'Price of Item', 'Available Sizes', 'Created By', 'Created At', 'Updated By', 'Updated At', 'Current Status'],
  inventory:         ['S.No', 'Item Name', 'Size', 'Total Quantity Available', 'Added By (Admin)', 'Updated At', 'Updated By (Admin)', 'Created At'],
  warehouse:         ['S.No', 'Warehouse Location', 'Handler Name', 'Item Name', 'Size', 'Quantity', 'Created By', 'Created At', 'Updated By', 'Updated At'],
  sales:             ['S.No', 'Invoice Number', 'Sale Status', 'Customer Name', 'Customer Phone Number', 'Customer Address', 'Total Number of Items Purchased', 'Item(s) Name(s)', 'Size(s) Chosen', 'Item Prices', 'Total Amount', 'Payment Status', 'Mode of Payment', 'Transaction ID', 'Created At', 'Created By (Admin)', 'Updated At', 'Updated By', 'Version', 'Delivery Status', 'Delivery Charge Toggle', 'Delivery Charge Amount', 'Fulfilment Request Status', 'Fulfilment Source', 'Sale Closed By', 'Discount', 'Customer Email'],
  replacement:       ['S.No', 'Invoice Number', 'Total Number of Items Purchased', 'Last Purchased Item(s)', 'Last Purchased Item(s) Size', 'New Item(s)', 'New Item(s) Size', 'Invoice Status', 'Disposition of Old Items', 'Restock Destination', 'Removed Item from Last Purchase', 'Sizes of Removed Item from Last Purchase', 'Number of Removed Item from Last Purchase', 'New Final Items Selected', 'New Final Items Sizes', 'Number of New Final Items', 'New Final Items Prices Each', 'New Final Items Total Amount', 'New Stock Source', 'Created At', 'Created By', 'Updated At', 'Updated By', 'Version'],
  return_refund:     ['S.No', 'Invoice Number', 'Item Verification Status', 'Refund Status', 'Refund Amount', 'Refund Completed Date & Time', 'Transaction ID', 'Mode of Refund', 'Disposition of Returned Items', 'Restock Destination', 'Created At', 'Created By', 'Updated At', 'Updated By', 'Version'],
  admin_info:        ['S.No', 'Admin Name', 'Phone Number', 'Email ID', 'Notifications', 'Password Hash', 'Created At', 'Created By', 'Updated At', 'Updated By'],
  keep_notes:        ['S.No', 'Note Content', 'Created By (Admin)', 'Created At', 'Updated By', 'Updated At'],
  activity_log:      ['S.No', 'Admin Name', 'Action', 'Module', 'Module Key', 'Record ID', 'Timestamp', 'Message'],
  damaged_products:  ['S.No', 'Invoice Number', 'Item Name', 'Size', 'Quantity', 'Customer Name', 'Reason/Notes', 'Created At', 'Created By', 'Updated At', 'Updated By'],
  inventory_history: ['S.No', 'Item Name', 'Size', 'Quantity Change', 'Affected Sheet', 'Handler (if Warehouse)', 'Transaction Type', 'Related Invoice Number', 'Resulting Balance', 'Created At', 'Created By', 'Notes'],
  customer_info:     ['S.No', 'Customer Name', 'Phone Number', 'Address', 'Email ID', 'Total Orders Placed', 'Invoice Numbers', 'Created At', 'Created By', 'Updated At', 'Updated By'],
};

const MODULE_DISPLAY_NAMES: Record<string, string> = {
  items:             'Items Management Sheet',
  inventory:         'Inventory Management Sheet',
  warehouse:         'Warehouse Management Sheet',
  sales:             'Sales Management Sheet',
  replacement:       'Replacement Management Sheet',
  return_refund:     'Return/Refund Management Sheet',
  admin_info:        'Admin Information Sheet',
  keep_notes:        'Keep Notes Sheet',
  activity_log:      'Activity Log Sheet',
  damaged_products:  'Damaged Products Management Sheet',
  inventory_history: 'Inventory History Tracker Sheet',
  customer_info:     'Customer Information Management Sheet',
};

const MODULE_TAB_NAMES: Record<string, string> = {
  items:             'Items Management',
  inventory:         'Inventory Management',
  warehouse:         'Warehouse Management',
  sales:             'Sales Management',
  replacement:       'Replacement Management',
  return_refund:     'Return Refund Management',
  admin_info:        'Admin Information',
  keep_notes:        'Keep Notes',
  activity_log:      'Activity Log',
  damaged_products:  'Damaged Products',
  inventory_history: 'Inventory History',
  customer_info:     'Customer Information',
};

/** Extract clean Spreadsheet ID if user pastes full URL */
function extractSpreadsheetId(input: string): string {
  const trimmed = (input || '').trim();
  const match = trimmed.match(/\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : trimmed;
}

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
    const { moduleKey, action, spreadsheetId: rawId, tabName: pastedTab, masterSpreadsheetId, adminEmail } = body;

    const sheets = await getSheetsClient();
    const drive  = await getDriveClient();

    // ── Batch Auto-Setup Mode ───────────────────────────────────────────────
    if (action === 'auto-create-all') {
      const targetId = extractSpreadsheetId(rawId || masterSpreadsheetId || '');

      if (!targetId) {
        return Response.json(
          {
            error: 'Spreadsheet ID is required.',
            detail: 'Please paste your Google Spreadsheet ID or full URL above.',
          },
          { status: 400 }
        );
      }

      // 1. Verify access to target spreadsheet
      let meta;
      try {
        meta = await sheets.spreadsheets.get({ spreadsheetId: targetId });
      } catch (e: any) {
        const detailMsg = e?.message || 'Access denied by Google Sheets API';
        return Response.json(
          {
            error: `Cannot access spreadsheet ID '${targetId}'.`,
            detail: `${detailMsg}. Ensure you have created the spreadsheet in Google Drive and shared it with ficcado-sheets-service@ficcado-inventory-app.iam.gserviceaccount.com as Editor.`,
          },
          { status: 422 }
        );
      }

      // 2. Grant Editor permission if user provided an email
      if (adminEmail && adminEmail.trim()) {
        try {
          await drive.permissions.create({
            fileId: targetId,
            sendNotificationEmail: false,
            requestBody: {
              role: 'writer',
              type: 'user',
              emailAddress: adminEmail.trim(),
            },
          });
        } catch (emailPermErr) {
          console.warn('[register-sheet] Drive user invite notice:', emailPermErr);
        }
      }

      const existingTabs = (meta.data.sheets ?? []).map((s) => s.properties?.title).filter(Boolean);
      const moduleKeys = Object.keys(MODULE_HEADERS);

      // 3. Add missing tabs in batch
      const requests = [];
      for (const key of moduleKeys) {
        const tabName = MODULE_TAB_NAMES[key] ?? key;
        if (!existingTabs.includes(tabName)) {
          requests.push({ addSheet: { properties: { title: tabName } } });
        }
      }

      if (requests.length > 0) {
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId: targetId,
          requestBody: { requests },
        });
      }

      // 4. Write header rows & register each module in SheetConfig
      const results = [];
      for (const key of moduleKeys) {
        const tabName = MODULE_TAB_NAMES[key] ?? key;
        const headers = MODULE_HEADERS[key];
        const displayName = MODULE_DISPLAY_NAMES[key] ?? key;

        await sheets.spreadsheets.values.update({
          spreadsheetId: targetId,
          range: `${tabName}!A1:${columnLetter(headers.length)}1`,
          valueInputOption: 'RAW',
          requestBody: { values: [headers] },
        });

        await setModuleConfig(
          key,
          { spreadsheetId: targetId, tabName, displayName },
          admin.name
        );

        results.push({ moduleKey: key, tabName, status: 'done' });
      }

      const spreadsheetUrl = `https://docs.google.com/spreadsheets/d/${targetId}`;

      return Response.json({
        success: true,
        spreadsheetId: targetId,
        spreadsheetUrl,
        message: `Successfully created all 12 module tabs with pre-formatted headers and registered them!`,
        results,
      });
    }

    // ── Single Module Action ────────────────────────────────────────────────
    if (action === 'link') {
      if (!moduleKey || !MODULE_HEADERS[moduleKey]) {
        return Response.json(
          { error: `Unknown module key '${moduleKey}'.` },
          { status: 400 }
        );
      }

      const displayName = MODULE_DISPLAY_NAMES[moduleKey] ?? moduleKey;
      const targetId = extractSpreadsheetId(rawId || '');

      if (!targetId || !pastedTab) {
        return Response.json(
          { error: 'Spreadsheet ID and Tab Name are required for link action.' },
          { status: 400 }
        );
      }

      // Test-read to validate
      try {
        await sheets.spreadsheets.values.get({
          spreadsheetId: targetId,
          range: `${pastedTab}!A1:A2`,
        });
      } catch (e: any) {
        return Response.json(
          {
            error: `Can't find that spreadsheet or tab.`,
            detail: `${e?.message || 'Check ID and tab name'}. Make sure the service account (ficcado-sheets-service@ficcado-inventory-app.iam.gserviceaccount.com) has Editor access.`,
          },
          { status: 422 }
        );
      }

      await setModuleConfig(
        moduleKey,
        { spreadsheetId: targetId, tabName: pastedTab, displayName },
        admin.name
      );

      return Response.json({
        success:       true,
        spreadsheetId: targetId,
        tabName:       pastedTab,
        message:       `Successfully linked ${displayName}.`,
      });
    }

    return Response.json({ error: "action must be 'auto-create-all' or 'link'." }, { status: 400 });
  } catch (err: any) {
    const message = err instanceof Error ? err.message : String(err);
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
