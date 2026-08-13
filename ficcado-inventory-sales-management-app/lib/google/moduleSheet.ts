/**
 * lib/google/moduleSheet.ts
 *
 * The internal SDK that every other module in the app MUST use to resolve
 * its target sheet. No module may hardcode a spreadsheet ID or tab name.
 *
 * Performance-optimized for 10-15 concurrent admin users via in-memory 30s TTL
 * caching, single-flight promise coalescing, and batchUpdate API support.
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
 * Throws a descriptive error if the module is not configured.
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
 * Groups requests by spreadsheetId so ranges are fetched in a single API call.
 */
export async function batchGet(requests: BatchGetRequest[]): Promise<BatchGetResult[]> {
  if (requests.length === 0) return [];

  const sheets = await getSheetsClient();

  const resolved = await Promise.all(
    requests.map(async (req) => {
      const ref = await getModuleSheet(req.moduleKey);
      return { ...req, ...ref };
    })
  );

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

export interface BatchUpdateRowItem {
  moduleKey: string;
  rowIndex: number;
  values: (string | number | boolean | null)[];
}

/**
 * Update multiple rows across one or more module sheets in batched HTTP calls.
 * Reduces 5-10 sequential Google Sheets updates down to 1 network request per spreadsheet ID!
 */
export async function batchUpdateRows(updates: BatchUpdateRowItem[]): Promise<void> {
  if (updates.length === 0) return;

  const sheets = await getSheetsClient();
  const moduleKeys = new Set(updates.map((u) => u.moduleKey));
  moduleKeys.forEach((key) => bustRowsCache(key));

  const resolved = await Promise.all(
    updates.map(async (u) => {
      const ref = await getModuleSheet(u.moduleKey);
      return { ...u, ...ref };
    })
  );

  const groups = new Map<string, typeof resolved>();
  for (const r of resolved) {
    const group = groups.get(r.spreadsheetId) ?? [];
    group.push(r);
    groups.set(r.spreadsheetId, group);
  }

  for (const [spreadsheetId, group] of groups) {
    const data = group.map((item) => {
      const lastCol = columnLetter(item.values.length);
      return {
        range: `${item.tabName}!A${item.rowIndex}:${lastCol}${item.rowIndex}`,
        values: [item.values],
      };
    });

    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: {
        valueInputOption: 'RAW',
        data,
      },
    });
  }
}

/**
 * Delete a row by clearing it (using batchUpdate to delete the row entirely).
 */
export async function deleteRow(moduleKey: string, rowIndex: number): Promise<void> {
  bustRowsCache(moduleKey);
  const { spreadsheetId, tabName } = await getModuleSheet(moduleKey);
  const sheets = await getSheetsClient();

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
              startIndex: rowIndex - 1,
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
 * Uses an in-memory 30-second TTL cache and single-flight promise coalescing for concurrent admins.
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

// ─────────────────────────────────────────────────────────────────────────────
// Phase 63: Server-Side Paginated Read
// ─────────────────────────────────────────────────────────────────────────────

export interface PagedRows {
  /** Data rows only (header excluded) */
  rows:        string[][];
  /** Header row (row 1 of the sheet) */
  header:      string[];
  /** Total data row count (excludes header) */
  total:       number;
  /** Total number of pages */
  totalPages:  number;
  /** Current page (1-indexed) */
  page:        number;
  pageSize:    number;
}

/**
 * Read a specific page of rows from a module's sheet.
 *
 * For append-heavy log sheets (Sales Log, Activity Log, Inventory History),
 * pass `fromEnd = true` so page 1 is the most recent data and pages increase
 * toward older data.
 *
 * Behaviour:
 * - Always fetches the header (row 1) in a separate lightweight call.
 * - Fetches only the requested row window from the sheet, not the entire range.
 * - Total row count is estimated from the spreadsheet's grid properties (no full fetch).
 *
 * @param moduleKey - The module identifier (e.g. 'sales', 'sales_log')
 * @param page      - 1-indexed page number
 * @param pageSize  - Rows per page (default 50)
 * @param fromEnd   - If true, page 1 = last N rows (newest first). Default: false
 */
export async function readRowsPage(
  moduleKey: string,
  page: number = 1,
  pageSize: number = 50,
  fromEnd: boolean = false,
): Promise<PagedRows> {
  const { spreadsheetId, tabName } = await getModuleSheet(moduleKey);
  const sheets = await getSheetsClient();

  // 1. Lightweight fetch of column A to count data rows
  const colARes = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${tabName}!A:A`,
  });
  const colAValues = (colARes.data.values ?? []) as string[][];
  // Total data rows = rows with content minus header
  const totalData = Math.max(0, colAValues.length - 1);
  const totalPages = Math.max(1, Math.ceil(totalData / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);

  // 2. Fetch header separately (row 1)
  const headerRes = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${tabName}!1:1`,
  });
  const header = ((headerRes.data.values ?? [[]])[0] ?? []) as string[];

  // 3. Compute start/end row indices (1-indexed, inclusive, data rows start at row 2)
  let startDataRow: number;
  let endDataRow: number;

  if (fromEnd) {
    // Page 1 = last pageSize rows, page 2 = preceding pageSize rows, etc.
    // endDataRow is the last data row for this page (counting from end)
    endDataRow   = Math.max(2, totalData + 1 - (safePage - 1) * pageSize);
    startDataRow = Math.max(2, endDataRow - pageSize + 1);
  } else {
    startDataRow = 2 + (safePage - 1) * pageSize;
    endDataRow   = Math.min(startDataRow + pageSize - 1, totalData + 1);
  }

  if (startDataRow > endDataRow || totalData === 0) {
    return { rows: [], header, total: totalData, totalPages, page: safePage, pageSize };
  }

  // 4. Fetch only the target row window
  const dataRes = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${tabName}!${startDataRow}:${endDataRow}`,
  });
  let rows = ((dataRes.data.values ?? []) as string[][]);

  // For fromEnd, reverse so newest is first
  if (fromEnd) rows = rows.reverse();

  return { rows, header, total: totalData, totalPages, page: safePage, pageSize };
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 66: Retry-with-Backoff for Sheets API Rate Limits
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Wraps any async Sheets API operation with exponential retry backoff.
 * Retries up to 3 times on HTTP 429 (rate limit) or 503 (transient) errors.
 *
 * @param fn - The async function to wrap
 */
export async function withRetryBackoff<T>(fn: () => Promise<T>): Promise<T> {
  const MAX_RETRIES = 3;
  const BASE_DELAY_MS = 1000;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      const isRetryable =
        err instanceof Error &&
        (err.message.includes('429') || err.message.includes('503') ||
         err.message.includes('Rate Limit') || err.message.includes('quota'));

      if (isRetryable && attempt < MAX_RETRIES) {
        const delay = BASE_DELAY_MS * Math.pow(2, attempt); // 1s, 2s, 4s
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      throw err;
    }
  }
  // Unreachable but TypeScript needs this
  throw new Error('Exceeded max retries');
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 66: Server-Side Dashboard Stats Cache (60s TTL)
// ─────────────────────────────────────────────────────────────────────────────

interface StatsCache {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  stats: any;
  computedAt: number;
}

/** Server-side in-memory dashboard stats cache. Shared across concurrent requests. */
let _dashboardStatsCache: StatsCache | null = null;
const DASHBOARD_CACHE_TTL_MS = 60_000; // 60 seconds

/** Sales Log preview widget cache (10 most recent items) */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _salesLogPreviewCache: { logs: any[]; computedAt: number } | null = null;
const SALES_LOG_PREVIEW_TTL_MS = 30_000; // 30 seconds

export function getDashboardStatsCache(): StatsCache | null {
  if (!_dashboardStatsCache) return null;
  if (Date.now() - _dashboardStatsCache.computedAt > DASHBOARD_CACHE_TTL_MS) {
    _dashboardStatsCache = null;
    return null;
  }
  return _dashboardStatsCache;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function setDashboardStatsCache(stats: any): void {
  _dashboardStatsCache = { stats, computedAt: Date.now() };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getSalesLogPreviewCache(): { logs: any[] } | null {
  if (!_salesLogPreviewCache) return null;
  if (Date.now() - _salesLogPreviewCache.computedAt > SALES_LOG_PREVIEW_TTL_MS) {
    _salesLogPreviewCache = null;
    return null;
  }
  return _salesLogPreviewCache;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function setSalesLogPreviewCache(logs: any[]): void {
  _salesLogPreviewCache = { logs, computedAt: Date.now() };
}

export function bustSalesLogPreviewCache(): void {
  _salesLogPreviewCache = null;
}

