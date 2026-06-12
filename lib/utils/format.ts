/**
 * Pure display-formatting helpers.
 *
 * No clocks inside: functions that need "now" accept it as a parameter so
 * they stay deterministic and trivially testable.
 */

const EM_DASH = '—';
const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 3600;
const SECONDS_PER_DAY = 86400;

/**
 * Formats a cent price for display.
 *
 * @param cents - Price in cents, or null when not provided
 * @returns e.g. "41¢", or "—" for null
 */
export function formatCents(cents: number | null): string {
  if (cents === null || !Number.isFinite(cents)) {
    return EM_DASH;
  }
  return `${Math.round(cents)}¢`;
}

/**
 * Formats a count compactly.
 *
 * @param n - Count, or null when not provided
 * @returns e.g. "18.2k", "1.4m", "312", or "—" for null
 */
export function formatCount(n: number | null): string {
  if (n === null || !Number.isFinite(n)) {
    return EM_DASH;
  }
  const abs = Math.abs(n);
  if (abs >= 1_000_000) {
    return `${trimTrailingZero((n / 1_000_000).toFixed(1))}m`;
  }
  if (abs >= 1_000) {
    return `${trimTrailingZero((n / 1_000).toFixed(1))}k`;
  }
  return String(Math.round(n));
}

/**
 * Formats an ISO timestamp as a short local date-time.
 *
 * @param iso - ISO 8601 timestamp, or null when not provided
 * @returns e.g. "Jun 11, 3:04 PM", "not provided" for null, "invalid date" for unparseable input
 */
export function formatDateTime(iso: string | null): string {
  if (iso === null) {
    return 'not provided';
  }
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) {
    return 'invalid date';
  }
  return parsed.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * Formats how long ago data was fetched.
 *
 * @param fetchedAtIso - ISO 8601 fetch timestamp
 * @param nowMs - Current time in epoch milliseconds (caller-supplied)
 * @returns e.g. "41s ago", "3m ago", "2h ago", "5d ago"; "unknown" for unparseable input
 */
export function formatFreshness(fetchedAtIso: string, nowMs: number): string {
  const fetchedMs = new Date(fetchedAtIso).getTime();
  if (Number.isNaN(fetchedMs) || !Number.isFinite(nowMs)) {
    return 'unknown';
  }
  const elapsedSeconds = Math.max(0, Math.floor((nowMs - fetchedMs) / 1000));
  if (elapsedSeconds < SECONDS_PER_MINUTE) {
    return `${elapsedSeconds}s ago`;
  }
  if (elapsedSeconds < SECONDS_PER_HOUR) {
    return `${Math.floor(elapsedSeconds / SECONDS_PER_MINUTE)}m ago`;
  }
  if (elapsedSeconds < SECONDS_PER_DAY) {
    return `${Math.floor(elapsedSeconds / SECONDS_PER_HOUR)}h ago`;
  }
  return `${Math.floor(elapsedSeconds / SECONDS_PER_DAY)}d ago`;
}

/**
 * Renders a cent price as an implied percentage.
 *
 * @param cents - Price in cents (0-100), or null when not provided
 * @returns e.g. "41%", or "—" for null
 */
export function percentFromCents(cents: number | null): string {
  if (cents === null || !Number.isFinite(cents)) {
    return EM_DASH;
  }
  return `${Math.round(cents)}%`;
}

/** Drops a trailing ".0" so "18.0k" renders as "18k". */
function trimTrailingZero(value: string): string {
  return value.endsWith('.0') ? value.slice(0, -2) : value;
}
