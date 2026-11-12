import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Funnel, FunnelStage } from '@/services/funnels.service';
import { mockApi } from '@/test/msw/api';
import { createQueryWrapper } from '@/test/query';
import { StagesDrawer } from './StagesDrawer';

const { toast } = vi.hoisted(() => ({ toast: vi.fn() }));
vi.mock('@/hooks/useToast', () => ({ toast }));

const FUNNEL: Funnel = {
  id: 'f-1', name: 'Sales Pipeline', organization_id: 'org-1',
  created_at: '2026-06-01T00:00:00Z', updated_at: '2026-06-01T00:00:00Z',
};

const STAGES: FunnelStage[] = [
  { id: 's-1', funnel_id: 'f-1', name: 'New Lead', position: 0, color: '#3B82F6', stage_type: 'new' },
  { id: 's-2', funnel_id: 'f-1', name: 'Contacted', position: 1, color: '#8B5CF6', stage_type: 'contacted' },
  { id: 's-3', funnel_id: 'f-1', name: 'Lost', position: 2, color: '#EF4444', stage_type: 'lost', is_terminal: true },
];

function renderDrawer() {
  mockApi('get', '/funnels/f-1/stages', { data: STAGES });
  const { wrapper } = createQueryWrapper();
  render(<StagesDrawer funnel={FUNNEL} open onOpenChange={vi.fn()} />, { wrapper });
  return userEvent.setup();
}

beforeEach(() => toast.mockReset());

describe('StagesDrawer', () => {
  it('lists the stages in order with their automation type', async () => {
    renderDrawer();

    expect(await screen.findByText('New Lead')).toBeInTheDocument();
    expect(screen.getByText('Lost (terminal)', { selector: 'span' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Move New Lead up' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move Lost down' })).toBeDisabled();
  });

  it('reorders a stage', async () => {
    const reorder = mockApi('post', '/funnels/f-1/stages/reorder', { data: null });
    const user = renderDrawer();

    await user.click(await screen.findByRole('button', { name: 'Move Contacted up' }));

    await vi.waitFor(() => expect(reorder).toHaveLength(1));
    expect(reorder[0].body).toEqual({ orderedIds: ['s-2', 's-1', 's-3'] });
  });

  it('adds a stage with a palette color and automation type', async () => {
    const create = mockApi('post', '/funnels/f-1/stages', { data: { id: 's-4' } });
    const user = renderDrawer();
    await screen.findByText('New Lead');

    const form = screen.getByText('Add a stage').closest('form') as HTMLElement;
    await user.type(within(form).getByRole('textbox', { name: 'Stage name' }), 'Booked');
    await user.click(within(form).getByRole('radio', { name: 'Purple' }));
    await user.click(within(form).getByRole('combobox', { name: 'Stage type' }));
    await user.click(await screen.findByRole('option', { name: 'Appointment confirmed' }));
    await user.click(within(form).getByRole('button', { name: 'Add stage' }));

    await vi.waitFor(() => expect(create).toHaveLength(1));
    expect(create[0].body).toEqual({
      name: 'Booked', color: '#a77be8', stage_type: 'appointment_confirmed', is_terminal: false,
    });
  });

  it('edits a stage, replacing a legacy color with its palette equivalent', async () => {
    const update = mockApi('patch', '/funnels/f-1/stages/s-1', { data: {} });
    const user = renderDrawer();

    await user.click(await screen.findByRole('button', { name: 'Edit New Lead' }));
    const editor = screen.getByRole('button', { name: 'Save' }).closest('.inset-surface') as HTMLElement;
    expect(within(editor).getByRole('radio', { name: 'Cyan' })).toHaveAttribute('aria-checked', 'true');
    const name = within(editor).getByDisplayValue('New Lead');
    await user.clear(name);
    await user.type(name, 'Inbound');
    await user.click(within(editor).getByRole('button', { name: 'Save' }));

    await vi.waitFor(() => expect(update).toHaveLength(1));
    expect(update[0].body).toEqual({ name: 'Inbound', color: '#62c5c5', stage_type: 'new', is_terminal: false });
  });

  it('asks for confirmation and warns how many contacts are in the stage before deleting', async () => {
    mockApi('get', '/contacts', { data: { items: [], meta: { total: 2, page: 1, limit: 1, total_pages: 2 } } });
    const remove = mockApi('delete', '/funnels/f-1/stages/s-2', { status: 204 });
    const user = renderDrawer();

    await user.click(await screen.findByRole('button', { name: 'Delete Contacted' }));

    const dialog = await screen.findByRole('dialog', { name: 'Delete “Contacted”?' });
    expect(await within(dialog).findByText(/2 contacts are in this stage/)).toBeInTheDocument();
    expect(remove).toHaveLength(0);

    await user.click(within(dialog).getByRole('button', { name: 'Delete stage' }));

    await vi.waitFor(() => expect(remove).toHaveLength(1));
  });
});
