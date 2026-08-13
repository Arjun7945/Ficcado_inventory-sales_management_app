/**
 * lib/google/archival.ts
 *
 * Phase 65: Monthly Rollover Archival Strategy
 *
 * Applies to append-heavy, ever-growing log sheets:
 *   - sales_log
 *   - activity (Activity Log)
 *   - inventory_history (Inventory History Tracker)
 *
 * Strategy:
 * - The **live main tab** holds ONLY the **current month's active data**.
 * - When a month completes, all rows from that month are moved into a
 *   dedicated archive tab named `{moduleKey}_archive_YYYY_MM`
 *   (e.g., `sales_log_archive_2026_08`) and cleared from the main tab.
 * - Archive tabs are registered in Sheet Configuration under the same
 *   spreadsheet as the parent module, enabling standard `getModuleSheet()`
 *   resolution without any hardcoding.
 * - Frontend views use a Month Selector dropdown: "Current Month (Live)"
 *   queries the live tab; past months query the corresponding archive tab.
 *
 * Benefits:
 * - Main live tabs stay small (< ~500 rows at any time), ensuring fast
 *   reads and reliable UI performance even at 10,000+ row lifetime volumes.
 * - Full historical data is always accessible — nothing is ever deleted.
 * - Each archived month is a self-contained, easily auditable tab.
 */

import { getSheetsClient } from './sheetsClient';
import { getModuleSheet, readAllRows } from './moduleSheet';
import { getSheetConfig, setModuleConfig } from './sheetConfig';

/** Modules that support monthly rollover archival */
export const ARCHIVABLE_MODULES = ['sales', 'sales_log', 'activity', 'inventory_history'] as const;
export type ArchivableModule = typeof ARCHIVABLE_MODULES[number];

/**
 * Returns the archive module key for a given module and month.
 * e.g., ('sales_log', 2026, 8) → 'sales_log_archive_2026_08'
 */
export function archiveModuleKey(moduleKey: string, year: number, month: number): string {
  const mm = String(month).padStart(2, '0');
  return `${moduleKey}_archive_${year}_${mm}`;
}

/**
 * Returns a human-readable label for an archive module key.
 * e.g., 'sales_log_archive_2026_08' → 'August 2026'
 */
export function archiveLabelFromKey(key: string): string {
  const MONTHS = [
    '', 'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  const match = key.match(/_archive_(\d{4})_(\d{2})$/);
  if (!match) return key;
  const year  = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  return `${MONTHS[month] ?? match[2]} ${year}`;
}

/**
 * Derives the archive tab name used inside the spreadsheet.
 * e.g., module `sales_log` → tab prefix from display name, appended with `_archive_2026_08`
 */
function archiveTabName(baseTabName: string, year: number, month: number): string {
  const mm = String(month).padStart(2, '0');
  return `${baseTabName}_archive_${year}_${mm}`;
}

/**
 * Lists available archive months for a given module key by scanning
 * the Sheet Configuration for entries matching the archive key pattern.
 *
 * @returns Array of { key, label, year, month } sorted newest-first
 */
export async function getArchiveMonths(moduleKey: string): Promise<
  Array<{ key: string; label: string; year: number; month: number }>
> {
  const config = await getSheetConfig();
  const prefix = `${moduleKey}_archive_`;
  const results: Array<{ key: string; label: string; year: number; month: number }> = [];

  for (const [key] of config.entries()) {
    if (key.startsWith(prefix)) {
      const match = key.match(/_archive_(\d{4})_(\d{2})$/);
      if (match) {
        const year  = parseInt(match[1], 10);
        const month = parseInt(match[2], 10);
        results.push({ key, label: archiveLabelFromKey(key), year, month });
      }
    }
  }

  return results.sort((a, b) => b.year - a.year || b.month - a.month);
}

/**
 * Rolls over all completed-month rows from the live main tab to a dedicated
 * archive tab, then clears those rows from the live tab.
 *
 * @param moduleKey - One of ARCHIVABLE_MODULES
 * @param year      - The year of the month to archive (e.g., 2026)
 * @param month     - The month to archive (1-indexed, e.g., 8 for August)
/**
 * Helper to check if a row represents a completed transaction.
 * For log sheets (sales_log, activity, inventory_history), all rows are completed events.
 * For sales, an order is only completed if its status is 'Purchase Satisfied / Completed'
 * and not currently pending payment, replacement, or return/refund.
 */
function isRowCompleted(moduleKey: string, row: string[]): boolean {
  if (moduleKey !== 'sales') return true;

  const saleStatus = (row[2] ?? '').trim().toLowerCase();

  // Active / pending states MUST stay in the live tab
  const isPending =
    saleStatus.includes('pending') ||
    saleStatus.includes('requested') ||
    saleStatus.includes('order only placed') ||
    saleStatus.includes('not provided');

  if (isPending) return false;

  const isCompleted =
    saleStatus.includes('purchase satisfied') ||
    saleStatus.includes('completed') ||
    saleStatus.includes('satisfied');

  return isCompleted || !isPending;
}

/**
 * Rolls over all completed-month rows from the live main tab to a dedicated
 * archive tab, then clears those rows from the live tab.
 *
 * @param moduleKey - One of ARCHIVABLE_MODULES
 * @param year      - The year of the month to archive (e.g., 2026)
 * @param month     - The month to archive (1-indexed, e.g., 8 for August)
 * @param createdAtColIndex - Column index (0-based) of the "Created At" timestamp field
 *
 * @returns { archivedCount } — number of rows archived
 */
export async function rolloverCompletedMonth(params: {
  moduleKey:         string;
  year:              number;
  month:             number;
  createdAtColIndex: number;
}): Promise<{ archivedCount: number }> {
  const { moduleKey, year, month, createdAtColIndex } = params;

  const { spreadsheetId, tabName, displayName } = await getModuleSheet(moduleKey);
  const sheets = await getSheetsClient();

  // 1. Read all rows from live tab
  const allRows = await readAllRows(moduleKey, /* forceFresh= */ true);
  if (allRows.length < 2) return { archivedCount: 0 };

  const headerRow = allRows[0];

  // 2. Separate rows belonging to target month vs. everything else
  const targetRows: string[][] = [];
  const remainingRows: string[][] = [];

  for (let i = 1; i < allRows.length; i++) {
    const row = allRows[i];
    const createdAt = row[createdAtColIndex] ?? '';
    if (!createdAt) {
      remainingRows.push(row); // keep rows without timestamps in live tab
      continue;
    }
    const d = new Date(createdAt);
    const isTargetMonth = !isNaN(d.getTime()) && d.getUTCFullYear() === year && d.getUTCMonth() + 1 === month;
    const completed = isRowCompleted(moduleKey, row);

    // Only archive if it belongs to the target month AND is completed
    if (isTargetMonth && completed) {
      targetRows.push(row);
    } else {
      remainingRows.push(row); // Pending / uncompleted sales stay in live tab
    }
  }

  if (targetRows.length === 0) return { archivedCount: 0 };

  // 3. Get or create the archive tab
  const archiveTab = archiveTabName(tabName, year, month);
  const archiveKey = archiveModuleKey(moduleKey, year, month);

  // Check if archive tab already exists in the spreadsheet
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const existingTab = meta.data.sheets?.find((s) => s.properties?.title === archiveTab);

  if (!existingTab) {
    // Create new archive tab
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          { addSheet: { properties: { title: archiveTab } } },
        ],
      },
    });
  }

  // 4. Write/Append header + target rows to archive tab
  if (existingTab) {
    // Tab already exists: fetch existing archive rows, append targetRows (deduplicating by invoice # or row content)
    const existingRes = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${archiveTab}!A:ZZ`,
    });
    const existingArchiveRows = (existingRes.data.values ?? []) as string[][];
    const existingKeys = new Set(existingArchiveRows.slice(1).map((r) => r[1] ?? r[0]));

    const newRowsToAppend = targetRows.filter((r) => !existingKeys.has(r[1] ?? r[0]));
    if (newRowsToAppend.length > 0) {
      const updatedArchiveValues = [...existingArchiveRows, ...newRowsToAppend];
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${archiveTab}!A1`,
        valueInputOption: 'RAW',
        requestBody: { values: updatedArchiveValues },
      });
    }
  } else {
    // New tab: write header + target rows
    const archiveValues = [headerRow, ...targetRows];
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${archiveTab}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: archiveValues },
    });
  }

  // 5. Overwrite live tab with header + remaining rows
  const liveValues = [headerRow, ...remainingRows];
  // First clear entire sheet, then write back
  await sheets.spreadsheets.values.clear({
    spreadsheetId,
    range: `${tabName}!A:ZZ`,
  });
  if (liveValues.length > 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${tabName}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: liveValues },
    });
  }

  // 6. Register archive tab in Sheet Configuration
  const config = await getSheetConfig();
  if (!config.has(archiveKey)) {
    const archiveLabel = archiveLabelFromKey(archiveKey);
    await setModuleConfig(
      archiveKey,
      {
        spreadsheetId,
        tabName: archiveTab,
        displayName: `${displayName} Archive — ${archiveLabel}`,
      },
      'system'
    );
  }

  return { archivedCount: targetRows.length };
}

/**
 * Convenience: Archive all completed months (everything before the current month)
 * for a given module in one call.
 *
 * @returns Array of results, one per archived month
 */
export async function archiveAllCompletedMonths(
  moduleKey: string,
  createdAtColIndex: number
): Promise<Array<{ year: number; month: number; archivedCount: number }>> {
  const allRows = await readAllRows(moduleKey, /* forceFresh= */ true);
  if (allRows.length < 2) return [];

  const now = new Date();
  const currentYear  = now.getUTCFullYear();
  const currentMonth = now.getUTCMonth() + 1;

  // Collect unique year+month combinations present in the data
  const monthSet = new Set<string>();
  for (let i = 1; i < allRows.length; i++) {
    const createdAt = allRows[i][createdAtColIndex] ?? '';
    if (!createdAt) continue;
    const d = new Date(createdAt);
    if (isNaN(d.getTime())) continue;
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth() + 1;
    // Skip current month — only archive completed months
    if (y === currentYear && m === currentMonth) continue;
    monthSet.add(`${y}_${m}`);
  }

  const results = [];
  for (const ym of monthSet) {
    const [year, month] = ym.split('_').map(Number);
    const result = await rolloverCompletedMonth({ moduleKey, year, month, createdAtColIndex });
    results.push({ year, month, archivedCount: result.archivedCount });
  }
  return results;
}
