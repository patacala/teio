/**
 * How dates, times and amounts read in messages to contacts (English).
 * Shared by booking automations and platform emails so they never differ.
 */

/** "Monday, March 23, 2026" in the appointment's time zone (UTC if invalid). */
export function formatDateLong(iso: string | Date, timezone: string): string {
  const options: Intl.DateTimeFormatOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
  try {
    return new Date(iso).toLocaleDateString('en-US', { ...options, timeZone: timezone });
  } catch {
    return new Date(iso).toLocaleDateString('en-US', { ...options, timeZone: 'UTC' });
  }
}

/** "09:00 AM" in the appointment's time zone (UTC if invalid). */
export function formatTimeShort(iso: string | Date, timezone: string): string {
  const options: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit' };
  try {
    return new Date(iso).toLocaleTimeString('en-US', { ...options, timeZone: timezone });
  } catch {
    return new Date(iso).toLocaleTimeString('en-US', { ...options, timeZone: 'UTC' });
  }
}

/** Amount in cents → "50.00 USD". */
export function formatAmount(cents: number | null | undefined, currency: string | null | undefined): string {
  if (cents === null || cents === undefined || !Number.isFinite(Number(cents))) return '';
  return `${(Number(cents) / 100).toFixed(2)} ${(currency ?? '').toUpperCase()}`.trim();
}
