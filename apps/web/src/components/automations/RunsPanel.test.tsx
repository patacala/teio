import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import type { AutomationGraph, RunDetail, RunSummary } from '@crm/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { API_BASE, mockApi } from '@/test/msw/api';
import { server } from '@/test/msw/server';
import { createQueryWrapper } from '@/test/query';
import { RunsPanel } from './RunsPanel';

vi.setConfig({ testTimeout: 20_000 });

const { toast } = vi.hoisted(() => ({ toast: vi.fn() }));
vi.mock('@/hooks/useToast', () => ({ toast }));

const graph: AutomationGraph = {
  nodes: [
    { key: 'msg', type: 'send_message', config: { text: 'Hi' } },
    { key: 'wait', type: 'wait', label: 'Give them a day', config: { mode: 'duration', duration: { amount: 1, unit: 'days' } } },
  ],
  edges: [{ source: 'msg', target: 'wait' }],
} as AutomationGraph;

function run(id: string, overrides: Partial<RunSummary> = {}): RunSummary {
  return {
    id,
    automation_id: 'a-1',
    version: 2,
    scope: 'contact',
    status: 'waiting',
    contact: { id: 'c-1', name: 'Ana Pérez' },
    current_node_key: 'wait',
    trigger_key: 'contact.tag_added',
    exit_reason: null,
    last_error: null,
    resume_at: null,
    started_at: new Date().toISOString(),
    finished_at: null,
    ...overrides,
  };
}

beforeEach(() => toast.mockReset());

describe('RunsPanel', () => {
  it('lists runs with where each one is, and filters by status', async () => {
    const requests: URL[] = [];
    server.use(
      http.get(`${API_BASE}/automations/a-1/runs`, ({ request }) => {
        const url = new URL(request.url);
        requests.push(url);
        const items =
          url.searchParams.get('status') === 'failed'
            ? [run('r-2', { status: 'failed', contact: { id: 'c-2', name: 'Luis Gómez' }, last_error: 'No channel to reach the contact' })]
            : [run('r-1'), run('r-3', { status: 'exited', contact: null, scope: 'organization', exit_reason: 'Contact replied' })];
        return HttpResponse.json({ data: { items, total: items.length } });
      }),
    );
    const { wrapper } = createQueryWrapper();
    render(<RunsPanel automationId="a-1" graph={graph} />, { wrapper });
    const user = userEvent.setup();

    const first = (await screen.findByText('Ana Pérez')).closest('tr')!;
    expect(within(first).getByText('Waiting')).toBeInTheDocument();
    expect(within(first).getByText('Give them a day')).toBeInTheDocument();
    const second = screen.getByText('Whole organization').closest('tr')!;
    expect(within(second).getByText('Contact replied')).toBeInTheDocument();
    expect(screen.getByText('2 runs')).toBeInTheDocument();
    expect(Object.fromEntries(requests[0].searchParams)).toEqual({ limit: '25', offset: '0' });

    await user.click(screen.getByRole('combobox', { name: 'Filter runs by status' }));
    await user.click(screen.getByRole('option', { name: 'Failed' }));

    expect(await screen.findByText('Luis Gómez')).toBeInTheDocument();
    expect(screen.getByText('No channel to reach the contact')).toBeInTheDocument();
    expect(requests.at(-1)!.searchParams.get('status')).toBe('failed');
  });

  it('shows the steps of a run and stops it', async () => {
    mockApi('get', '/automations/a-1/runs', { data: { items: [run('r-1')], total: 1 } });
    const detail: RunDetail = {
      ...run('r-1'),
      steps: [
        {
          step_no: 1,
          node_key: 'msg',
          node_type: 'send_message',
          status: 'completed',
          branch: null,
          output: { channel: 'whatsapp' },
          error: null,
          started_at: new Date().toISOString(),
          finished_at: new Date().toISOString(),
          deliveries: { sent: 1, failed: 0, skipped: 0 },
        },
        {
          step_no: 2,
          node_key: 'wait',
          node_type: 'wait',
          status: 'running',
          branch: null,
          output: {},
          error: null,
          started_at: new Date().toISOString(),
          finished_at: null,
          deliveries: { sent: 0, failed: 0, skipped: 0 },
        },
      ],
    };
    mockApi('get', '/automations/runs/r-1', { data: detail });
    const cancelled = mockApi('post', '/automations/runs/r-1/cancel', { data: { cancelled: true } });
    const { wrapper } = createQueryWrapper();
    render(<RunsPanel automationId="a-1" graph={graph} />, { wrapper });
    const user = userEvent.setup();

    await user.click(await screen.findByText('Ana Pérez'));

    expect(await screen.findByText('Send message')).toBeInTheDocument();
    expect(screen.getByText('1 sent · via whatsapp')).toBeInTheDocument();
    expect(screen.getAllByText('Give them a day').length).toBeGreaterThan(0);
    expect(screen.getByText('in progress')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Stop this run' }));
    await waitFor(() => expect(cancelled).toHaveLength(1));
    expect(toast).toHaveBeenCalledWith({ title: 'Run stopped' });
  });

  it('says when there are no runs', async () => {
    mockApi('get', '/automations/a-1/runs', { data: { items: [], total: 0 } });
    const { wrapper } = createQueryWrapper();
    render(<RunsPanel automationId="a-1" graph={graph} />, { wrapper });
    expect(await screen.findByText('No runs yet.')).toBeInTheDocument();
  });
});
