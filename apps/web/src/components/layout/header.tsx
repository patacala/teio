'use client';

import { usePathname } from 'next/navigation';
import { NotificationBell } from '@/components/notifications/notification-bell';
import { useAuth } from '@/hooks/useAuth';
import { useCurrentUser } from '@/hooks/useTeam';
import { getInitials } from '@/lib/utils';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { LogOut, User, Search, Menu, ChevronDown } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useShell } from './shell-context';

const PAGE_TITLES: Record<string, string> = {
  '/': 'Dashboard',
  '/inbox': 'Inbox',
  '/voice': 'Voice',
  '/schedule': 'Schedule',
  '/templates': 'Templates',
  '/contacts': 'Contacts',
  '/integrations': 'Integrations',
  // Config
  '/config/agents': 'AI Agent',
  '/config/funnel': 'Funnel',
  '/config/sequences': 'Follow-up Sequences',
  '/config/webhooks': 'Webhooks',
  '/config/channels': 'Channels',
  '/config/communications': 'Communications',
  '/config/payments': 'Payments',
  // Admin
  '/admin': 'Admin Panel',
  '/admin/team': 'Team',
  '/admin/billing': 'Billing',
  '/admin/api-keys': 'API Keys',
  '/admin/demo': 'Demo Requests',
};

const DETAIL_TITLES: Array<[RegExp, string]> = [
  [/^\/contacts\/[^/]+$/, 'Contact details'],
  [/^\/voice\/[^/]+$/, 'Call details'],
];

function getPageTitle(pathname: string): string {
  const exact = PAGE_TITLES[pathname];
  if (exact) return exact;
  const detail = DETAIL_TITLES.find(([pattern]) => pattern.test(pathname));
  if (detail) return detail[1];
  const parent = Object.keys(PAGE_TITLES)
    .filter((route) => route !== '/' && pathname.startsWith(route + '/'))
    .sort((a, b) => b.length - a.length)[0];
  return parent ? PAGE_TITLES[parent] : 'CRM';
}

export function Header() {
  const pathname = usePathname();
  const { user, signOut } = useAuth();
  const { data: currentUser } = useCurrentUser();
  const { setMobileNavOpen } = useShell();
  const router = useRouter();

  const pageTitle = getPageTitle(pathname);
  const displayName = user?.user_metadata?.full_name ?? user?.email ?? 'User';
  const initials = getInitials(displayName);
  const roleLabel = currentUser?.is_platform_admin ? 'Platform admin' : currentUser?.role;

  const handleSignOut = async () => {
    await signOut();
    router.push('/login');
  };

  const openCommandPalette = () => {
    const e = new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true });
    document.dispatchEvent(e);
  };

  return (
    <header className="shell-surface flex h-16 shrink-0 items-center gap-3 rounded-panel px-3 md:px-5">
      <button
        type="button"
        onClick={() => setMobileNavOpen(true)}
        className="flex h-9 w-9 items-center justify-center rounded-control text-secondary transition-colors hover:bg-surface-hover hover:text-primary md:hidden"
        aria-label="Open navigation"
      >
        <Menu className="h-[18px] w-[18px]" />
      </button>

      <span className="min-w-0 shrink truncate text-base font-semibold tracking-tight text-primary md:w-48 md:shrink-0">
        {pageTitle}
      </span>

      <div className="flex min-w-0 flex-1 justify-center">
        <button
          type="button"
          onClick={openCommandPalette}
          className="hidden h-10 w-full max-w-md items-center gap-2.5 rounded-control border border-subtle bg-app/70 px-3.5 text-sm text-muted transition-colors hover:border-strong hover:text-secondary sm:flex"
        >
          <Search className="h-4 w-4 shrink-0" />
          <span className="flex-1 text-left">Search…</span>
          <kbd className="rounded-md border border-subtle bg-surface-raised px-1.5 py-0.5 font-sans text-[10px] text-muted">⌘K</kbd>
        </button>
      </div>

      <div className="flex shrink-0 items-center gap-1.5 md:gap-3">
        <button
          type="button"
          onClick={openCommandPalette}
          className="flex h-9 w-9 items-center justify-center rounded-control text-secondary transition-colors hover:bg-surface-hover hover:text-primary sm:hidden"
          aria-label="Search"
        >
          <Search className="h-[18px] w-[18px]" />
        </button>

        <NotificationBell />

        <div className="hidden h-8 w-px bg-divider md:block" />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="flex items-center gap-2.5 rounded-control p-1 text-left transition-colors hover:bg-surface-hover lg:pr-2"
              aria-label="Account menu"
            >
              <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full border border-accent/15 bg-olive-dark text-xs font-semibold text-accent">
                {initials}
              </span>
              <span className="hidden min-w-0 flex-col lg:flex">
                <span className="max-w-40 truncate text-[13px] font-medium leading-4 text-primary">{displayName}</span>
                {roleLabel && (
                  <span className="max-w-40 truncate text-[11px] capitalize leading-4 text-muted">{roleLabel}</span>
                )}
              </span>
              <ChevronDown className="hidden h-3.5 w-3.5 text-muted lg:block" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuLabel className="font-normal">
              <p className="text-sm font-medium text-primary">{displayName}</p>
              {user?.email && (
                <p className="truncate text-xs text-muted">{user.email}</p>
              )}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem>
              <User className="h-4 w-4" />
              Profile
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleSignOut}>
              <LogOut className="h-4 w-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
