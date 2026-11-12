'use client';

import { useQuery } from '@tanstack/react-query';
import { schedulingService, type AgendaItem, type Calendar } from '@/services/scheduling.service';
import { automationService } from '@/services/automation.service';
import { bookingItem, stepItem } from '@/components/agenda/agenda-items';

const PAGE = 200;
/** Safety stop for a runaway month. */
const MAX_ITEMS = 5000;

export interface AgendaQuery {
  calendar: Calendar;
  from: string;
  to: string;
  sort: 'asc' | 'desc';
  /** One page for the list; every item in range for the week/month grids. */
  page?: { offset: number; limit: number };
  needsOutcome?: boolean;
}

export interface AgendaResult {
  items: AgendaItem[];
  total: number;
}

async function loadBookings(q: AgendaQuery): Promise<AgendaResult> {
  const base = {
    calendar_id: q.calendar.id,
    from: q.from,
    to: q.to,
    sort: q.sort,
    ...(q.needsOutcome ? { needs_outcome: true } : {}),
  };
  if (q.page) {
    const res = await schedulingService.getAppointments({ ...base, ...q.page });
    return { items: res.items.map(bookingItem), total: res.meta.total };
  }
  const items: AgendaItem[] = [];
  for (let offset = 0; offset < MAX_ITEMS; offset += PAGE) {
    const res = await schedulingService.getAppointments({ ...base, limit: PAGE, offset });
    items.push(...res.items.map(bookingItem));
    if (items.length >= res.meta.total || res.items.length < PAGE) return { items, total: res.meta.total };
  }
  return { items, total: items.length };
}

async function loadSteps(q: AgendaQuery): Promise<AgendaResult> {
  const base = { calendar_id: q.calendar.id, from: q.from, to: q.to, sort: q.sort };
  if (q.page) {
    const res = await automationService.listFollowUps({ ...base, ...q.page });
    return { items: res.items.map(stepItem), total: res.total };
  }
  const items: AgendaItem[] = [];
  for (let offset = 0; offset < MAX_ITEMS; offset += PAGE) {
    const res = await automationService.listFollowUps({ ...base, limit: PAGE, offset });
    items.push(...res.items.map(stepItem));
    if (items.length >= res.total || res.items.length < PAGE) return { items, total: res.total };
  }
  return { items, total: items.length };
}

/**
 * The agenda of one calendar: bookings, or follow-up steps on a follow-up
 * calendar. Keys start with 'appointments' / 'follow-ups' so every mutation
 * that invalidates those refreshes the agenda too.
 */
export function useAgenda(query: AgendaQuery | null) {
  const isFollowUp = query?.calendar.type === 'follow_up';
  return useQuery({
    queryKey: [isFollowUp ? 'follow-ups' : 'appointments', 'agenda', query && { ...query, calendar: query.calendar.id }],
    queryFn: () => (isFollowUp ? loadSteps(query!) : loadBookings(query!)),
    enabled: query !== null,
    staleTime: 30_000,
  });
}
