/**
 * lib/google/sheetConfig.ts
 *
 * Reads and writes the SheetConfig tab in the bootstrap spreadsheet.
 * Returns a live mapping of moduleKey → { spreadsheetId, tabName, displayName }.
 *
 * Header-aware: checks rows from index 0, safely skips header row if present,
 * and includes automatic fallback resolution so missing module entries never break reads.
 */

import { getSheetsClient } from './sheetsClient';
import { getBootstrapSpreadsheetId, SHEET_CONFIG_TAB } from './bootstrap';
import { MODULE_REGISTRY } from './moduleRegistry';

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
 * Header-aware: checks every row, safely skips header row ('module_key').
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
      let dominantSpreadsheetId = '';

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.length < 3) continue;

        const module_key = String(row[0] ?? '').trim();
        if (!module_key || module_key.toLowerCase() === 'module_key' || module_key.toLowerCase() === 'module key') {
          continue; // Skip header row
        }

        const display_name = String(row[1] ?? module_key).trim();
        const sheet_id     = String(row[2] ?? '').trim();
        const tab_name     = String(row[3] ?? module_key).trim();
        const updated_at   = String(row[4] ?? '');
        const updated_by   = String(row[5] ?? '');

        if (sheet_id && !dominantSpreadsheetId) {
          dominantSpreadsheetId = sheet_id;
        }

        if (module_key && sheet_id && tab_name) {
          map.set(module_key, {
            moduleKey:     module_key,
            displayName:   display_name || (MODULE_REGISTRY[module_key]?.displayName ?? module_key),
            spreadsheetId: sheet_id,
            tabName:       tab_name || (MODULE_REGISTRY[module_key]?.tabName ?? module_key),
            updatedAt:     updated_at,
            updatedBy:     updated_by,
          });
        }
      }

      // Safety Fallback: Ensure all registered modules in MODULE_REGISTRY have an entry
      if (dominantSpreadsheetId) {
        for (const [key, def] of Object.entries(MODULE_REGISTRY)) {
          if (!map.has(key)) {
            map.set(key, {
              moduleKey:     key,
              displayName:   def.displayName,
              spreadsheetId: dominantSpreadsheetId,
              tabName:       def.tabName,
              updatedAt:     new Date().toISOString(),
              updatedBy:     'System Fallback',
            });
          }
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
 */
export async function setModuleConfig(
  moduleKey: string,
  updates: { spreadsheetId: string; tabName: string; displayName?: string },
  updatedBy: string
): Promise<void> {
  const { spreadsheetId: bootstrapId } = await getBootstrapSpreadsheetId();
  const sheets = await getSheetsClient();
  const updatedAt = new Date().toISOString();

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: bootstrapId,
    range: `${SHEET_CONFIG_TAB}!A:A`,
  });

  const rows = res.data.values ?? [];
  let existingRow = -1;

  for (let i = 0; i < rows.length; i++) {
    const keyInRow = String(rows[i]?.[0] ?? '').trim();
    if (keyInRow === moduleKey) {
      existingRow = i + 1;
      break;
    }
  }

  let displayName = updates.displayName;
  if (!displayName && existingRow > 0) {
    const current = await getSheetConfig();
    displayName = current.get(moduleKey)?.displayName ?? MODULE_REGISTRY[moduleKey]?.displayName ?? moduleKey;
  }
  if (!displayName) displayName = MODULE_REGISTRY[moduleKey]?.displayName ?? moduleKey;

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
  const existingMap = new Map<string, number>();

  for (let i = 0; i < rows.length; i++) {
    const key = String(rows[i]?.[0] ?? '').trim();
    if (key && key.toLowerCase() !== 'module_key' && key.toLowerCase() !== 'module key') {
      existingMap.set(key, i + 1);
    }
  }

  const registeredModules = Object.values(MODULE_REGISTRY);
  const updateRequests: any[] = [];
  const appendRowsList: any[][] = [];

  for (const mod of registeredModules) {
    const rowIndex = existingMap.get(mod.key);
    if (rowIndex) {
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

  for (const [key, rowIndex] of existingMap.entries()) {
    const existingRowData = rows[rowIndex - 1];
    const displayName = String(existingRowData[1] || key);
    const tabName = String(existingRowData[3] || key);
    updateRequests.push({
      range: `${SHEET_CONFIG_TAB}!A${rowIndex}:F${rowIndex}`,
      values: [[key, displayName, newSpreadsheetId, tabName, updatedAt, updatedBy]],
    });
  }

  if (updateRequests.length > 0) {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: bootstrapId,
      requestBody: {
        valueInputOption: 'RAW',
        data: updateRequests,
      },
    });
  }

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
