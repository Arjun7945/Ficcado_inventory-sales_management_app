/**
 * lib/google/sheetConfig.ts
 *
 * Reads and writes the SheetConfig tab in the bootstrap spreadsheet.
 * Returns a live mapping of moduleKey → { spreadsheetId, tabName, displayName }.
 *
 * This is the ONLY place that resolves module-to-sheet mappings.
 * Every other module in the app must call getModuleSheet() instead of
 * hardcoding a spreadsheet ID or tab name.
 */

import { getSheetsClient } from './sheetsClient';
import { getBootstrapSpreadsheetId, SHEET_CONFIG_TAB } from './bootstrap';

export interface ModuleSheetConfig {
  moduleKey:     string;
  displayName:   string;
  spreadsheetId: string;
  tabName:       string;
  updatedAt:     string;
  updatedBy:     string;
}

/** Module-level cache with timestamp for TTL-based invalidation. */
let _configCache: Map<string, ModuleSheetConfig> | null = null;
let _cacheTimestamp = 0;
const CACHE_TTL_MS = 30_000; // 30 seconds
let _pendingConfigPromise: Promise<Map<string, ModuleSheetConfig>> | null = null;

/** Bust the SheetConfig cache (call after any admin updates the config). */
export function bustConfigCache(): void {
  _configCache = null;
  _cacheTimestamp = 0;
  _pendingConfigPromise = null;
}

/**
 * Read all rows from SheetConfig and return as a Map keyed by moduleKey.
 * Uses a 30-second in-memory TTL cache with single-flight request coalescing.
 */
export async function getSheetConfig(): Promise<Map<string, ModuleSheetConfig>> {
  const now = Date.now();
  if (_configCache && now - _cacheTimestamp < CACHE_TTL_MS) {
    return _configCache;
  }

  if (_pendingConfigPromise) {
    return _pendingConfigPromise;
  }

  _pendingConfigPromise = (async () => {
    try {
      const { spreadsheetId } = await getBootstrapSpreadsheetId();
      const sheets = await getSheetsClient();

      const res = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `${SHEET_CONFIG_TAB}!A:F`,
      });

      const rows = res.data.values ?? [];
      const map = new Map<string, ModuleSheetConfig>();

      // Skip header row (index 0)
      for (let i = 1; i < rows.length; i++) {
        const [module_key, display_name, sheet_id, tab_name, updated_at, updated_by] = rows[i];
        if (module_key && sheet_id && tab_name) {
          map.set(String(module_key), {
            moduleKey:     String(module_key),
            displayName:   String(display_name ?? module_key),
            spreadsheetId: String(sheet_id),
            tabName:       String(tab_name),
            updatedAt:     String(updated_at ?? ''),
            updatedBy:     String(updated_by ?? ''),
          });
        }
      }

      _configCache = map;
      _cacheTimestamp = Date.now();
      return map;
    } finally {
      _pendingConfigPromise = null;
    }
  })();

  return _pendingConfigPromise;
}

/**
 * Write or update a single module entry in SheetConfig.
 * Also busts the cache so subsequent reads get fresh data.
 */
export async function setModuleConfig(
  moduleKey: string,
  updates: { spreadsheetId: string; tabName: string; displayName?: string },
  updatedBy: string
): Promise<void> {
  const { spreadsheetId: bootstrapId } = await getBootstrapSpreadsheetId();
  const sheets = await getSheetsClient();
  const updatedAt = new Date().toISOString();

  // Find existing row for this moduleKey
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: bootstrapId,
    range: `${SHEET_CONFIG_TAB}!A:A`,
  });

  const rows = res.data.values ?? [];
  let existingRow = -1;

  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === moduleKey) {
      existingRow = i + 1;
      break;
    }
  }

  // Get the current display name to preserve it if not being updated
  let displayName = updates.displayName;
  if (!displayName && existingRow > 0) {
    const current = await getSheetConfig();
    displayName = current.get(moduleKey)?.displayName ?? moduleKey;
  }
  if (!displayName) displayName = moduleKey;

  const rowData = [moduleKey, displayName, updates.spreadsheetId, updates.tabName, updatedAt, updatedBy];

  if (existingRow > 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: bootstrapId,
      range: `${SHEET_CONFIG_TAB}!A${existingRow}:F${existingRow}`,
      valueInputOption: 'RAW',
      requestBody: { values: [rowData] },
    });
  } else {
    await sheets.spreadsheets.values.append({
      spreadsheetId: bootstrapId,
      range: `${SHEET_CONFIG_TAB}!A:F`,
      valueInputOption: 'RAW',
      requestBody: { values: [rowData] },
    });
  }

  bustConfigCache();
}

/**
 * Get all module configs as an array (for the Admin Control Centre UI).
 */
export async function getAllModuleConfigs(): Promise<ModuleSheetConfig[]> {
  const map = await getSheetConfig();
  return Array.from(map.values());
}

/**
 * Update the global Spreadsheet ID for all modules in SheetConfig.
 * Preserves tab names and display names while propagating the single global ID.
 */
export async function updateGlobalSpreadsheetId(
  newSpreadsheetId: string,
  updatedBy: string
): Promise<void> {
  const { spreadsheetId: bootstrapId } = await getBootstrapSpreadsheetId();
  const sheets = await getSheetsClient();
  const updatedAt = new Date().toISOString();

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: bootstrapId,
    range: `${SHEET_CONFIG_TAB}!A:F`,
  });

  const rows = res.data.values ?? [];
  const existingMap = new Map<string, number>(); // moduleKey -> rowIndex (1-indexed)

  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0]) {
      existingMap.set(String(rows[i][0]), i + 1);
    }
  }

  // Get dynamic module registry to ensure every current module is updated or appended
  const { getRegisteredModules } = await import('./moduleRegistry');
  const registeredModules = getRegisteredModules();

  const updateRequests: any[] = [];
  const appendRowsList: any[][] = [];

  for (const mod of registeredModules) {
    const rowIndex = existingMap.get(mod.key);
    if (rowIndex) {
      // Get existing display name and tab name if present, else fallback to registry
      const existingRowData = rows[rowIndex - 1];
      const displayName = String(existingRowData[1] || mod.displayName);
      const tabName = String(existingRowData[3] || mod.tabName);

      updateRequests.push({
        range: `${SHEET_CONFIG_TAB}!A${rowIndex}:F${rowIndex}`,
        values: [[mod.key, displayName, newSpreadsheetId, tabName, updatedAt, updatedBy]],
      });
      existingMap.delete(mod.key);
    } else {
      appendRowsList.push([mod.key, mod.displayName, newSpreadsheetId, mod.tabName, updatedAt, updatedBy]);
    }
  }

  // Update any remaining existing rows that might not be in MODULE_REGISTRY
  for (const [key, rowIndex] of existingMap.entries()) {
    const existingRowData = rows[rowIndex - 1];
    const displayName = String(existingRowData[1] || key);
    const tabName = String(existingRowData[3] || key);
    updateRequests.push({
      range: `${SHEET_CONFIG_TAB}!A${rowIndex}:F${rowIndex}`,
      values: [[key, displayName, newSpreadsheetId, tabName, updatedAt, updatedBy]],
    });
  }

  // Perform batch updates for existing rows
  if (updateRequests.length > 0) {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: bootstrapId,
      requestBody: {
        valueInputOption: 'RAW',
        data: updateRequests,
      },
    });
  }

  // Append any missing registered module rows
  if (appendRowsList.length > 0) {
    await sheets.spreadsheets.values.append({
      spreadsheetId: bootstrapId,
      range: `${SHEET_CONFIG_TAB}!A:F`,
      valueInputOption: 'RAW',
      requestBody: { values: appendRowsList },
    });
  }

  bustConfigCache();
}

