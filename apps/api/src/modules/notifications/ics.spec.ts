import { buildIcs } from './ics';

const base = {
  uid: 'appt-1@crm',
  sequence: 2,
  start: new Date('2026-03-23T15:00:00Z'),
  end: new Date('2026-03-23T15:30:00Z'),
  title: 'Consulta, inicial; con Dra. Ruiz',
  organizer: { name: 'Clínica Sol', email: 'citas@sol.test' },
  attendee: { name: 'Ana Pérez', email: 'ana@x.test' },
  productName: 'Clínica Sol',
  now: new Date('2026-03-20T10:00:00Z'),
};

describe('buildIcs', () => {
  it('writes a REQUEST with UTC times, escaping and CRLF line endings', () => {
    const ics = buildIcs({ ...base, method: 'REQUEST', description: 'Traer estudios\nprevios' });
    const lines = ics.split('\r\n');
    expect(lines).toContain('METHOD:REQUEST');
    expect(lines).toContain('DTSTART:20260323T150000Z');
    expect(lines).toContain('DTEND:20260323T153000Z');
    expect(lines).toContain('SEQUENCE:2');
    expect(lines).toContain('SUMMARY:Consulta\\, inicial\\; con Dra. Ruiz');
    expect(lines).toContain('DESCRIPTION:Traer estudios\\nprevios');
    expect(lines).toContain('STATUS:CONFIRMED');
    expect(ics).not.toContain('VTIMEZONE');
    expect(ics.endsWith('\r\n')).toBe(true);
  });

  it('cancels the same event without an alarm', () => {
    const ics = buildIcs({ ...base, method: 'CANCEL', sequence: 3 });
    expect(ics).toContain('METHOD:CANCEL');
    expect(ics).toContain('STATUS:CANCELLED');
    expect(ics).toContain('UID:appt-1@crm');
    expect(ics).not.toContain('VALARM');
  });

  it('folds long lines at 75 octets without splitting characters', () => {
    const ics = buildIcs({ ...base, method: 'REQUEST', description: 'ñ'.repeat(200) });
    for (const line of ics.split('\r\n')) expect(Buffer.byteLength(line, 'utf8')).toBeLessThanOrEqual(75);
    const unfolded = ics.replace(/\r\n /g, '');
    expect(unfolded).toContain(`DESCRIPTION:${'ñ'.repeat(200)}`);
  });
});
