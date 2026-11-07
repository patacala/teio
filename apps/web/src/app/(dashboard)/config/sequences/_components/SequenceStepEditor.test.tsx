import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SequenceTemplate } from '@/services/automation.service';
import { mockApi } from '@/test/msw/api';
import { createQueryWrapper } from '@/test/query';
import { SequenceStepEditor } from './SequenceStepEditor';

const { toast } = vi.hoisted(() => ({ toast: vi.fn() }));
vi.mock('@/hooks/useToast', () => ({ toast }));

function template(overrides: Partial<SequenceTemplate> = {}): SequenceTemplate {
  const step = (position: number, action: string, channel_strategy: string, delay_hours: number) => ({
    id: `step-${position}`,
    template_id: 'tpl-1',
    position,
    action,
    channel_strategy,
    delay_hours,
  });
  return {
    id: 'tpl-1',
    organization_id: 'org-1',
    name: 'No response',
    sequence_type: 'no_response',
    is_active: true,
    // Deliberately out of order: the editor must sort by position.
    steps: [step(2, 'call', 'voice_only', 48), step(1, 'send_message', 'auto', 24)],
    created_at: '2026-03-01T00:00:00Z',
    updated_at: '2026-03-01T00:00:00Z',
    ...overrides,
  };
}

function renderEditor(tpl: SequenceTemplate = template()) {
  const onClose = vi.fn();
  const { wrapper } = createQueryWrapper();
  render(<SequenceStepEditor template={tpl} open onClose={onClose} />, { wrapper });
  return { onClose, user: userEvent.setup() };
}

const preview = () => within(screen.getByRole('list')).getAllByRole('listitem').map((li) => li.textContent);
const waits = () => screen.getAllByRole('spinbutton') as HTMLInputElement[];
const buttons = (name: string) => screen.getAllByRole('button', { name });

beforeEach(() => {
  toast.mockReset();
});

describe('SequenceStepEditor', () => {
  it('loads the steps in position order with a cumulative preview', () => {
    renderEditor();

    expect(screen.getByText('Steps (2)')).toBeInTheDocument();
    expect(waits().map((input) => input.value)).toEqual(['24', '48']);
    expect(preview()).toEqual([
      'Message· Automatic+1 day · cumulative 1 day',
      'Call· Call only+2 days · cumulative 3 days',
    ]);
  });

  it('edits the cadence and saves the new name and steps', async () => {
    const rename = mockApi('patch', '/automation/sequences/templates/tpl-1', { data: {} });
    const replace = mockApi('put', '/automation/sequences/templates/tpl-1/steps', { data: {} });
    const { user, onClose } = renderEditor();

    const name = screen.getByDisplayValue('No response');
    await user.clear(name);
    await user.type(name, 'Lead went quiet');

    await user.click(screen.getByRole('button', { name: /add step/i }));
    expect(screen.getByText('Steps (3)')).toBeInTheDocument();

    fireEvent.change(waits()[2], { target: { value: '6' } });
    await user.click(screen.getAllByRole('combobox')[4]);
    await user.click(await screen.findByRole('option', { name: 'Email' }));
    await user.click(buttons('Move step up')[2]);

    expect(preview()).toEqual([
      'Message· Automatic+1 day · cumulative 1 day',
      'Email· Automatic+6 h · cumulative 1 day',
      'Call· Call only+2 days · cumulative 3 days',
    ]);

    await user.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(rename[0].body).toEqual({ name: 'Lead went quiet' });
    expect(replace[0].body).toEqual({
      steps: [
        { action: 'send_message', channel_strategy: 'auto', delay_hours: 24 },
        { action: 'send_email', channel_strategy: 'auto', delay_hours: 6 },
        { action: 'call', channel_strategy: 'voice_only', delay_hours: 48 },
      ],
    });
    expect(toast).toHaveBeenCalledWith({ title: 'Sequence saved' });
  });

  it('only replaces the steps when the name did not change', async () => {
    const replace = mockApi('put', '/automation/sequences/templates/tpl-1/steps', { data: {} });
    const { user, onClose } = renderEditor();

    await user.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(replace).toHaveLength(1);
  });

  describe('validation', () => {
    it.each(['0', '-3', ''])('never lets a wait drop below 1 hour (typed "%s")', (typed) => {
      renderEditor();

      fireEvent.change(waits()[1], { target: { value: typed } });

      expect(waits()[1].value).toBe('1');
      expect(preview()[1]).toBe('Call· Call only+1 h · cumulative 1 day');
    });

    it('keeps at least one step', async () => {
      const { user } = renderEditor();

      await user.click(buttons('Delete step')[0]);

      expect(screen.getByText('Steps (1)')).toBeInTheDocument();
      expect(buttons('Delete step')[0]).toBeDisabled();
    });

    it('cannot move the first step up or the last step down', () => {
      renderEditor();

      expect(buttons('Move step up')[0]).toBeDisabled();
      expect(buttons('Move step down')[1]).toBeDisabled();
      expect(buttons('Move step down')[0]).toBeEnabled();
    });
  });

  it('shows platform templates read-only', () => {
    renderEditor(template({ organization_id: null }));

    expect(screen.getByText(/platform template, shared by all organizations/i)).toBeInTheDocument();
    expect(screen.queryByDisplayValue('No response')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /add step/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /save changes/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Close' })).toHaveLength(2);
    waits().forEach((input) => expect(input).toBeDisabled());
    buttons('Delete step').forEach((button) => expect(button).toBeDisabled());
  });

  it('keeps the drawer open and shows the API error when saving fails', async () => {
    mockApi('put', '/automation/sequences/templates/tpl-1/steps', { status: 403, message: 'Platform templates are read-only' });
    const { user, onClose } = renderEditor();

    await user.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith({ title: 'Platform templates are read-only', variant: 'error' }),
    );
    expect(onClose).not.toHaveBeenCalled();
  });
});
