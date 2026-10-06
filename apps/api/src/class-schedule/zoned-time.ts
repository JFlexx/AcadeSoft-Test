/**
 * Wall-clock ↔ UTC conversion for an IANA time zone, using only Intl (no
 * dependency). Class times are written in the academy's local time ("lunes
 * 17:00") and must stay at 17:00 across daylight-saving changes, so the UTC
 * offset is resolved for each date.
 */

/** Offset of `tz` at instant `date`, in ms (Madrid in summer: +2h). */
function offsetMs(date: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second'),
  );
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/** "2026-10-26" + "17:00" in `tz` → the UTC instant. */
export function zonedToUtc(ymd: string, hhmm: string, tz: string): Date {
  const [y, m, d] = ymd.split('-').map(Number);
  const [hh, mm] = hhmm.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const first = offsetMs(new Date(guess), tz);
  const candidate = guess - first;
  // Near a DST switch the offset at the candidate can differ from the guess.
  const second = offsetMs(new Date(candidate), tz);
  return new Date(second === first ? candidate : guess - second);
}

/** Today's date ("YYYY-MM-DD") in `tz`. */
export function todayIn(tz: string, now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** Calendar-date helpers on "YYYY-MM-DD" strings (zone-independent). */
export function addDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** "YYYY-MM-DD" of a @db.Date column (stored as UTC midnight). */
export const ymdOf = (d: Date) => d.toISOString().slice(0, 10);

/** ISO weekday of a calendar date: 1 = lunes … 7 = domingo. */
export function isoWeekday(ymd: string): number {
  const [y, m, d] = ymd.split('-').map(Number);
  const day = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return day === 0 ? 7 : day;
}
