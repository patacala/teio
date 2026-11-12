import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { AgendaItem } from '@/services/scheduling.service';
import { WeekCalendar, layoutDay } from './week-calendar';

const TZ = 'America/Mexico_City';
const item = (id: string, start: string, minutes: number): AgendaItem => ({
  kind: 'booking',
  id,
  contact_id: 'c1',
  title: id,
  starts_at: start,
  ends_at: new Date(new Date(start).getTime() + minutes * 60_000).toISOString(),
  status: 'confirmed',
  origin: 'human',
  created_at: '',
  updated_at: '',
});

const days = ['2026-03-23', '2026-03-24', '2026-03-25', '2026-03-26', '2026-03-27', '2026-03-28', '2026-03-29'];

describe('WeekCalendar', () => {
  it('puts overlapping bookings side by side instead of on top of each other', () => {
    const placed = layoutDay(
      [
        item('a', '2026-03-23T15:00:00Z', 60), // 09:00–10:00 local
        item('b', '2026-03-23T15:30:00Z', 60), // 09:30–10:30
        item('c', '2026-03-23T17:00:00Z', 30), // 11:00, alone
      ],
      TZ,
    );
    const byId = Object.fromEntries(placed.map((p) => [p.item.id, p]));
    expect([byId.a.column, byId.a.columns]).toEqual([0, 2]);
    expect([byId.b.column, byId.b.columns]).toEqual([1, 2]);
    expect([byId.c.column, byId.c.columns]).toEqual([0, 1]);
    expect(byId.a.top).toBe(9 * 48 + 40);
  });

  it('places items by the calendar wall clock and opens a booking where you click', () => {
    const onSlotClick = vi.fn();
    render(
      <WeekCalendar
        appointments={[item('Consulta', '2026-03-23T15:00:00Z', 30)]}
        days={days}
        timeZone={TZ}
        workingHours={{ workDays: [1, 2, 3, 4, 5], startMinutes: 540, endMinutes: 1080 }}
        onPrev={vi.fn()}
        onNext={vi.fn()}
        onAppointmentClick={vi.fn()}
        onSlotClick={onSlotClick}
      />,
    );
    const monday = screen.getByTestId('day-2026-03-23');
    expect(within(monday).getByTitle('Consulta').style.top).toBe(`${9 * 48 + 40}px`);

    const tuesday = screen.getByTestId('day-2026-03-24');
    vi.spyOn(tuesday, 'getBoundingClientRect').mockReturnValue({ top: 0 } as DOMRect);
    fireEvent.click(tuesday, { clientY: 40 + 10.5 * 48 });
    expect(onSlotClick).toHaveBeenCalledWith('2026-03-24T16:30:00.000Z');
  });
});
