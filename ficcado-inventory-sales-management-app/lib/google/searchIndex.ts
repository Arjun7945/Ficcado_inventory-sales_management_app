/**
 * lib/google/searchIndex.ts
 *
 * Phase 64: Lightweight Search Index
 *
 * Maintains a dedicated "Search Index" tab per searchable module to enable
 * fast O(small-index) lookups by search key, avoiding full-sheet linear scans.
 *
 * Design:
 * - Each searchable module has an index tab registered in Sheet Configuration
 *   under the key `{moduleKey}_search_index` in the SAME spreadsheet as the module.
 * - Index tab schema: [searchKey (normalized), rowIndex (1-based, incl. header), moduleKey]
 * - Writes: every create/update operation for searchable modules calls `updateSearchIndex()`
 *   to upsert the index entry.
 * - Reads: `lookupSearchIndex()` reads the compact index tab (never the main sheet) to
 *   find the row, then fetches only that row from the main sheet.
 * - Rebuild: `buildSearchIndex()` is used for the initial population and can be triggered
 *   by admins via the Admin Control Centre → POST /api/setup/rebuild-search-index.
 *
 * Searchable modules & their indexed fields:
 * - sales:          invoiceNumber, customerName, customerPhone
 * - inventory:      itemName
 * - items:          itemName
 * - customer_info:  phone, customerName
 */

import { getSheetsClient } from './sheetsClient';
import { getModuleSheet, readAllRows } from './moduleSheet';
import { setModuleConfig, getSheetConfig } from './sheetConfig';

export type SearchableModule = 'sales' | 'inventory' | 'items' | 'customer_info';

const INDEX_SUFFIX = '_search_index';

function indexModuleKey(moduleKey: string): string {
  return `${moduleKey}${INDEX_SUFFIX}`;
}

/**
 * Get or create the search index tab for a module.
 * The index tab lives in the same spreadsheet as the module.
 * Returns the { spreadsheetId, tabName } of the index tab.
 */
async function ensureIndexTab(moduleKey: string): Promise<{ spreadsheetId: string; tabName: string }> {
  const { spreadsheetId, tabName: mainTab } = await getModuleSheet(moduleKey);
  const indexKey = indexModuleKey(moduleKey);
  const indexTab = `${mainTab}_search_index`;
  const sheets = await getSheetsClient();

  const config = await getSheetConfig();
  if (!config.has(indexKey)) {
    // Create the index tab if it doesn't exist
    const meta = await sheets.spreadsheets.get({ spreadsheetId });
    const exists = meta.data.sheets?.some((s) => s.properties?.title === indexTab);
    if (!exists) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: { requests: [{ addSheet: { properties: { title: indexTab } } }] },
      });
      // Write header row
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${indexTab}!A1:C1`,
        valueInputOption: 'RAW',
        requestBody: { values: [['searchKey', 'rowIndex', 'moduleKey']] },
      });
    }

    // Register in Sheet Configuration
    await setModuleConfig(
      indexKey,
      { spreadsheetId, tabName: indexTab, displayName: `${moduleKey} Search Index` },
      'system'
    );
  }

  return { spreadsheetId, tabName: indexTab };
}

/**
 * Upsert a search index entry for a given module + key + rowIndex.
 * Called on every write (create/update) to the searchable module.
 *
 * @param moduleKey - The searchable module (e.g., 'sales')
 * @param rowIndex  - The 1-based row index (including header) in the main sheet
 * @param searchKey - Normalized search string (e.g., invoiceNumber, phone, itemName)
 */
export async function updateSearchIndex(
  moduleKey: string,
  rowIndex: number,
  searchKey: string
): Promise<void> {
  if (!searchKey) return;
  const normalizedKey = searchKey.trim().toLowerCase();
  const sheets = await getSheetsClient();

  const { spreadsheetId, tabName } = await ensureIndexTab(moduleKey);

  // Read existing index to find if this key already has an entry
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${tabName}!A:C`,
  });
  const rows = (res.data.values ?? []) as string[][];

  let existingRowNum = -1;
  for (let i = 1; i < rows.length; i++) {
    if ((rows[i][0] ?? '').toLowerCase() === normalizedKey) {
      existingRowNum = i + 1; // 1-based sheet row
      break;
    }
  }

  const entry = [normalizedKey, String(rowIndex), moduleKey];

  if (existingRowNum > 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${tabName}!A${existingRowNum}:C${existingRowNum}`,
      valueInputOption: 'RAW',
      requestBody: { values: [entry] },
    });
  } else {
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${tabName}!A:C`,
      valueInputOption: 'RAW',
      requestBody: { values: [entry] },
    });
  }
}

/**
 * Look up the row index for a given search key in the module's index.
 * Returns the 1-based row index in the MAIN sheet, or null if not found.
 *
 * @param moduleKey - The searchable module
 * @param searchKey - The key to look up (case-insensitive)
 */
export async function lookupSearchIndex(
  moduleKey: string,
  searchKey: string
): Promise<number | null> {
  if (!searchKey) return null;
  const normalizedKey = searchKey.trim().toLowerCase();

  const config = await getSheetConfig();
  const indexKey = indexModuleKey(moduleKey);
  if (!config.has(indexKey)) return null; // Index not yet built

  const sheets = await getSheetsClient();
  const entry = config.get(indexKey)!;

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: entry.spreadsheetId,
    range: `${entry.tabName}!A:B`,
  });
  const rows = (res.data.values ?? []) as string[][];

  for (let i = 1; i < rows.length; i++) {
    if ((rows[i][0] ?? '').toLowerCase() === normalizedKey) {
      const rowIdx = parseInt(rows[i][1] ?? '0', 10);
      return rowIdx > 0 ? rowIdx : null;
    }
  }
  return null;
}

/**
 * Rebuild the entire search index for a module from scratch.
 * This reads all rows from the main sheet and repopulates the index tab.
 * Use for initial setup or after bulk data imports.
 *
 * @param moduleKey    - The module to rebuild the index for
 * @param keyExtractor - Function that extracts search keys from a row (returns array of keys)
 */
export async function buildSearchIndex(
  moduleKey: string,
  keyExtractor: (row: string[], rowIndex: number) => string[]
): Promise<{ indexedCount: number }> {
  const sheets = await getSheetsClient();
  const { spreadsheetId, tabName } = await ensureIndexTab(moduleKey);

  // Clear existing index entries (keep header)
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const sheet = meta.data.sheets?.find((s) => s.properties?.title === tabName);
  if (sheet?.properties?.sheetId != null) {
    // Clear from row 2 downward
    await sheets.spreadsheets.values.clear({
      spreadsheetId,
      range: `${tabName}!A2:C`,
    });
  }

  // Read main sheet
  const mainRows = await readAllRows(moduleKey, /* forceFresh= */ true);

  const indexEntries: string[][] = [];
  for (let i = 1; i < mainRows.length; i++) {
    const row = mainRows[i];
    const rowIndex = i + 1; // 1-based (row 1 = header)
    const keys = keyExtractor(row, rowIndex);
    for (const key of keys) {
      if (key.trim()) {
        indexEntries.push([key.trim().toLowerCase(), String(rowIndex), moduleKey]);
      }
    }
  }

  if (indexEntries.length > 0) {
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${tabName}!A:C`,
      valueInputOption: 'RAW',
      requestBody: { values: indexEntries },
    });
  }

  return { indexedCount: indexEntries.length };
}

/**
 * Default key extractors for each searchable module.
 * These define what fields are indexed per module.
 */
export const DEFAULT_KEY_EXTRACTORS: Record<SearchableModule, (row: string[], rowIndex: number) => string[]> = {
  sales: (row) => {
    // Col 1 = invoiceNumber, Col 3 = customerName, Col 4 = customerPhone
    const keys: string[] = [];
    if (row[1]) keys.push(row[1]); // invoiceNumber
    if (row[3]) keys.push(row[3]); // customerName
    if (row[4]) keys.push(row[4]); // customerPhone
    return keys;
  },
  inventory: (row) => {
    // Col 1 = itemName, Col 2 = size
    const keys: string[] = [];
    if (row[1]) keys.push(row[1]);
    if (row[1] && row[2]) keys.push(`${row[1]}:${row[2]}`); // itemName:size composite
    return keys;
  },
  items: (row) => {
    // Col 1 = itemName
    return row[1] ? [row[1]] : [];
  },
  customer_info: (row) => {
    // Col 2 = phone, Col 1 = customerName
    const keys: string[] = [];
    if (row[2]) keys.push(row[2]); // phone
    if (row[1]) keys.push(row[1]); // customerName
    return keys;
  },
};
