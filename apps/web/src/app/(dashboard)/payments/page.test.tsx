import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import PaymentsPage from './page';

const state = vi.hoisted(() => ({ attention: [] as unknown[] }));

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/hooks/usePayments', () => ({
  usePaymentsNeedingAttention: () => ({ data: state.attention }),
}));
vi.mock('../config/(admin)/payments/_components/AttentionTab', () => ({
  AttentionTab: () => <div>attention-tab</div>,
}));
vi.mock('../config/(admin)/payments/_components/TransactionsTab', () => ({
  TransactionsTab: () => <div>transactions-tab</div>,
}));

describe('PaymentsPage', () => {
  it('defaults to Transactions when nothing needs attention', () => {
    state.attention = [];
    render(<PaymentsPage />);
    expect(screen.getByText('transactions-tab')).toBeVisible();
    expect(screen.getByText('Needs attention')).toBeInTheDocument();
  });

  it('defaults to the attention tab and shows a count when something needs it', () => {
    state.attention = [{ id: '1' }, { id: '2' }];
    render(<PaymentsPage />);
    expect(screen.getByText('attention-tab')).toBeVisible();
    expect(screen.getByText('Needs attention (2)')).toBeInTheDocument();
  });
});
