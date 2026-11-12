import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Contact } from '@/services/contacts.service';
import type { FunnelStage } from '@/services/funnels.service';
import { API_BASE } from '@/test/msw/api';
import { server } from '@/test/msw/server';
import { createQueryWrapper } from '@/test/query';
import { FunnelListView } from './FunnelListView';

const nav = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: nav.push }) }));

const stage = (id: string, name: string, position: number): FunnelStage => ({
  id, name, position, funnel_id: 'f-1', color: '#3B82F6', stage_type: 'custom',
});

const contact = (i: number, stageId: string): Contact => ({
  id: `c-${i}`,
  first_name: 'Lead',
  last_name: String(i).padStart(2, '0'),
  phone: `+1 555 01${String(i).padStart(2, '0')}`,
  lead_stage: stageId,
  lead_score: 30,
  handled_by: i % 2 ? 'ai' : 'human',
  created_at: '2026-06-01T00:00:00Z',
  updated_at: '2026-06-01T00:00:00Z',
});

const CONTACTS = Array.from({ length: 12 }, (_, i) => contact(i + 1, 's-new'));
let requests: URLSearchParams[] = [];

beforeEach(() => {
  requests = [];
  nav.push.mockReset();
  server.use(
    http.get(`${API_BASE}/contacts`, ({ request }) => {
      const params = new URL(request.url).searchParams;
      requests.push(params);
      const items = CONTACTS.filter((c) => c.lead_stage === params.get('stage_id'));
      const limit = Number(params.get('limit'));
      return HttpResponse.json({
        data: { items: items.slice(0, limit), meta: { total: items.length, page: 1, limit, total_pages: 1 } },
      });
    }),
  );
});

function renderList(stages = [stage('s-won', 'Booked', 1), stage('s-new', 'New Lead', 0)]) {
  const onConfigure = vi.fn();
  const { wrapper } = createQueryWrapper();
  render(<FunnelListView stages={stages} onConfigure={onConfigure} />, { wrapper });
  return { onConfigure, user: userEvent.setup() };
}

const section = (name: string) => screen.getByRole('button', { name: new RegExp(name) }).closest('.panel-card') as HTMLElement;

describe('FunnelListView', () => {
  it('lists contacts grouped by stage, in stage order, with real totals', async () => {
    renderList();

    expect(await screen.findByText('12 contacts')).toBeInTheDocument();
    const headers = screen.getAllByRole('button', { name: /contacts?$/ }).map((b) => b.textContent);
    expect(headers).toEqual(['New Lead12 contacts', 'Booked0 contacts']);
    expect(within(section('New Lead')).getAllByRole('row')).toHaveLength(11); // header + first page
    expect(within(section('New Lead')).getByText('Showing 10 of 12')).toBeInTheDocument();
    expect(within(section('Booked')).getByText('No contacts in this stage')).toBeInTheDocument();
  });

  it('loads the next page of a stage', async () => {
    const { user } = renderList();
    await screen.findByText('Showing 10 of 12');

    await user.click(screen.getByRole('button', { name: 'Load more' }));

    expect(await screen.findByText('Showing 12 of 12')).toBeInTheDocument();
    expect(requests.filter((p) => p.get('stage_id') === 's-new').map((p) => p.get('limit'))).toEqual(['10', '20']);
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument();
  });

  it('opens the contact when a row is clicked', async () => {
    const { user } = renderList();

    await user.click(await screen.findByRole('row', { name: /Open Lead 03/ }));

    expect(nav.push).toHaveBeenCalledWith('/contacts/c-3');
  });

  it('collapses a stage section', async () => {
    const { user } = renderList();
    await screen.findByText('Showing 10 of 12');

    await user.click(screen.getByRole('button', { name: /New Lead/ }));

    expect(screen.queryByText('Showing 10 of 12')).not.toBeInTheDocument();
  });

  it('points to stage configuration when the funnel has no stages', async () => {
    const { user, onConfigure } = renderList([]);

    await user.click(screen.getByRole('button', { name: 'Configure stages' }));

    expect(onConfigure).toHaveBeenCalled();
  });
});
