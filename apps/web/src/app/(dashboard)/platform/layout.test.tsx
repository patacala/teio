import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PlatformLayout from './layout';

const nav = vi.hoisted(() => ({ replace: vi.fn() }));
const team = vi.hoisted(() => ({ state: { data: undefined as unknown, isLoading: false, isError: false } }));

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: nav.replace }) }));
vi.mock('@/hooks/useTeam', () => ({ useCurrentUser: () => team.state }));

beforeEach(() => nav.replace.mockClear());

describe('PlatformLayout', () => {
  it('renders the page for platform admins', () => {
    team.state = { data: { role: 'admin', is_platform_admin: true }, isLoading: false, isError: false };
    render(<PlatformLayout><p>Platform page</p></PlatformLayout>);
    expect(screen.getByText('Platform page')).toBeInTheDocument();
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it.each(['owner', 'admin', 'agent'])('sends an organization %s away', async (role) => {
    team.state = { data: { role, is_platform_admin: false }, isLoading: false, isError: false };
    render(<PlatformLayout><p>Platform page</p></PlatformLayout>);
    expect(screen.queryByText('Platform page')).not.toBeInTheDocument();
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith('/'));
  });

  it('waits for the user before deciding', () => {
    team.state = { data: undefined, isLoading: true, isError: false };
    render(<PlatformLayout><p>Platform page</p></PlatformLayout>);
    expect(screen.queryByText('Platform page')).not.toBeInTheDocument();
    expect(nav.replace).not.toHaveBeenCalled();
  });
});
