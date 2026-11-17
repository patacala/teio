import { render, screen } from '@testing-library/react';
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

describe('FunnelListView', () => {
  it('puts each stage in a column, in stage order, with the contacts in that stage', async () => {
    renderList();

    expect(await screen.findByText('Showing 10 of 12')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /New Lead/ })).toHaveTextContent('12');
    const headers = screen.getAllByRole('columnheader').map((header) => header.textContent);
    expect(headers[0]).toMatch(/New Lead/);
    expect(headers[1]).toMatch(/Booked/);
    expect(screen.getAllByRole('button', { name: /Open Lead/ })).toHaveLength(10);
    expect(screen.getByText('Showing 10 of 12')).toBeInTheDocument();
    expect(screen.getByText('No contacts')).toBeInTheDocument();
  });

  it('loads the next page of a stage column', async () => {
    const { user } = renderList();
    await screen.findByText('Showing 10 of 12');

    await user.click(screen.getByRole('button', { name: 'Load more' }));

    expect(await screen.findByText('Showing 12 of 12')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Open Lead/ })).toHaveLength(12);
    expect(requests.filter((p) => p.get('stage_id') === 's-new').map((p) => p.get('limit'))).toEqual(['10', '20']);
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument();
  });

  it('opens the contact when its cell is clicked', async () => {
    const { user } = renderList();

    await user.click(await screen.findByRole('button', { name: 'Open Lead 03' }));

    expect(nav.push).toHaveBeenCalledWith('/contacts/c-3');
  });

  it('points to stage configuration when the funnel has no stages', async () => {
    const { user, onConfigure } = renderList([]);

    await user.click(screen.getByRole('button', { name: 'Configure stages' }));

    expect(onConfigure).toHaveBeenCalled();
  });
});
