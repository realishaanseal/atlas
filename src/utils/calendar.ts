/**
 * Turning a detected date into something a calendar app will accept.
 *
 * Two routes, because there is no single one that works everywhere:
 *
 *   - Google Calendar takes a URL, which is the best experience on desktop and
 *     on Android where Google Calendar is usually the default.
 *   - An .ics file is the universal fallback. Downloading one opens Apple
 *     Calendar on macOS and iOS, Outlook on Windows, and is understood by
 *     essentially every calendar app ever written.
 *
 * The event title comes from the message text, which means it is CONTENT: the
 * .ics is generated locally and never uploaded, and the Google URL is only
 * opened if you tap it. Nothing leaves the device on its own.
 */

const DEFAULT_DURATION_MS = 60 * 60 * 1000;

/** YYYYMMDDTHHMMSSZ — the format both Google and iCalendar expect. */
function stampUtc(ms: number): string {
  return `${new Date(ms).toISOString().replace(/[-:]/g, '').split('.')[0] ?? ''}Z`;
}

/** YYYYMMDD, for all-day events. */
function stampDate(ms: number): string {
  const d = new Date(ms);
  return (
    String(d.getFullYear()) +
    String(d.getMonth() + 1).padStart(2, '0') +
    String(d.getDate()).padStart(2, '0')
  );
}

export interface CalendarEvent {
  readonly title: string;
  readonly at: number;
  readonly hasTime: boolean;
}

export function googleCalendarUrl({ title, at, hasTime }: CalendarEvent): string {
  const dates = hasTime
    ? `${stampUtc(at)}/${stampUtc(at + DEFAULT_DURATION_MS)}`
    : `${stampDate(at)}/${stampDate(at + 86_400_000)}`;

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: title,
    dates,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/** Escapes per RFC 5545: commas, semicolons, backslashes and newlines. */
function escapeIcs(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

export function icsFile({ title, at, hasTime }: CalendarEvent): string {
  const start = hasTime ? `DTSTART:${stampUtc(at)}` : `DTSTART;VALUE=DATE:${stampDate(at)}`;
  const end = hasTime
    ? `DTEND:${stampUtc(at + DEFAULT_DURATION_MS)}`
    : `DTEND;VALUE=DATE:${stampDate(at + 86_400_000)}`;

  // CRLF line endings are required by the spec, and some clients genuinely
  // reject a file without them.
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    // Both of these end up inside the .ics file, which lands in Downloads and
    // is then imported into a calendar app that may well be shared or synced.
    // Named after the public site for the same reason the export filename is.
    'PRODID:-//MechCodes//EN',
    'BEGIN:VEVENT',
    `UID:${String(at)}-${Math.random().toString(36).slice(2)}@mechcodes`,
    `DTSTAMP:${stampUtc(Date.now())}`,
    start,
    end,
    `SUMMARY:${escapeIcs(title)}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}

/** Saves the .ics, which hands off to whatever calendar app is registered. */
export function downloadIcs(event: CalendarEvent): void {
  const blob = new Blob([icsFile(event)], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${event.title.replace(/[^\w\s-]/g, '').trim().slice(0, 40) || 'event'}.ics`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 10000);
}
