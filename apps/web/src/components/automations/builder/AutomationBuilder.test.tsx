import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DEFAULT_AUTOMATION_SETTINGS, type AutomationDefinition, type AutomationDetail } from '@crm/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockApi } from '@/test/msw/api';
import { createQueryWrapper } from '@/test/query';
import type { AutomationOrgCatalog } from '@/services/automations.service';
import { AutomationBuilder } from './AutomationBuilder';

vi.setConfig({ testTimeout: 30_000 });

const { toast, currentUser } = vi.hoisted(() => ({ toast: vi.fn(), currentUser: { role: 'admin' } }));
vi.mock('@/hooks/useToast', () => ({ toast }));
vi.mock('@/hooks/useTeam', () => ({ useCurrentUser: () => ({ data: currentUser, isPending: false, isError: false }) }));

const catalog: AutomationOrgCatalog = {
  channels: [],
  stages: [],
  tags: ['vip'],
  custom_fields: [],
  users: [],
  calendars: [],
  services: [],
  ai_connections: [],
};

const draft: AutomationDefinition = {
  triggers: [{ key: 'manual' }],
  graph: { nodes: [{ key: 'sms_1', type: 'send_sms', config: { text: '' } }], edges: [] },
  settings: { ...DEFAULT_AUTOMATION_SETTINGS },
} as AutomationDefinition;

function detail(overrides: Partial<AutomationDetail> = {}): AutomationDetail {
  return {
    id: 'a-1',
    name: 'Reminder',
    description: null,
    status: 'draft',
    category: 'custom',
    template_key: null,
    is_system: false,
    locale: 'en',
    draft,
    published: null,
    trigger_keys: ['manual'],
    sends_to_ai: false,
    published_version: null,
    has_unpublished_changes: true,
    stats: { active_runs: 0, completed_7d: 0, failed_7d: 0 },
    updated_at: '2026-03-01T00:00:00Z',
    created_at: '2026-03-01T00:00:00Z',
    ...overrides,
  };
}

function renderBuilder(automation = detail(), others: unknown[] = []) {
  mockApi('get', '/automations/catalog', { data: catalog });
  mockApi('get', '/automations', { data: others });
  const { wrapper } = createQueryWrapper();
  render(<AutomationBuilder automation={automation} />, { wrapper });
  return userEvent.setup();
}

beforeEach(() => {
  toast.mockReset();
  currentUser.role = 'admin';
});

describe('AutomationBuilder', () => {
  it('adds a step after the last one and saves the draft', async () => {
    mockApi('post', '/automations/validate', { data: { valid: true, issues: [] } });
    const saved = mockApi('put', '/automations/a-1/draft', { data: detail() });
    const user = renderBuilder();

    expect(screen.getByRole('button', { name: /^Send SMS:/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save draft' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Add a step here' }));
    const picker = await screen.findByRole('dialog', { name: 'Add a step' });
    // Steps that cannot go here say why.
    expect(within(picker).getByRole('button', { name: 'Send to AI agent — Connect an AI agent first (Settings → AI Agent)' })).toBeDisabled();
    await user.click(within(picker).getByRole('button', { name: 'Wait' }));

    expect(await screen.findByRole('button', { name: /^Wait:/ })).toBeInTheDocument();
    expect(within(screen.getByRole('complementary', { name: 'Step settings' })).getByRole('heading', { name: 'Wait' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(saved).toHaveLength(1));
    const body = saved[0].body as AutomationDefinition;
    expect(body.graph.nodes.map((n) => n.type)).toEqual(['send_sms', 'wait']);
    expect(body.graph.edges).toEqual([{ source: 'sms_1', target: body.graph.nodes[1].key }]);
    expect(toast).toHaveBeenCalledWith({ title: 'Draft saved' });
  });

  it('shows why publishing was refused and jumps to the step', async () => {
    const issue = { node_key: 'sms_1', path: 'config.text', message: 'SMS text is required' };
    mockApi('post', '/automations/validate', { data: { valid: false, issues: [issue] } });
    mockApi('post', '/automations/a-1/publish', {
      status: 400,
      message: 'Fix the problems before publishing',
      errors: [issue] as unknown as Record<string, unknown>,
    });
    const user = renderBuilder();

    await user.click(screen.getByRole('button', { name: 'Publish' }));

    await waitFor(() => expect(toast).toHaveBeenCalledWith({ title: 'Fix 1 problem before publishing', variant: 'error' }));
    const problems = screen.getByRole('status');
    expect(within(problems).getByText('1 problem to fix before publishing')).toBeInTheDocument();
    await user.click(within(problems).getByRole('button', { name: 'Send SMS: SMS text is required' }));

    const panel = screen.getByRole('complementary', { name: 'Step settings' });
    expect(within(panel).getByRole('heading', { name: 'Send SMS' })).toBeInTheDocument();
    expect(within(panel).getByText('SMS text is required')).toBeInTheDocument();
  });

  it('flags problems while editing, from the API validator', async () => {
    mockApi('post', '/automations/validate', {
      data: { valid: false, issues: [{ path: 'triggers', message: 'Add at least one trigger' }] },
    });
    renderBuilder();

    expect(await screen.findByText('Add at least one trigger', {}, { timeout: 3000 })).toBeInTheDocument();
  });

  it('is read-only for agents, who can still look at runs', async () => {
    currentUser.role = 'agent';
    mockApi('post', '/automations/validate', { data: { valid: true, issues: [] } });
    mockApi('get', '/automations/a-1/runs', { data: { items: [], total: 0 } });
    const user = renderBuilder(detail({ status: 'active', published_version: 1, has_unpublished_changes: false }));

    expect(screen.getByRole('textbox', { name: 'Automation name' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Publish' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save draft' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Add a step|Insert a step/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Runs' }));
    expect(await screen.findByText('No runs yet.')).toBeInTheDocument();
  });

  it('warns when another active automation also sends incoming messages to the AI', async () => {
    mockApi('post', '/automations/validate', { data: { valid: true, issues: [] } });
    const aiDraft = {
      ...draft,
      triggers: [{ key: 'message.received' }],
      graph: { nodes: [{ key: 'ai', type: 'send_to_ai', config: {} }], edges: [] },
    } as AutomationDefinition;
    const incoming = { id: 'a-ai', name: 'AI agent: answer incoming messages', status: 'active', trigger_keys: ['message.received'], sends_to_ai: true };
    renderBuilder(detail({ draft: aiDraft, trigger_keys: ['message.received'] }), [incoming, { ...incoming, id: 'a-off', status: 'paused' }]);

    expect(await screen.findByRole('note')).toHaveTextContent('"AI agent: answer incoming messages" also sends incoming messages to the AI agent');
  });

  it('does not warn for automations that do not send incoming messages to the AI', async () => {
    mockApi('post', '/automations/validate', { data: { valid: true, issues: [] } });
    const incoming = { id: 'a-ai', name: 'AI agent: answer incoming messages', status: 'active', trigger_keys: ['message.received'], sends_to_ai: true };
    renderBuilder(detail(), [incoming]);

    await screen.findByRole('button', { name: /^Send SMS:/ });
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });
});
