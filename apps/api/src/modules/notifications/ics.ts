/**
 * iCalendar (RFC 5545) invite for one appointment. Times are written in UTC
 * (no VTIMEZONE needed, correct in every client); the same UID with a higher
 * SEQUENCE updates or cancels the event already in the contact's calendar.
 */
export interface IcsEvent {
  method: 'REQUEST' | 'CANCEL';
  uid: string;
  sequence: number;
  start: Date;
  end: Date;
  title: string;
  description?: string | null;
  location?: string | null;
  url?: string | null;
  organizer: { name: string; email: string };
  attendee: { name: string; email: string };
  productName: string;
  now?: Date;
}

function utc(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function text(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** Lines longer than 75 octets continue on the next line after CRLF + space. */
function fold(line: string): string {
  const bytes = Buffer.from(line, 'utf8');
  if (bytes.length <= 75) return line;
  const parts: string[] = [];
  let current = '';
  let size = 0;
  for (const char of line) {
    const charSize = Buffer.byteLength(char, 'utf8');
    const limit = parts.length === 0 ? 75 : 74;
    if (size + charSize > limit) {
      parts.push(current);
      current = '';
      size = 0;
    }
    current += char;
    size += charSize;
  }
  parts.push(current);
  return parts.join('\r\n ');
}

export function buildIcs(event: IcsEvent): string {
  const cancelled = event.method === 'CANCEL';
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:-//${text(event.productName)}//CRM//ES`,
    'CALSCALE:GREGORIAN',
    `METHOD:${event.method}`,
    'BEGIN:VEVENT',
    `UID:${event.uid}`,
    `SEQUENCE:${event.sequence}`,
    `DTSTAMP:${utc(event.now ?? new Date())}`,
    `DTSTART:${utc(event.start)}`,
    `DTEND:${utc(event.end)}`,
    `SUMMARY:${text(event.title)}`,
    ...(event.description ? [`DESCRIPTION:${text(event.description)}`] : []),
    ...(event.location ? [`LOCATION:${text(event.location)}`] : []),
    ...(event.url ? [`URL:${event.url}`] : []),
    `ORGANIZER;CN=${text(event.organizer.name)}:mailto:${event.organizer.email}`,
    `ATTENDEE;CN=${text(event.attendee.name)};ROLE=REQ-PARTICIPANT;PARTSTAT=${cancelled ? 'DECLINED' : 'ACCEPTED'}:mailto:${event.attendee.email}`,
    `STATUS:${cancelled ? 'CANCELLED' : 'CONFIRMED'}`,
    ...(cancelled
      ? []
      : ['BEGIN:VALARM', 'TRIGGER:-PT1H', 'ACTION:DISPLAY', `DESCRIPTION:${text(`Recordatorio: ${event.title}`)}`, 'END:VALARM']),
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.map(fold).join('\r\n') + '\r\n';
}
