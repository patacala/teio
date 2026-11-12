import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Funnel, FunnelStage } from '@/services/funnels.service';
import { mockApi } from '@/test/msw/api';
import { createQueryWrapper } from '@/test/query';
import { StageSelect } from './stage-select';

const funnel = (id: string, name: string): Funnel => ({
  id, name, organization_id: 'org-1', created_at: '2026-06-01T00:00:00Z', updated_at: '2026-06-01T00:00:00Z',
});
const stage = (id: string, funnelId: string, name: string, position: number): FunnelStage => ({
  id, funnel_id: funnelId, name, position,
});

function renderSelect(funnels: Funnel[], stages: FunnelStage[], value?: string) {
  mockApi('get', '/funnels', { data: funnels });
  mockApi('get', '/funnels/stages', { data: stages });
  const onValueChange = vi.fn();
  const { wrapper } = createQueryWrapper();
  render(<StageSelect value={value} onValueChange={onValueChange} />, { wrapper });
  return { onValueChange, user: userEvent.setup() };
}

describe('StageSelect', () => {
  it('shows the current stage even when the contact is not in the newest funnel', async () => {
    // GET /funnels returns the newest funnel first.
    const { user, onValueChange } = renderSelect(
      [funnel('f-new', 'Onboarding'), funnel('f-old', 'Sales')],
      [stage('s-2', 'f-old', 'Qualified', 1), stage('s-1', 'f-old', 'New Lead', 0), stage('o-1', 'f-new', 'Kickoff', 0)],
      's-2',
    );

    const trigger = await screen.findByRole('combobox', { name: 'Funnel stage' });
    expect(trigger).toHaveTextContent('Qualified');

    await user.click(trigger);
    expect(screen.getByText('Sales')).toBeInTheDocument();
    expect(screen.getByText('Onboarding')).toBeInTheDocument();
    const options = screen.getAllByRole('option').map((o) => o.textContent);
    expect(options).toEqual(['Kickoff', 'New Lead', 'Qualified']);

    await user.click(screen.getByRole('option', { name: 'New Lead' }));
    expect(onValueChange).toHaveBeenCalledWith('s-1');
  });

  it('does not label groups when the organization has a single funnel', async () => {
    const { user } = renderSelect([funnel('f-1', 'Sales')], [stage('s-1', 'f-1', 'New Lead', 0)]);

    await user.click(await screen.findByRole('combobox', { name: 'Funnel stage' }));

    expect(screen.getByRole('option', { name: 'New Lead' })).toBeInTheDocument();
    expect(screen.queryByText('Sales')).not.toBeInTheDocument();
  });
});
