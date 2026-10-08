/** The app's one way of writing dates and money, so every screen reads alike. */

const DATE = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
const DATE_TIME = new Intl.DateTimeFormat('es-ES', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});
const EUR = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });

const DAY_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * "7 oct 2026". Takes an ISO instant or a plain YYYY-MM-DD day; the latter is
 * read at local noon so it never slips to the previous day.
 */
export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const d = typeof value === 'string' && DAY_ONLY.test(value) ? new Date(`${value}T12:00:00`) : new Date(value);
  return DATE.format(d);
}

/** A calendar day stored as midnight UTC (group start/end): format the day itself. */
export function formatDay(iso: string | null | undefined): string {
  return iso ? formatDate(iso.slice(0, 10)) : '—';
}

/** "7 oct 2026, 17:30". */
export function formatDateTime(value: string | Date | null | undefined): string {
  return value ? DATE_TIME.format(new Date(value)) : '—';
}

/** "1.234,50 €". */
export function formatEur(value: string | number): string {
  return EUR.format(Number(value));
}
