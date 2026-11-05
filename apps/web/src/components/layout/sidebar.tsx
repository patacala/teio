'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { useCurrentUser } from '@/hooks/useTeam';
import { useImpersonation } from '@/contexts/impersonation-context';
import { useOrganizations } from '@/hooks/useOrganizations';
import { getInitials } from '@/lib/utils';
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { Drawer, DrawerContent } from '@/components/ui/drawer';
import { DialogTitle } from '@/components/ui/dialog';
import { SidebarItem } from './sidebar-item';
import { useShell } from './shell-context';
import type { SidebarNavItem } from './sidebar-section';
import { ADMIN_ITEMS, CONFIG_ITEMS, isConfigurationPath } from './sidebar-nav';
import {
  LayoutDashboard,
  MessageSquare,
  Calendar,
  Users,
  Phone,
  MonitorPlay,
  PanelLeftClose,
  PanelLeftOpen,
  LogOut,
  Building2,
  Settings,
  X,
  Shield,
  Mail,
  Filter,
  ArrowLeft,
} from 'lucide-react';

const MAIN_ITEMS: SidebarNavItem[] = [
  { label: 'Dashboard', href: '/', icon: LayoutDashboard, exact: true },
  { label: 'Inbox', href: '/inbox', icon: MessageSquare },
  { label: 'Contacts', href: '/contacts', icon: Users },
  { label: 'Funnel', href: '/config/funnel', icon: Filter },
  { label: 'Voice', href: '/voice', icon: Phone },
  { label: 'Schedule', href: '/schedule', icon: Calendar },
];

const PLATFORM_SIDEBAR_ITEMS: SidebarNavItem[] = [
  { label: 'Dashboard', href: '/', icon: LayoutDashboard, exact: true },
  { label: 'Communications', href: '/config/communications', icon: Mail },
  { label: 'Demos', href: '/admin/demo', icon: MonitorPlay },
];

type OverlayView = null | 'settings' | 'admin';

function isItemActive(pathname: string, item: SidebarNavItem) {
  return item.exact
    ? pathname === item.href
    : pathname === item.href || pathname.startsWith(item.href + '/');
}

function Logo() {
  return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-tile bg-accent text-on-accent">
      <MessageSquare className="h-4 w-4" strokeWidth={2.2} />
    </div>
  );
}

function NavSectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="select-none px-3 pb-1 pt-4 text-[10px] font-medium uppercase tracking-widest text-muted">
      {children}
    </p>
  );
}

export function Sidebar() {
  const { user, signOut } = useAuth();
  const { data: currentUser } = useCurrentUser();
  const isPlatformAdmin = currentUser?.is_platform_admin === true;
  const { isImpersonating, organizationName, startImpersonating, stopImpersonating } = useImpersonation();
  const { data: organizations } = useOrganizations(isPlatformAdmin);
  const router = useRouter();
  const pathname = usePathname();
  const { mobileNavOpen, setMobileNavOpen } = useShell();
  const [collapsed, setCollapsed] = useState(true);
  const [overlayView, setOverlayView] = useState<OverlayView>(null);

  useEffect(() => {
    const saved = localStorage.getItem('sidebar-collapsed');
    if (saved !== null) setCollapsed(saved === 'true');
  }, []);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname, setMobileNavOpen]);

  useEffect(() => {
    if (overlayView === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOverlayView(null);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [overlayView]);

  const setCollapsedPersisted = (value: boolean) => {
    localStorage.setItem('sidebar-collapsed', String(value));
    setCollapsed(value);
  };

  const handleSignOut = async () => {
    await signOut();
    router.push('/login');
  };

  const handleSelectOrg = (orgId: string) => {
    if (!orgId || !organizations) return;
    const org = organizations.find((o) => o.id === orgId);
    if (org) {
      startImpersonating(org.id, org.name);
    }
  };

  const displayName = user?.user_metadata?.full_name ?? user?.email ?? 'User';
  const initials = getInitials(displayName);

  const showPlatformOnly = isPlatformAdmin && !isImpersonating;
  const showOrgSections = !isPlatformAdmin || isImpersonating;
  const primaryItems = showPlatformOnly ? PLATFORM_SIDEBAR_ITEMS : showOrgSections ? MAIN_ITEMS : [];
  const overlayItems = overlayView === 'settings' ? CONFIG_ITEMS : overlayView === 'admin' ? ADMIN_ITEMS : null;
  const overlayTitle = overlayView === 'settings' ? 'Settings' : 'Admin';

  const orgSelector = isImpersonating ? (
    <div className="flex h-9 items-center gap-2 rounded-control border border-accent/15 bg-olive-dark px-2.5">
      <Building2 className="h-3.5 w-3.5 shrink-0 text-accent" />
      <span className="flex-1 truncate text-[11px] font-medium text-primary">{organizationName}</span>
      <button
        onClick={stopImpersonating}
        className="shrink-0 rounded-md p-0.5 text-secondary transition-colors hover:text-primary"
        aria-label="Exit organization"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  ) : (
    <Select onValueChange={handleSelectOrg}>
      <SelectTrigger className="h-9 text-xs">
        <Building2 className="h-3.5 w-3.5 shrink-0 text-muted" />
        <SelectValue placeholder="Select organization..." />
      </SelectTrigger>
      <SelectContent>
        {(organizations ?? []).map((org) => (
          <SelectItem key={org.id} value={org.id}>{org.name}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  return (
    <TooltipProvider delayDuration={0}>
      <aside
        className={cn(
          'shell-surface hidden shrink-0 flex-col rounded-panel transition-[width] duration-200 md:flex',
          collapsed ? 'w-[72px]' : 'w-[232px]',
        )}
      >
        <div
          className={cn(
            'shrink-0 border-b border-subtle',
            collapsed ? 'flex flex-col items-center gap-2 py-3' : 'flex h-16 items-center gap-2.5 pl-4 pr-3',
          )}
        >
          <Logo />
          {!collapsed && (
            <span className="flex-1 truncate text-sm font-semibold tracking-tight text-primary">
              {overlayView ? overlayTitle : 'AI CRM'}
            </span>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => setCollapsedPersisted(!collapsed)}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-hover hover:text-primary"
                aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                aria-expanded={!collapsed}
              >
                {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">{collapsed ? 'Expand sidebar' : 'Collapse sidebar'}</TooltipContent>
          </Tooltip>
        </div>

        {isPlatformAdmin && (
          <div className={cn('shrink-0 border-b border-subtle', collapsed ? 'flex justify-center py-3' : 'p-3')}>
            {!collapsed ? (
              orgSelector
            ) : (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={isImpersonating ? stopImpersonating : () => setCollapsedPersisted(false)}
                    className={cn(
                      'flex h-10 w-10 items-center justify-center rounded-control border transition-colors',
                      isImpersonating
                        ? 'border-accent/15 bg-olive-dark text-accent hover:text-primary'
                        : 'border-transparent text-secondary hover:bg-surface-hover hover:text-primary',
                    )}
                    aria-label={isImpersonating ? `${organizationName} — Exit` : 'Select organization'}
                  >
                    {isImpersonating ? <X className="h-4 w-4" /> : <Building2 className="h-[18px] w-[18px]" />}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right">
                  {isImpersonating ? `${organizationName} — Exit` : 'Select organization'}
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        )}

        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {overlayItems ? (
            <>
              <SidebarItem
                label="Back"
                icon={ArrowLeft}
                active={false}
                collapsed={collapsed}
                onClick={() => setOverlayView(null)}
              />
              <div className="mx-1 my-3 border-t border-subtle" />
              {overlayItems.map((item) => (
                <SidebarItem
                  key={item.href}
                  label={item.label}
                  href={item.href}
                  icon={item.icon}
                  active={isItemActive(pathname, item)}
                  collapsed={collapsed}
                  exact={item.exact}
                />
              ))}
            </>
          ) : (
            <>
              {primaryItems.map((item) => (
                <SidebarItem
                  key={item.href}
                  label={item.label}
                  href={item.href}
                  icon={item.icon}
                  active={isItemActive(pathname, item)}
                  collapsed={collapsed}
                  exact={item.exact}
                />
              ))}

              {showOrgSections && (
                <>
                  <div className="mx-1 my-3 border-t border-subtle" />
                  <SidebarItem
                    label="Settings"
                    icon={Settings}
                    active={isConfigurationPath(pathname)}
                    collapsed={collapsed}
                    onClick={() => setOverlayView('settings')}
                  />
                  <SidebarItem
                    label="Admin"
                    icon={Shield}
                    active={pathname.startsWith('/admin')}
                    collapsed={collapsed}
                    onClick={() => setOverlayView('admin')}
                  />
                </>
              )}
            </>
          )}
        </nav>

        <div className="shrink-0 border-t border-subtle p-3">
          {collapsed ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={handleSignOut}
                  className="mx-auto flex h-10 w-10 items-center justify-center rounded-control text-secondary transition-colors hover:bg-surface-hover hover:text-primary"
                  aria-label="Sign out"
                >
                  <LogOut className="h-[18px] w-[18px]" strokeWidth={1.9} />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">Sign out</TooltipContent>
            </Tooltip>
          ) : (
            <button
              onClick={handleSignOut}
              className="flex w-full items-center gap-2.5 rounded-control px-2 py-2 text-left transition-colors hover:bg-surface-hover"
              title="Sign out"
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-accent/15 bg-olive-dark text-[11px] font-semibold text-accent">
                {initials}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-primary">{displayName}</p>
                <p className="flex items-center gap-1 text-[10px] text-muted">
                  <LogOut className="h-2.5 w-2.5" /> Sign out
                </p>
              </div>
            </button>
          )}
        </div>
      </aside>

      <Drawer open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <DrawerContent side="left" className="flex max-w-[280px] flex-col p-0" aria-describedby={undefined}>
          <DialogTitle className="sr-only">Navigation</DialogTitle>
          <div className="flex h-16 shrink-0 items-center gap-2.5 border-b border-subtle px-4">
            <Logo />
            <span className="text-sm font-semibold tracking-tight text-primary">AI CRM</span>
          </div>
          {isPlatformAdmin && <div className="shrink-0 border-b border-subtle p-3">{orgSelector}</div>}
          <nav className="flex-1 space-y-1 overflow-y-auto p-3">
            {primaryItems.map((item) => (
              <SidebarItem
                key={item.href}
                label={item.label}
                href={item.href}
                icon={item.icon}
                active={isItemActive(pathname, item)}
                collapsed={false}
              />
            ))}
            {showOrgSections && (
              <>
                <NavSectionLabel>Settings</NavSectionLabel>
                {CONFIG_ITEMS.map((item) => (
                  <SidebarItem
                    key={item.href}
                    label={item.label}
                    href={item.href}
                    icon={item.icon}
                    active={isItemActive(pathname, item)}
                    collapsed={false}
                  />
                ))}
                <NavSectionLabel>Admin</NavSectionLabel>
                {ADMIN_ITEMS.map((item) => (
                  <SidebarItem
                    key={item.href}
                    label={item.label}
                    href={item.href}
                    icon={item.icon}
                    active={isItemActive(pathname, item)}
                    collapsed={false}
                  />
                ))}
              </>
            )}
          </nav>
          <div className="shrink-0 border-t border-subtle p-3">
            <SidebarItem label="Sign out" icon={LogOut} active={false} collapsed={false} onClick={handleSignOut} />
          </div>
        </DrawerContent>
      </Drawer>
    </TooltipProvider>
  );
}
