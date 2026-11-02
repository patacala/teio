'use client';

import { usePathname } from 'next/navigation';
import { NotificationBell } from '@/components/notifications/notification-bell';
import { useAuth } from '@/hooks/useAuth';
import { getInitials } from '@/lib/utils';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { LogOut, User, Search } from 'lucide-react';
import { useRouter } from 'next/navigation';

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
  '/config/sequences': 'Secuencias de seguimiento',
  '/config/webhooks': 'Webhooks',
  '/config/channels': 'Channels',
  '/config/communications': 'Communications',
  // Admin
  '/admin': 'Admin Panel',
  '/admin/team': 'Team',
  '/admin/billing': 'Billing',
  '/admin/api-keys': 'API Keys',
  '/admin/demo': 'Demo Requests',
};

export function Header() {
  const pathname = usePathname();
  const { user, signOut } = useAuth();
  const router = useRouter();

  const pageTitle = PAGE_TITLES[pathname]
    ?? pathname.split('/').filter(Boolean).pop()
    ?? 'CRM';
  const displayName = user?.user_metadata?.full_name ?? user?.email ?? 'User';
  const initials = getInitials(displayName);

  const handleSignOut = async () => {
    await signOut();
    router.push('/login');
  };

  return (
    <header className="h-14 bg-white border-b border-border flex items-center justify-between px-5 shrink-0">
      <span className="shrink-0 whitespace-nowrap font-semibold text-gray-900 text-sm">{pageTitle}</span>

      <div className="flex items-center gap-2">
        {/* Global search */}
        <div
          className="hidden sm:flex items-center gap-2 h-8 px-3 rounded-lg border border-border bg-surface text-sm text-gray-400 cursor-pointer hover:border-gray-300 transition-colors w-52"
          onClick={() => {
            const e = new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true });
            document.dispatchEvent(e);
          }}
        >
          <Search className="h-3.5 w-3.5 shrink-0" />
          <span className="flex-1 text-xs">Search…</span>
          <kbd className="inline-flex items-center gap-0.5 text-[10px] text-gray-400">
            <span>⌘K</span>
          </kbd>
        </div>

        <NotificationBell />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold hover:ring-2 hover:ring-blue-200 transition-all">
              {initials}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuLabel className="font-normal">
              <p className="text-sm font-medium">{displayName}</p>
              {user?.email && (
                <p className="text-xs text-gray-500 truncate">{user.email}</p>
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
