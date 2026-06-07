// Minimal iCalendar (RFC 5545) export for one-time import into Google/Apple
// Calendar. Times are emitted in UTC ("...Z").

export type IcsEvent = {
  uid: string;
  start: Date;
  end: Date;
  summary: string;
  description?: string;
  cancelled?: boolean;
};

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function toIcsUtc(d: Date): string {
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  );
}

function escapeText(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

export function downloadIcs(filename: string, events: IcsEvent[]): void {
  const stamp = toIcsUtc(new Date());
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//AcadeSoft//Calendario//ES',
    'CALSCALE:GREGORIAN',
  ];

  for (const e of events) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${e.uid}`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${toIcsUtc(e.start)}`,
      `DTEND:${toIcsUtc(e.end)}`,
      `SUMMARY:${escapeText(e.summary)}`,
    );
    if (e.description) lines.push(`DESCRIPTION:${escapeText(e.description)}`);
    lines.push(`STATUS:${e.cancelled ? 'CANCELLED' : 'CONFIRMED'}`, 'END:VEVENT');
  }

  lines.push('END:VCALENDAR');

  const blob = new Blob([lines.join('\r\n')], {
    type: 'text/calendar;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
