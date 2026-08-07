/**
 * lib/google/bootstrap.ts
 *
 * Phase 0: Bootstrap sheet discovery / creation / initialization.
 *
 * On any server-side action, this module:
 *   1. Checks module-level cache for the known Spreadsheet ID.
 *   2. Checks process.env.BOOTSTRAP_SPREADSHEET_ID if set.
 *   3. Searches Google Drive for a spreadsheet named BOOTSTRAP_SHEET_NAME ('Ficcado-System-Config')
 *      shared with the service account.
 *   4. If found, ensures AppMeta and SheetConfig tabs exist with correct headers.
 *   5. If not found, attempts to create one via Sheets API. If creation fails due to Service Account
 *      storage quota (0-byte quota default on non-Workspace service accounts), provides a clear,
 *      actionable message asking the user to create a sheet and share it with the service account email.
 */

import { getSheetsClient, getDriveClient } from './sheetsClient';

export const BOOTSTRAP_SHEET_NAME = process.env.BOOTSTRAP_SHEET_NAME || process.env.NEXT_PUBLIC_BOOTSTRAP_SHEET_NAME || 'Ficcado-System-Config';
export const APP_META_TAB = 'AppMeta';
export const SHEET_CONFIG_TAB = 'SheetConfig';

let _cachedSpreadsheetId: string | null = null;
let _tabsInitialized = false;
let _pendingBootstrapPromise: Promise<BootstrapResult> | null = null;

export type BootstrapStatus = 'found' | 'created';

interface BootstrapResult {
  spreadsheetId: string;
  status: BootstrapStatus;
}

/**
 * Ensures the given spreadsheet has AppMeta and SheetConfig tabs with correct headers.
 */
async function initializeBootstrapTabs(spreadsheetId: string): Promise<void> {
  const sheets = await getSheetsClient();

  // Get current tabs
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const existingTabs = (meta.data.sheets ?? []).map((s) => s.properties?.title).filter(Boolean);

  const requests: any[] = [];

  if (!existingTabs.includes(APP_META_TAB)) {
    requests.push({
      addSheet: { properties: { title: APP_META_TAB } },
    });
  }

  if (!existingTabs.includes(SHEET_CONFIG_TAB)) {
    requests.push({
      addSheet: { properties: { title: SHEET_CONFIG_TAB } },
    });
  }

  if (requests.length > 0) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests },
    });
  }

  // Populate headers if empty
  const appMetaHeaderRes = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${APP_META_TAB}!A1:C1`,
  });

  if (!appMetaHeaderRes.data.values || appMetaHeaderRes.data.values.length === 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${APP_META_TAB}!A1:C1`,
      valueInputOption: 'RAW',
      requestBody: {
        values: [['key', 'value', 'updated_at']],
      },
    });
  }

  const sheetConfigHeaderRes = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${SHEET_CONFIG_TAB}!A1:F1`,
  });

  if (!sheetConfigHeaderRes.data.values || sheetConfigHeaderRes.data.values.length === 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${SHEET_CONFIG_TAB}!A1:F1`,
      valueInputOption: 'RAW',
      requestBody: {
        values: [['module_key', 'display_name', 'spreadsheet_id', 'tab_name', 'updated_at', 'updated_by']],
      },
    });
  }
}

/**
 * Locate or initialize the Ficcado-System-Config spreadsheet.
 * Uses in-flight promise coalescing (single-flight) to prevent concurrent
 * requests from firing duplicate Google Drive search & initialization calls.
 */
export async function getBootstrapSpreadsheetId(): Promise<BootstrapResult> {
  if (_cachedSpreadsheetId && _tabsInitialized) {
    return { spreadsheetId: _cachedSpreadsheetId, status: 'found' };
  }

  if (_pendingBootstrapPromise) {
    return _pendingBootstrapPromise;
  }

  _pendingBootstrapPromise = (async () => {
    try {
      if (_cachedSpreadsheetId) {
        if (!_tabsInitialized) {
          await initializeBootstrapTabs(_cachedSpreadsheetId);
          _tabsInitialized = true;
        }
        return { spreadsheetId: _cachedSpreadsheetId, status: 'found' };
      }

      // 1. Check env var fallback if present
      if (process.env.BOOTSTRAP_SPREADSHEET_ID) {
        _cachedSpreadsheetId = process.env.BOOTSTRAP_SPREADSHEET_ID;
        await initializeBootstrapTabs(_cachedSpreadsheetId);
        _tabsInitialized = true;
        return { spreadsheetId: _cachedSpreadsheetId, status: 'found' };
      }

      const drive = await getDriveClient();

      // 2. Search Google Drive for an existing spreadsheet shared with service account
      try {
        const searchRes = await drive.files.list({
          q: `mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`,
          fields: 'files(id, name)',
          spaces: 'drive',
          pageSize: 20,
        });

        const files = searchRes.data.files ?? [];
        const targetFile = files.find((f) => f.name === BOOTSTRAP_SHEET_NAME) || files[0];

        if (targetFile && targetFile.id) {
          _cachedSpreadsheetId = targetFile.id;
          await initializeBootstrapTabs(_cachedSpreadsheetId);
          _tabsInitialized = true;
          return { spreadsheetId: _cachedSpreadsheetId, status: 'found' };
        }
      } catch (err) {
        console.warn('[bootstrap] Drive search warning:', err instanceof Error ? err.message : err);
      }

      // 3. Not found — attempt auto-creation via Sheets API
      const sheets = await getSheetsClient();
      try {
        const createRes = await sheets.spreadsheets.create({
          requestBody: {
            properties: { title: BOOTSTRAP_SHEET_NAME },
            sheets: [
              {
                properties: { title: APP_META_TAB, index: 0 },
                data: [
                  {
                    startRow: 0,
                    startColumn: 0,
                    rowData: [
                      {
                        values: [
                          { userEnteredValue: { stringValue: 'key' } },
                          { userEnteredValue: { stringValue: 'value' } },
                          { userEnteredValue: { stringValue: 'updated_at' } },
                        ],
                      },
                    ],
                  },
                ],
              },
              {
                properties: { title: SHEET_CONFIG_TAB, index: 1 },
                data: [
                  {
                    startRow: 0,
                    startColumn: 0,
                    rowData: [
                      {
                        values: [
                          { userEnteredValue: { stringValue: 'module_key' } },
                          { userEnteredValue: { stringValue: 'display_name' } },
                          { userEnteredValue: { stringValue: 'spreadsheet_id' } },
                          { userEnteredValue: { stringValue: 'tab_name' } },
                          { userEnteredValue: { stringValue: 'updated_at' } },
                          { userEnteredValue: { stringValue: 'updated_by' } },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        });

        const newId = createRes.data.spreadsheetId;
        if (newId) {
          _cachedSpreadsheetId = newId;
          _tabsInitialized = true;
          return { spreadsheetId: newId, status: 'created' };
        }
      } catch (createErr: any) {
        const msg = createErr?.message || '';
        if (msg.includes('quota') || msg.includes('permission') || createErr?.code === 403) {
          throw new Error(
            `Service Account storage quota limit: Google Service Accounts cannot create new files directly without a shared spreadsheet. ` +
            `Please create a Google Sheet in your Google Drive named '${BOOTSTRAP_SHEET_NAME}' (or any name) and share it with Editor access to: ` +
            `ficcado-sheets-service@ficcado-inventory-app.iam.gserviceaccount.com`
          );
        }
        throw createErr;
      }

      throw new Error(`Failed to create or locate ${BOOTSTRAP_SHEET_NAME} spreadsheet.`);
    } finally {
      _pendingBootstrapPromise = null;
    }
  })();

  return _pendingBootstrapPromise;
}

export function bustBootstrapCache(): void {
  _cachedSpreadsheetId = null;
  _tabsInitialized = false;
  _pendingBootstrapPromise = null;
}

/**
 * Read all key-value entries from the AppMeta tab.
 * Returns a Map<key, value>.
 */
export async function readAppMeta(): Promise<Map<string, string>> {
  const { spreadsheetId } = await getBootstrapSpreadsheetId();
  const sheets = await getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${APP_META_TAB}!A:C`,
  });
  const rows = (res.data.values ?? []) as string[][];
  const meta = new Map<string, string>();
  for (const row of rows.slice(1)) {
    if (row[0]) meta.set(row[0], row[1] || '');
  }
  return meta;
}

/**
 * Write / update a key-value pair in the AppMeta tab.
 * If the key already exists, its row is updated in place.
 * If not, a new row is appended.
 */
export async function writeAppMeta(key: string, value: string): Promise<void> {
  const { spreadsheetId } = await getBootstrapSpreadsheetId();
  const sheets = await getSheetsClient();

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${APP_META_TAB}!A:C`,
  });
  const rows = (res.data.values ?? []) as string[][];
  const rowIdx = rows.findIndex((r) => r[0] === key);
  const now = new Date().toISOString();

  if (rowIdx > 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${APP_META_TAB}!A${rowIdx + 1}:C${rowIdx + 1}`,
      valueInputOption: 'RAW',
      requestBody: { values: [[key, value, now]] },
    });
  } else {
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${APP_META_TAB}!A:C`,
      valueInputOption: 'RAW',
      requestBody: { values: [[key, value, now]] },
    });
  }
}

