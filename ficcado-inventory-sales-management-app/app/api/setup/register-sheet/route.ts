/**
 * app/api/setup/register-sheet/route.ts
 *
 * POST /api/setup/register-sheet
 * Setup Wizard Step 2: register module Google Sheet tabs.
 *
 * Updated with Part 4 extended Return/Refund Management sheet schema.
 */

import { requireSuperadmin } from '@/lib/auth';
import { getSheetsClient, getDriveClient } from '@/lib/google/sheetsClient';
import { setModuleConfig } from '@/lib/google/sheetConfig';
import { formatAllSheets } from '@/lib/google/sheetFormatter';

export const dynamic = 'force-dynamic';

import {
  MODULE_REGISTRY,
  getModuleHeadersMap,
  getModuleDisplayNamesMap,
  getModuleTabNamesMap,
} from '@/lib/google/moduleRegistry';

const MODULE_HEADERS = getModuleHeadersMap();
const MODULE_DISPLAY_NAMES = getModuleDisplayNamesMap();
const MODULE_TAB_NAMES = getModuleTabNamesMap();

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
    const drive = await getDriveClient();

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

      let meta;
      try {
        meta = await sheets.spreadsheets.get({ spreadsheetId: targetId });
      } catch (e: any) {
        const detailMsg = e?.message || 'Access denied by Google Sheets API';
        return Response.json(
          {
            error: `Cannot access spreadsheet ID '${targetId}'.`,
            detail: `${detailMsg}. Ensure you have created the spreadsheet in Google Drive and shared it with ficcado-crm-sheets-service@ficcado-crm-management.iam.gserviceaccount.com as Editor.`,
          },
          { status: 422 }
        );
      }

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

      // Automatically apply professional sheet formatting (dark header, frozen top row, column width auto-fit)
      try {
        await formatAllSheets(targetId);
      } catch (fErr) {
        console.error('Failed to auto-apply formatting during setup:', fErr);
      }

      const spreadsheetUrl = `https://docs.google.com/spreadsheets/d/${targetId}`;

      return Response.json({
        success: true,
        spreadsheetId: targetId,
        spreadsheetUrl,
        message: `Successfully created all 13 module tabs with pre-formatted headers and registered them!`,
        results,
      });
    }

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

      try {
        await sheets.spreadsheets.values.get({
          spreadsheetId: targetId,
          range: `${pastedTab}!A1:A2`,
        });
      } catch (e: any) {
        return Response.json(
          {
            error: `Can't find that spreadsheet or tab.`,
            detail: `${e?.message || 'Check ID and tab name'}. Make sure the service account has Editor access.`,
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
        success: true,
        spreadsheetId: targetId,
        tabName: pastedTab,
        message: `Successfully linked ${displayName}.`,
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
