/**
 * lib/google/moduleSheet.ts
 *
 * The internal SDK that every other module in the app MUST use to resolve
 * its target sheet. No module may hardcode a spreadsheet ID or tab name.
 *
 * Usage:
 *   const { spreadsheetId, tabName } = await getModuleSheet('sales');
 *   const results = await batchGet([
 *     { moduleKey: 'sales', range: 'A:P' },
 *     { moduleKey: 'replacement', range: 'A:K' },
 *   ]);
 */

import { getSheetsClient } from './sheetsClient';
import { getSheetConfig } from './sheetConfig';

export interface ModuleSheetRef {
  spreadsheetId: string;
  tabName:       string;
  displayName:   string;
}

/**
 * Resolve the spreadsheet ID and tab name for a given module key.
 * Throws a descriptive error if the module is not configured — never silently
 * falls back to a hardcoded value.
 */
export async function getModuleSheet(moduleKey: string): Promise<ModuleSheetRef> {
  const config = await getSheetConfig();
  const entry = config.get(moduleKey);

  if (!entry) {
    throw new Error(
      `Module '${moduleKey}' is not configured in Sheet Configuration. ` +
        `Go to Admin Control Centre → Sheet Configuration and add an entry for '${moduleKey}'.`
    );
  }

  return {
    spreadsheetId: entry.spreadsheetId,
    tabName:       entry.tabName,
    displayName:   entry.displayName,
  };
}

export interface BatchGetRequest {
  moduleKey: string;
  /** A1 notation range relative to the tab, e.g. 'A:P' or 'A1:Z1000' */
  range:     string;
  /** Optional label to identify this result in the response map */
  label?:    string;
}

export interface BatchGetResult {
  moduleKey:     string;
  label?:        string;
  spreadsheetId: string;
  tabName:       string;
  values:        string[][];
}

/**
 * Fetch multiple ranges from (potentially) different spreadsheets in batches.
 *
 * Groups requests by spreadsheetId so that ranges from the same spreadsheet
 * are fetched in a single batchGet API call.
 */
export async function batchGet(requests: BatchGetRequest[]): Promise<BatchGetResult[]> {
  if (requests.length === 0) return [];

  const sheets = await getSheetsClient();

  // Resolve all module keys to their sheet references
  const resolved = await Promise.all(
    requests.map(async (req) => {
      const ref = await getModuleSheet(req.moduleKey);
      return { ...req, ...ref };
    })
  );

  // Group by spreadsheetId
  const groups = new Map<string, typeof resolved>();
  for (const r of resolved) {
    const group = groups.get(r.spreadsheetId) ?? [];
    group.push(r);
    groups.set(r.spreadsheetId, group);
  }

  const results: BatchGetResult[] = [];

  for (const [spreadsheetId, group] of groups) {
    const ranges = group.map((r) => `${r.tabName}!${r.range}`);

    const res = await sheets.spreadsheets.values.batchGet({
      spreadsheetId,
      ranges,
    });

    const valueRanges = res.data.valueRanges ?? [];

    for (let i = 0; i < group.length; i++) {
      const req = group[i];
      results.push({
        moduleKey:     req.moduleKey,
        label:         req.label,
        spreadsheetId: req.spreadsheetId,
        tabName:       req.tabName,
        values:        (valueRanges[i]?.values ?? []) as string[][],
      });
    }
  }

  // Return in original request order
  const resultMap = new Map(results.map((r) => [`${r.moduleKey}:${r.label ?? ''}`, r]));
  return requests.map((req) => {
    const key = `${req.moduleKey}:${req.label ?? ''}`;
    return resultMap.get(key) ?? {
      moduleKey:     req.moduleKey,
      label:         req.label,
      spreadsheetId: '',
      tabName:       '',
      values:        [],
    };
  });
}

/** In-memory cache for module rows to eliminate redundant Google Sheets API network calls. */
interface CachedRows {
  rows: string[][];
  timestamp: number;
}
const _rowsCache = new Map<string, CachedRows>();
const DATA_CACHE_TTL_MS = 30_000; // 30 seconds TTL for fast subsequent reads

/** In-flight Promise deduplication map per moduleKey */
const _pendingReads = new Map<string, Promise<string[][]>>();

/** Manually bust the rows cache for a specific module key (or all if omitted). */
export function bustRowsCache(moduleKey?: string): void {
  if (moduleKey) {
    _rowsCache.delete(moduleKey);
    _pendingReads.delete(moduleKey);
  } else {
    _rowsCache.clear();
    _pendingReads.clear();
  }
}

/**
 * Append one or more rows to a module's sheet.
 */
export async function appendRows(
  moduleKey: string,
  rows: (string | number | boolean | null)[][]
): Promise<void> {
  bustRowsCache(moduleKey);
  const { spreadsheetId, tabName } = await getModuleSheet(moduleKey);
  const sheets = await getSheetsClient();

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${tabName}!A:A`,
    valueInputOption: 'RAW',
    requestBody: { values: rows },
  });
}

/**
 * Update a specific row (1-indexed, including header) in a module's sheet.
 */
export async function updateRow(
  moduleKey: string,
  rowIndex: number,
  values: (string | number | boolean | null)[]
): Promise<void> {
  bustRowsCache(moduleKey);
  const { spreadsheetId, tabName } = await getModuleSheet(moduleKey);
  const sheets = await getSheetsClient();

  const lastCol = columnLetter(values.length);
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${tabName}!A${rowIndex}:${lastCol}${rowIndex}`,
    valueInputOption: 'RAW',
    requestBody: { values: [values] },
  });
}

/**
 * Delete a row by clearing it (Google Sheets API doesn't shift rows on
 * clear, so we use batchUpdate to delete the row entirely).
 */
export async function deleteRow(moduleKey: string, rowIndex: number): Promise<void> {
  bustRowsCache(moduleKey);
  const { spreadsheetId, tabName } = await getModuleSheet(moduleKey);
  const sheets = await getSheetsClient();

  // First get the sheet ID (gid) for this tab
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const sheet = meta.data.sheets?.find(
    (s) => s.properties?.title === tabName
  );
  if (!sheet || sheet.properties?.sheetId == null) {
    throw new Error(`Tab '${tabName}' not found in spreadsheet '${spreadsheetId}'.`);
  }

  const sheetId = sheet.properties.sheetId;

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          deleteDimension: {
            range: {
              sheetId,
              dimension: 'ROWS',
              startIndex: rowIndex - 1, // 0-indexed
              endIndex: rowIndex,
            },
          },
        },
      ],
    },
  });
}

/**
 * Read all rows from a module's sheet (including header).
 * Returns raw string[][] — caller is responsible for parsing.
 * Uses an in-memory 30-second TTL cache and single-flight promise coalescing for maximum speed.
 */
export async function readAllRows(moduleKey: string, forceFresh = false): Promise<string[][]> {
  const now = Date.now();
  const cached = _rowsCache.get(moduleKey);

  if (!forceFresh && cached && now - cached.timestamp < DATA_CACHE_TTL_MS) {
    return cached.rows;
  }

  if (!forceFresh && _pendingReads.has(moduleKey)) {
    return _pendingReads.get(moduleKey)!;
  }

  const promise = (async () => {
    try {
      const { spreadsheetId, tabName } = await getModuleSheet(moduleKey);
      const sheets = await getSheetsClient();

      const res = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `${tabName}!A:ZZ`,
      });

      const rows = (res.data.values ?? []) as string[][];
      _rowsCache.set(moduleKey, { rows, timestamp: Date.now() });
      return rows;
    } finally {
      _pendingReads.delete(moduleKey);
    }
  })();

  _pendingReads.set(moduleKey, promise);
  return promise;
}

/** Convert a column count to a letter (1→A, 2→B, 26→Z, 27→AA, etc.) */
function columnLetter(n: number): string {
  let result = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    result = String.fromCharCode(65 + rem) + result;
    n = Math.floor((n - 1) / 26);
  }
  return result;
}
