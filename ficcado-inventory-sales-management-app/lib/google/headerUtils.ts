/**
 * lib/google/headerUtils.ts
 *
 * Header-based sheet column resolution and schema verification safeguard.
 * Ensures Google Sheet reads/writes NEVER rely on hardcoded positional column indices.
 */

/** Build a Map of lowercase header name -> zero-based column index */
export function buildHeaderMap(headerRow: string[]): Map<string, number> {
  const map = new Map<string, number>();
  if (!headerRow) return map;
  headerRow.forEach((colName, index) => {
    if (colName && typeof colName === 'string') {
      map.set(colName.trim().toLowerCase(), index);
    }
  });
  return map;
}

/** Retrieve cell value from row using header name lookup */
export function getCellByHeader(
  row: string[],
  headerMap: Map<string, number>,
  headerName: string,
  defaultValue = ''
): string {
  const idx = headerMap.get(headerName.trim().toLowerCase());
  if (idx === undefined || idx < 0 || idx >= row.length) {
    return defaultValue;
  }
  return row[idx] ?? defaultValue;
}

/** Convert a row array into a key-value object using header names */
export function mapRowToObject(
  row: string[],
  headerRow: string[]
): Record<string, string> {
  const obj: Record<string, string> = {};
  headerRow.forEach((header, index) => {
    if (header) {
      obj[header.trim()] = row[index] ?? '';
    }
  });
  return obj;
}

/**
 * Convert a key-value row object into a formatted string array matching exact header column order.
 * Unmatched fields default to empty string ('').
 */
export function formatRowFromHeaderMap(
  rowObj: Record<string, string | number | boolean | null | undefined>,
  headerRow: string[]
): string[] {
  return headerRow.map((colName) => {
    const targetKey = colName.trim().toLowerCase();
    const matchKey = Object.keys(rowObj).find((k) => k.trim().toLowerCase() === targetKey);
    if (matchKey !== undefined && rowObj[matchKey] !== undefined && rowObj[matchKey] !== null) {
      return String(rowObj[matchKey]);
    }
    return '';
  });
}

/** In-memory set of verified module keys per session to avoid noisy repeated console warnings */
const _verifiedModules = new Set<string>();

/**
 * Verify that an actual sheet header row contains all expected headers for a module.
 * Logs a clear warning if columns are missing or reordered.
 */
export function verifySheetHeaders(
  moduleKey: string,
  actualHeaderRow: string[],
  expectedHeaders: string[]
): { valid: boolean; missingHeaders: string[] } {
  if (!_verifiedModules.has(moduleKey)) {
    const actualMap = buildHeaderMap(actualHeaderRow);
    const missingHeaders: string[] = [];

    for (const expected of expectedHeaders) {
      if (!actualMap.has(expected.trim().toLowerCase())) {
        missingHeaders.push(expected);
      }
    }

    if (missingHeaders.length > 0) {
      console.warn(
        `[Header Safeguard Warning] Sheet for module '${moduleKey}' is missing expected header(s): ${missingHeaders.join(
          ', '
        )}. Position lookups will fall back gracefully, but please check Google Sheets tab headers.`
      );
    }
    _verifiedModules.add(moduleKey);
    return { valid: missingHeaders.length === 0, missingHeaders };
  }
  return { valid: true, missingHeaders: [] };
}
