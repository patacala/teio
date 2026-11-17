import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { CommandPalette } from './command-palette';
import type { Permissions } from '@/lib/permissions';

const nav = vi.hoisted(() => ({ push: vi.fn() }));
const state = vi.hoisted(() => ({
  leads: [] as { id: string; first_name: string; last_name: string }[],
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: nav.push }),
}));
vi.mock('@/hooks/useTeam', () => ({
  useCurrentUser: () => ({ data: { is_platform_admin: false } }),
}));
vi.mock('@/contexts/impersonation-context', () => ({
  useImpersonation: () => ({ isImpersonating: false }),
}));
vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: (): Permissions => ({
    isAdmin: true,
    canManageConfiguration: true,
    canAccessAdmin: true,
    canResolvePaymentAttention: true,
    canOverrideCalendarRules: true,
  }),
}));
vi.mock('@/hooks/useContacts', () => ({
  useContacts: (params?: { search?: string }) => ({
    data: params?.search ? { items: state.leads, meta: {} } : undefined,
  }),
}));

async function openPalette() {
  render(<CommandPalette />);
  await userEvent.keyboard('{Meta>}k{/Meta}');
}

describe('CommandPalette', () => {
  it('filters navigation items as the user types', async () => {
    state.leads = [];
    await openPalette();
    const input = screen.getByPlaceholderText('Go to… or search a lead');
    expect(screen.getByText('Payments')).toBeInTheDocument();

    await userEvent.type(input, 'sched');
    expect(screen.getByText('Schedule')).toBeInTheDocument();
    expect(screen.queryByText('Payments')).not.toBeInTheDocument();
  });

  it('shows matching leads and navigates to their Inbox panel on selection', async () => {
    state.leads = [{ id: 'contact-1', first_name: 'Ada', last_name: 'Lovelace' }];
    await openPalette();
    const input = screen.getByPlaceholderText('Go to… or search a lead');

    await userEvent.type(input, 'ad');
    await waitFor(() => expect(screen.getByText('Ada Lovelace')).toBeInTheDocument());

    await userEvent.click(screen.getByText('Ada Lovelace'));
    expect(nav.push).toHaveBeenCalledWith('/inbox?lead=contact-1');
  });
});
