import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AutomationSummary, RunDetail, RunSummary } from '@crm/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockApi } from '@/test/msw/api';
import { createQueryWrapper } from '@/test/query';
import { ContactAutomations } from './ContactAutomations';

vi.setConfig({ testTimeout: 20_000 });

const { toast } = vi.hoisted(() => ({ toast: vi.fn() }));
vi.mock('@/hooks/useToast', () => ({ toast }));

function run(id: string, overrides: Partial<RunSummary> = {}): RunSummary {
  return {
    id,
    automation_id: 'a-1',
    automation_name: 'Lead went quiet',
    version: 1,
    scope: 'contact',
    status: 'waiting',
    contact: { id: 'c-1', name: 'Ana Pérez' },
    current_node_key: 'wait_1',
    trigger_key: 'manual',
    exit_reason: null,
    last_error: null,
    resume_at: new Date(Date.now() + 86_400_000).toISOString(),
    started_at: new Date(Date.now() - 3_600_000).toISOString(),
    finished_at: null,
    ...overrides,
  };
}

function automation(id: string, name: string, overrides: Partial<AutomationSummary> = {}): AutomationSummary {
  return {
    id,
    name,
    description: null,
    status: 'active',
    category: 'follow_up',
    template_key: null,
    is_system: false,
    trigger_keys: ['manual'],
    sends_to_ai: false,
    published_version: 1,
    has_unpublished_changes: false,
    stats: { active_runs: 0, completed_7d: 0, failed_7d: 0 },
    updated_at: '',
    ...overrides,
  };
}

function renderCard() {
  const { wrapper } = createQueryWrapper();
  render(<ContactAutomations contactId="c-1" />, { wrapper });
  return userEvent.setup();
}

beforeEach(() => toast.mockReset());

describe('ContactAutomations', () => {
  it('lists what the contact is in now and keeps finished runs under history', async () => {
    mockApi('get', '/automations', { data: [] });
    mockApi('get', '/automations/contact/c-1/runs', {
      data: [
        run('r-1'),
        run('r-2', { automation_name: 'AI reply', status: 'completed', finished_at: new Date().toISOString(), resume_at: null }),
      ],
    });
    const user = renderCard();

    expect(await screen.findByText('Lead went quiet')).toBeInTheDocument();
    expect(screen.getByText('Waiting')).toBeInTheDocument();
    expect(screen.queryByText('AI reply')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'History (1)' }));
    expect(screen.getByText('AI reply')).toBeInTheDocument();
    expect(screen.getByText('Completed')).toBeInTheDocument();
  });

  it('opens a run and lets a team member stop it', async () => {
    mockApi('get', '/automations', { data: [] });
    mockApi('get', '/automations/contact/c-1/runs', { data: [run('r-1')] });
    const detail: RunDetail = {
      ...run('r-1'),
      steps: [
        {
          step_no: 1,
          node_key: 'wait_1',
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
    mockApi('get', '/automations/a-1', {
      data: { id: 'a-1', published: { graph: { nodes: [{ key: 'wait_1', type: 'wait', label: 'Wait a day', config: {} }], edges: [] } } },
    });
    const cancelled = mockApi('post', '/automations/runs/r-1/cancel', { data: { cancelled: true } });
    const user = renderCard();

    await user.click(await screen.findByText('Lead went quiet'));
    expect(await screen.findByText('Wait a day')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Stop this run' }));

    await waitFor(() => expect(cancelled).toHaveLength(1));
    expect(toast).toHaveBeenCalledWith({ title: 'Run stopped' });
  });

  it('adds the contact to a live automation that accepts contacts by hand', async () => {
    mockApi('get', '/automations', {
      data: [
        automation('a-1', 'Lead went quiet'),
        automation('a-2', 'Paused one', { status: 'paused' }),
        automation('a-3', 'Tag welcome', { trigger_keys: ['contact.tag_added'] }),
      ],
    });
    mockApi('get', '/automations/contact/c-1/runs', { data: [] });
    const enrolled = mockApi('post', '/automations/a-1/enroll', { data: { started: ['r-9'], skipped: [] } });
    const user = renderCard();

    const picker = await screen.findByRole('combobox', { name: 'Automation to add the contact to' });
    await user.click(picker);
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['Lead went quiet']);
    await user.click(screen.getByRole('option', { name: 'Lead went quiet' }));
    await user.click(screen.getByRole('button', { name: 'Add' }));

    await waitFor(() => expect(enrolled).toHaveLength(1));
    expect(enrolled[0].body).toEqual({ contact_ids: ['c-1'] });
    expect(toast).toHaveBeenCalledWith({ title: 'Added to Lead went quiet' });
  });

  it('says why the contact was not added', async () => {
    mockApi('get', '/automations', { data: [automation('a-1', 'Lead went quiet')] });
    mockApi('get', '/automations/contact/c-1/runs', { data: [] });
    mockApi('post', '/automations/a-1/enroll', { data: { started: [], skipped: ['c-1'] } });
    const user = renderCard();

    await user.click(await screen.findByRole('combobox', { name: 'Automation to add the contact to' }));
    await user.click(screen.getByRole('option', { name: 'Lead went quiet' }));
    await user.click(screen.getByRole('button', { name: 'Add' }));

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith({
        title: 'Not added: the contact opted out, is already in it, or cannot enter it again',
        variant: 'error',
      }),
    );
  });

  it('offers no picker when no automation accepts contacts by hand', async () => {
    mockApi('get', '/automations', { data: [automation('a-3', 'Tag welcome', { trigger_keys: ['contact.tag_added'] })] });
    mockApi('get', '/automations/contact/c-1/runs', { data: [] });
    renderCard();

    expect(await screen.findByText('Not in any automation right now.')).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(within(document.body).queryByRole('button', { name: 'Add' })).not.toBeInTheDocument();
  });
});
