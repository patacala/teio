import { renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { API_BASE } from '@/test/msw/api';
import { server } from '@/test/msw/server';
import { createQueryWrapper } from '@/test/query';
import type { Calendar } from '@/services/scheduling.service';
import { useAgenda } from './useAgenda';

const base = { organization_id: 'o', color: '#fff', is_active: true, payment_service_id: null, work_days: [1], start_time: '09:00', end_time: '18:00', slot_duration_minutes: 30, buffer_minutes: 0, timezone: 'UTC', blocked_dates: [], created_at: '', updated_at: '' };
const bookings = { ...base, id: 'cal-1', name: 'Appointments', type: 'appointments' } as Calendar;
const followUps = { ...base, id: 'cal-fu', name: 'Follow-up', type: 'follow_up' } as Calendar;

describe('useAgenda', () => {
  it('fetches every page of a month instead of stopping at 200', async () => {
    const offsets: string[] = [];
    server.use(
      http.get(`${API_BASE}/appointments`, ({ request }) => {
        const offset = Number(new URL(request.url).searchParams.get('offset') ?? 0);
        offsets.push(String(offset));
        const count = offset === 0 ? 200 : 50;
        const items = Array.from({ length: count }, (_, i) => ({
          id: `a-${offset + i}`,
          starts_at: '2026-03-02T10:00:00Z',
          ends_at: '2026-03-02T10:30:00Z',
          status: 'confirmed',
        }));
        return HttpResponse.json({ data: { items, meta: { total: 250, limit: 200, offset } } });
      }),
    );
    const { wrapper } = createQueryWrapper();
    const { result } = renderHook(
      () => useAgenda({ calendar: bookings, from: '2026-03-01T00:00:00Z', to: '2026-04-01T00:00:00Z', sort: 'asc' }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.data?.items).toHaveLength(250));
    expect(offsets).toEqual(['0', '200']);
    expect(result.current.data?.items[0].kind).toBe('booking');
  });

  it('reads follow-up steps from the automation endpoint', async () => {
    server.use(
      http.get(`${API_BASE}/automation/follow-ups`, () =>
        HttpResponse.json({
          data: {
            items: [{ id: 's-1', contact_id: 'c', title: 'Call', status: 'awaiting_user', due_at: '2026-03-02T10:00:00Z', action: 'call', executor: 'user', calendar_id: 'cal-fu' }],
            total: 1,
          },
        }),
      ),
    );
    const { wrapper } = createQueryWrapper();
    const { result } = renderHook(
      () => useAgenda({ calendar: followUps, from: '2026-03-01T00:00:00Z', to: '2026-04-01T00:00:00Z', sort: 'asc', page: { offset: 0, limit: 25 } }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.data?.items).toHaveLength(1));
    expect(result.current.data?.items[0]).toMatchObject({
      kind: 'step',
      starts_at: '2026-03-02T10:00:00.000Z',
      ends_at: '2026-03-02T10:15:00.000Z',
      action: 'call',
    });
  });
});
