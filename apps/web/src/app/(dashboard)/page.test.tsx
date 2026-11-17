import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockApi } from '@/test/msw/api';
import { createQueryWrapper } from '@/test/query';
import DashboardPage from './page';

const nav = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => nav }));

const viewer = vi.hoisted(() => ({ platformMode: false, currentUser: { role: 'admin' } as object | undefined }));
vi.mock('@/components/billing/use-billing-viewer', () => ({ useBillingViewer: () => viewer }));

beforeEach(() => nav.replace.mockClear());

describe('Dashboard home', () => {
  it('sends a platform admin outside any organization to the platform overview, without loading org stats', async () => {
    viewer.platformMode = true;
    viewer.currentUser = { role: 'admin', is_platform_admin: true };
    const stats = mockApi('get', '/analytics/dashboard', { data: {} });
    const { wrapper } = createQueryWrapper();
    const { container } = render(<DashboardPage />, { wrapper });

    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith('/platform'));
    expect(container).toBeEmptyDOMElement();
    expect(stats).toHaveLength(0);
  });

  it('loads nothing until it knows who is looking, then redirects a platform admin', async () => {
    viewer.platformMode = false;
    viewer.currentUser = undefined; // the current user arrives a moment after the first render
    const stats = mockApi('get', '/analytics/dashboard', { data: {} });
    const { wrapper } = createQueryWrapper();
    const { rerender } = render(<DashboardPage />, { wrapper });
    expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();

    viewer.platformMode = true;
    viewer.currentUser = { role: 'admin', is_platform_admin: true };
    rerender(<DashboardPage />);
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith('/platform'));
    expect(stats).toHaveLength(0);
  });

  it('shows the organization dashboard to organization members (and platform admins inside an organization)', async () => {
    viewer.platformMode = false;
    viewer.currentUser = { role: 'admin' };
    const stats = mockApi('get', '/analytics/dashboard', { status: 500 });
    const { wrapper } = createQueryWrapper();
    render(<DashboardPage />, { wrapper });

    expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
    await waitFor(() => expect(stats).toHaveLength(1));
    expect(nav.replace).not.toHaveBeenCalled();
  });
});
