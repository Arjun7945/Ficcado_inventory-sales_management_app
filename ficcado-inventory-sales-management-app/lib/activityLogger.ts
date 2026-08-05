/**
 * lib/activityLogger.ts
 *
 * Writes a human-readable activity log entry to the 'activity_log' module sheet.
 * Called by every Create/Update/Delete API handler.
 *
 * Log entry format (per spec Section 7.2):
 * "Rohith updated the Sales Management sheet on invoice number 'FIC-215' on 02/08/2026 at 5:14 PM."
 */

import { appendRows } from './google/moduleSheet';

export type ActivityAction = 'created' | 'updated' | 'deleted';

export interface ActivityLogEntry {
  adminName:   string;
  action:      ActivityAction;
  module:      string; // human-readable, e.g. "Sales Management"
  recordId:    string; // e.g. invoice number, item name
  moduleKey:   string; // e.g. 'sales'
}

/**
 * Format a date as "DD/MM/YYYY at H:MM AM/PM" matching the spec example.
 */
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

/**
 * Build the human-readable activity log message.
 * Example: "Rohith updated the Sales Management sheet on invoice number 'FIC-215' on 02/08/2026 at 5:14 PM."
 */
export function buildActivityMessage(entry: ActivityLogEntry, date: Date): string {
  const timestamp = formatTimestamp(date);
  return (
    `${entry.adminName} ${entry.action} the ${entry.module} sheet ` +
    `on record '${entry.recordId}' on ${timestamp}.`
  );
}

/**
 * Append a log entry to the Activity Log sheet.
 * Silently catches errors — activity logging must never block the primary action.
 */
export async function logActivity(entry: ActivityLogEntry): Promise<void> {
  try {
    const now = new Date();
    const message = buildActivityMessage(entry, now);

    await appendRows('activity_log', [[
      '',                   // S.No — auto-fill row number later if needed
      entry.adminName,
      entry.action,
      entry.module,
      entry.moduleKey,
      entry.recordId,
      now.toISOString(),
      message,
    ]]);
  } catch {
    // Never block the main action due to logging failure.
    // Log to server console for debugging.
    console.error('[ActivityLogger] Failed to write activity log entry:', entry);
  }
}
