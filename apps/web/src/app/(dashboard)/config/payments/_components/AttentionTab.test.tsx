import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockApi } from '@/test/msw/api';
import { createQueryWrapper } from '@/test/query';
import { AttentionTab } from './AttentionTab';

const { toast } = vi.hoisted(() => ({ toast: vi.fn() }));
vi.mock('@/hooks/useToast', () => ({ toast }));

const payment = {
  id: 'pay-1',
  organization_id: 'org-1',
  service_id: 'svc-1',
  service: { id: 'svc-1', name: 'Consulta', amount: 5000 },
  contact_id: null,
  contact: null,
  contact_name: 'Ana Pérez',
  conversation_id: null,
  amount: 5000,
  currency: 'mxn',
  status: 'paid',
  checkout_url: null,
  paid_at: '2026-03-20T15:00:00Z',
  attention_reason: 'slot_unavailable',
  created_at: '2026-03-20T14:00:00Z',
};

beforeEach(() => toast.mockReset());

describe('AttentionTab', () => {
  it('lists paid payments that need a person and records a manual refund', async () => {
    mockApi('get', '/payments/attention', { data: [payment] });
    const resolved = mockApi('post', '/payments/pay-1/resolve', { data: { ...payment, resolution: 'refunded_manually' } });
    const { wrapper } = createQueryWrapper();
    render(<AttentionTab />, { wrapper });
    const user = userEvent.setup();

    const row = await screen.findByTestId('attention-pay-1');
    expect(within(row).getByText(/Ana Pérez · MX\$50\.00/)).toBeInTheDocument();
    expect(within(row).getByText('Paid, but the time was taken before the payment arrived')).toBeInTheDocument();
    expect(within(row).getByRole('button', { name: 'Rebooked' })).toBeDisabled();

    await user.type(within(row).getByPlaceholderText(/Note/), 'Refunded, contact rebooks next week');
    await user.click(within(row).getByRole('button', { name: 'Refunded in Stripe' }));

    await waitFor(() => expect(resolved).toHaveLength(1));
    expect(resolved[0].body).toEqual({ resolution: 'refunded_manually', note: 'Refunded, contact rebooks next week' });
    expect(toast).toHaveBeenCalledWith({ title: 'Payment resolved' });
  });

  it('says when there is nothing to review', async () => {
    mockApi('get', '/payments/attention', { data: [] });
    const { wrapper } = createQueryWrapper();
    render(<AttentionTab />, { wrapper });
    expect(await screen.findByText(/Nothing to review/)).toBeInTheDocument();
  });
});
