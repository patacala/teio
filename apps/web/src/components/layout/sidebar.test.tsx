import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Sidebar } from './sidebar';
import { ShellProvider } from './shell-context';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => '/platform' }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { email: 'pat@platform.test', user_metadata: {} }, signOut: vi.fn() }) }));
vi.mock('@/hooks/useOrganizations', () => ({ useOrganizations: () => ({ data: [] }) }));

const me = vi.hoisted(() => ({ user: { role: 'admin', is_platform_admin: true } }));
vi.mock('@/hooks/useTeam', () => ({ useCurrentUser: () => ({ data: me.user }) }));

const impersonation = vi.hoisted(() => ({ isImpersonating: false }));
vi.mock('@/contexts/impersonation-context', () => ({
  useImpersonation: () => ({ ...impersonation, organizationName: 'Acme Dental', startImpersonating: vi.fn(), stopImpersonating: vi.fn() }),
}));

function renderSidebar() {
  render(<ShellProvider><Sidebar /></ShellProvider>);
  return screen.getAllByRole('complementary')[0];
}

beforeEach(() => {
  localStorage.setItem('sidebar-collapsed', 'false');
  me.user = { role: 'admin', is_platform_admin: true };
  impersonation.isImpersonating = false;
});

describe('Sidebar', () => {
  it('takes a platform admin to the platform overview, marked as the current page', () => {
    const nav = renderSidebar();
    const dashboard = within(nav).getByRole('link', { name: 'Dashboard' });
    expect(dashboard).toHaveAttribute('href', '/platform');
    expect(dashboard).toHaveAttribute('aria-current', 'page');
    expect(within(nav).getByRole('link', { name: 'Demo accounts' })).toHaveAttribute('href', '/platform/demo-accounts');
  });

  it('keeps the organization dashboard for organization members', () => {
    me.user = { role: 'admin', is_platform_admin: false };
    expect(within(renderSidebar()).getByRole('link', { name: 'Dashboard' })).toHaveAttribute('href', '/');
  });

  it('uses the organization dashboard while a platform admin is inside an organization', () => {
    impersonation.isImpersonating = true;
    expect(within(renderSidebar()).getByRole('link', { name: 'Dashboard' })).toHaveAttribute('href', '/');
  });
});
