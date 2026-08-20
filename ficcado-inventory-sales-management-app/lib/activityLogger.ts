/**
 * lib/activityLogger.ts
 *
 * Writes a human-readable activity log entry to the 'activity_log' module sheet.
 * Called by every Create/Update/Delete API handler.
 *
 * Header-mapped & Auto-Header synced formatting.
 */

import { appendRows, readAllRows, updateRow } from './google/moduleSheet';
import { formatRowFromHeaderMap } from './google/headerUtils';
import { MODULE_REGISTRY } from './google/moduleRegistry';

export type ActivityAction = 'created' | 'updated' | 'deleted';

export interface ActivityLogEntry {
  adminName:      string;
  action:         ActivityAction;
  module:         string; // human-readable, e.g. "Sales Management"
  recordId:       string; // e.g. invoice number, item name
  moduleKey:      string; // e.g. 'sales'
  customMessage?: string; // Optional detailed transaction-aware sentence
}

const EXPECTED_HEADERS = MODULE_REGISTRY.activity_log.headers;

function formatTimestamp(date: Date): string {
  const day   = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year  = date.getFullYear();

  let hours   = date.getHours();
  const mins  = String(date.getMinutes()).padStart(2, '0');
  const ampm  = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;

  return `${day}/${month}/${year} at ${hours}:${mins} ${ampm}`;
}

export function buildActivityMessage(entry: ActivityLogEntry, date: Date): string {
  if (entry.customMessage) {
    return entry.customMessage;
  }
  const timestamp = formatTimestamp(date);
  return (
    `${entry.adminName} ${entry.action} the ${entry.module} sheet ` +
    `on record '${entry.recordId}' on ${timestamp}.`
  );
}

export async function logActivity(entry: ActivityLogEntry): Promise<void> {
  try {
    const now = new Date();
    const message = buildActivityMessage(entry, now);

    const rows = await readAllRows('activity_log').catch(() => []);
    if (rows.length === 0 || (rows[0] && rows[0].length < EXPECTED_HEADERS.length)) {
      await updateRow('activity_log', 1, EXPECTED_HEADERS).catch(() => {});
    }

    const sno = String(Math.max(rows.length - 1, 0) + 1);

    const logObj = {
      'S.No':       sno,
      'Admin Name': entry.adminName,
      'Action':     entry.action,
      'Module':     entry.module,
      'Module Key': entry.moduleKey,
      'Record ID':  entry.recordId,
      'Timestamp':  now.toISOString(),
      'Message':    message,
    };

    const newRow = formatRowFromHeaderMap(logObj, EXPECTED_HEADERS);
    await appendRows('activity_log', [newRow]);
  } catch (err) {
    console.error('[ActivityLogger] Failed to write activity log entry:', entry, err);
  }
}
