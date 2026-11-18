import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AutomationSummary } from '@crm/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockApi } from '@/test/msw/api';
import { createQueryWrapper } from '@/test/query';
import AutomationsPage from './page';

vi.setConfig({ testTimeout: 20_000 });

const { toast, currentUser, router } = vi.hoisted(() => ({
  toast: vi.fn(),
  currentUser: { role: 'admin' },
  router: { push: vi.fn() },
}));
vi.mock('@/hooks/useToast', () => ({ toast }));
vi.mock('@/hooks/useTeam', () => ({ useCurrentUser: () => ({ data: currentUser, isPending: false, isError: false }) }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));

function automation(id: string, name: string, overrides: Partial<AutomationSummary> = {}): AutomationSummary {
  return {
    id,
    name,
    description: null,
    status: 'active',
    category: 'custom',
    template_key: null,
    is_system: false,
    trigger_keys: ['contact.tag_added'],
    sends_to_ai: false,
    published_version: 1,
    has_unpublished_changes: false,
    stats: { active_runs: 0, completed_7d: 0, failed_7d: 0 },
    updated_at: '',
    ...overrides,
  };
}

const LIST = [
  automation('a-ai', 'AI agent: answer incoming messages', {
    category: 'ai',
    is_system: true,
    template_key: 'ai_incoming_message',
    trigger_keys: ['message.received'],
    sends_to_ai: false,
    stats: { active_runs: 0, completed_7d: 120, failed_7d: 2 },
  }),
  automation('a-book', 'Booking confirmed', { category: 'booking', is_system: true, trigger_keys: ['appointment.confirmed'] }),
  automation('a-mine', 'VIP welcome', { status: 'paused', has_unpublished_changes: true, stats: { active_runs: 3, completed_7d: 4, failed_7d: 0 } }),
];

function renderPage() {
  const { wrapper } = createQueryWrapper();
  render(<AutomationsPage />, { wrapper });
  return userEvent.setup();
}

beforeEach(() => {
  toast.mockReset();
  router.push.mockReset();
  currentUser.role = 'admin';
});

describe('Automations page', () => {
  it('groups automations by purpose with their trigger, state and activity', async () => {
    mockApi('get', '/automations', { data: LIST });
    renderPage();

    const ai = (await screen.findByText('AI agent: answer incoming messages')).closest('div.rounded-xl') as HTMLElement;
    expect(within(ai).getByText('Platform')).toBeInTheDocument();
    expect(within(ai).getByText(/When: Message received/)).toBeInTheDocument();
    expect(within(ai).getByText(/120 done this week/)).toBeInTheDocument();
    expect(within(ai).getByText(/2 failed/)).toBeInTheDocument();
    expect(within(ai).queryByRole('button', { name: /Delete/ })).not.toBeInTheDocument();

    const mine = screen.getByText('VIP welcome').closest('div.rounded-xl') as HTMLElement;
    expect(within(mine).getByText('Paused')).toBeInTheDocument();
    expect(within(mine).getByText('Unpublished changes')).toBeInTheDocument();
    expect(within(mine).getByText(/3 in progress/)).toBeInTheDocument();

    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(headings).toEqual(['AI agent', 'Booking messages', 'Your automations']);
  });

  it('pauses and activates from the list', async () => {
    mockApi('get', '/automations', { data: LIST });
    const paused = mockApi('post', '/automations/a-book/pause', { data: { ...LIST[1], status: 'paused' } });
    const resumed = mockApi('post', '/automations/a-mine/resume', { data: { ...LIST[2], status: 'active' } });
    const user = renderPage();

    await user.click(await screen.findByRole('switch', { name: 'Pause Booking confirmed' }));
    await waitFor(() => expect(paused).toHaveLength(1));
    expect(paused[0].body).toEqual({ stop_runs: false });
    expect(toast).toHaveBeenCalledWith({ title: '"Booking confirmed" is paused' });

    await user.click(screen.getByRole('switch', { name: 'Activate VIP welcome' }));
    await waitFor(() => expect(resumed).toHaveLength(1));
  });

  it('creates an automation from a starter template and opens it', async () => {
    mockApi('get', '/automations', { data: [] });
    const created = mockApi('post', '/automations', { data: { id: 'a-new' } });
    const user = renderPage();

    expect(await screen.findByText('No automations yet')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'New automation' }));
    await user.click(await screen.findByRole('button', { name: /Welcome new conversations/ }));

    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/config/automations/a-new'));
    const body = created[0].body as { name: string; draft: { triggers: Array<{ key: string }> } };
    expect(body.name).toBe('Welcome new conversations');
    expect(body.draft.triggers[0].key).toBe('conversation.opened');
  });

  it('lets agents look but not change anything', async () => {
    currentUser.role = 'agent';
    mockApi('get', '/automations', { data: LIST });
    renderPage();

    expect(await screen.findByText('VIP welcome')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'New automation' })).not.toBeInTheDocument();
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Delete|Duplicate/ })).not.toBeInTheDocument();
  });
});
