/**
 * lib/dateUtils.ts
 *
 * Single shared date/time formatting utility for Ficcado.
 *
 * RULE: Every date/time displayed in the UI MUST call formatISTDateTime() or formatISTTextTimestamps().
 * Never use toLocaleDateString / toLocaleString / toLocaleTimeString ad-hoc anywhere.
 *
 * Converts a raw UTC-stored ISO timestamp to IST (UTC+5:30) and formats it as:
 *   "DD Month YYYY, H:MM:SS AM/PM"
 *   e.g., "12 August 2026, 9:52:44 PM"
 *
 * The underlying stored value in Google Sheets is kept in precise ISO form for
 * accurate sorting and audit integrity — only the displayed value changes.
 */

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;

const IST_OFFSET_MS = 330 * 60 * 1000; // +5 hours 30 mins = 330 minutes

/** Helper: Parse a raw timestamp string and return a Date shifted to IST. Returns null if invalid/empty. */
function parseToISTDate(raw: string | null | undefined): Date | null {
  if (!raw || !raw.trim()) return null;
  const utcMs = Date.parse(raw);
  if (isNaN(utcMs)) return null;
  return new Date(utcMs + IST_OFFSET_MS);
}

/**
 * Format a raw stored timestamp as a human-readable IST date/time string.
 *
 * @param raw - ISO 8601 string (e.g. "2026-08-12T16:22:44.873Z") or any parseable date string.
 * @returns Formatted string like "12 August 2026, 9:52:44 PM" in IST, or "—" if input is empty/invalid.
 */
export function formatISTDateTime(raw: string | null | undefined): string {
  const d = parseToISTDate(raw);
  if (!d) return '—';

  const day    = d.getUTCDate();
  const month  = MONTH_NAMES[d.getUTCMonth()];
  const year   = d.getUTCFullYear();
  const h24    = d.getUTCHours();
  const min    = d.getUTCMinutes();
  const sec    = d.getUTCSeconds();

  const ampm   = h24 >= 12 ? 'PM' : 'AM';
  const h12    = h24 % 12 === 0 ? 12 : h24 % 12;
  const minStr = String(min).padStart(2, '0');
  const secStr = String(sec).padStart(2, '0');

  return `${day} ${month} ${year}, ${h12}:${minStr}:${secStr} ${ampm}`;
}

/**
 * Scans any narrative string (e.g. log messages like "Created at 2026-08-13T07:05:38.624Z")
 * for raw ISO 8601 timestamps and converts them to formatted IST strings ("13 August 2026, 12:35:46 PM").
 *
 * @param text - The raw text string which may contain ISO timestamp strings
 * @returns The formatted narrative string with all ISO timestamps replaced with IST formatted dates
 */
export function formatISTTextTimestamps(text: string | null | undefined): string {
  if (!text) return '';
  return text.replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?/gi, (match) => {
    const formatted = formatISTDateTime(match);
    return formatted !== '—' ? formatted : match;
  });
}
