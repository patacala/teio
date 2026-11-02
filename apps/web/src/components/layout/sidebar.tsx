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
import { SidebarItem } from './sidebar-item';
import { OverlaySidebar } from './overlay-sidebar';
import type { SidebarNavItem } from './sidebar-section';
import { ADMIN_ITEMS, CONFIG_ITEMS, isConfigurationPath } from './sidebar-nav';
import {
  LayoutDashboard,
  MessageSquare,
  Calendar,
  Users,
  Phone,
  MonitorPlay,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Building2,
  Settings,
  X,
  Shield,
  Mail,
  Filter,
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

export function Sidebar() {
  const { user, signOut } = useAuth();
  const { data: currentUser } = useCurrentUser();
  const isPlatformAdmin = currentUser?.is_platform_admin === true;
  const { isImpersonating, organizationName, startImpersonating, stopImpersonating } = useImpersonation();
  const { data: organizations } = useOrganizations(isPlatformAdmin);
  const router = useRouter();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [overlayView, setOverlayView] = useState<OverlayView>(null);

  useEffect(() => {
    const saved = localStorage.getItem('sidebar-collapsed');
    if (saved !== null) setCollapsed(saved === 'true');
  }, []);

  const toggle = () => {
    setCollapsed((v) => {
      localStorage.setItem('sidebar-collapsed', String(!v));
      return !v;
    });
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

  return (
    <TooltipProvider delayDuration={0}>
      <aside
        className={cn(
          'flex flex-col shrink-0 border-r border-border bg-sidebar transition-all duration-200',
          collapsed ? 'w-[52px]' : 'w-[220px]',
        )}
      >
        {/* Header — Logo + Org selector for platform admin */}
        <div className="border-b border-border shrink-0">
          <div className="h-14 flex items-center px-3">
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center shrink-0">
                <MessageSquare className="w-3.5 h-3.5 text-white" />
              </div>
              {!collapsed && (
                <span className="font-bold text-gray-900 text-sm truncate tracking-tight">
                  AI CRM
                </span>
              )}
            </div>
          </div>

          {/* Org context bar — only for platform admin */}
          {isPlatformAdmin && !collapsed && (
            <div className="px-2.5 pb-2.5">
              {isImpersonating ? (
                <div className="flex items-center gap-1.5 h-8 rounded-lg bg-blue-50 border border-blue-200 px-2.5">
                  <Building2 className="h-3.5 w-3.5 text-blue-600 shrink-0" />
                  <span className="text-[11px] font-medium text-blue-700 truncate flex-1">
                    {organizationName}
                  </span>
                  <button
                    onClick={stopImpersonating}
                    className="text-blue-400 hover:text-blue-600 transition-colors shrink-0"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <Select onValueChange={handleSelectOrg}>
                  <SelectTrigger className="h-8 text-xs">
                    <Building2 className="h-3.5 w-3.5 text-gray-400 shrink-0 mr-1.5" />
                    <SelectValue placeholder="Select organization..." />
                  </SelectTrigger>
                  <SelectContent>
                    {(organizations ?? []).map((org) => (
                      <SelectItem key={org.id} value={org.id}>{org.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}
          {isPlatformAdmin && collapsed && isImpersonating && (
            <div className="px-1.5 pb-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={stopImpersonating}
                    className="w-full h-7 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600 hover:text-blue-700 transition-colors"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right">{organizationName} — Exit</TooltipContent>
              </Tooltip>
            </div>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-1.5 py-2">
          <div className="space-y-0.5">
            {showPlatformOnly && PLATFORM_SIDEBAR_ITEMS.map((item) => {
              const active = item.exact
                ? pathname === item.href
                : pathname === item.href || pathname.startsWith(item.href + '/');
              return (
                <SidebarItem
                  key={item.href}
                  label={item.label}
                  href={item.href}
                  icon={item.icon}
                  active={active}
                  collapsed={collapsed}
                  exact={item.exact}
                />
              );
            })}
            
            {showOrgSections && (
              <>
                {MAIN_ITEMS.map((item) => {
                  const active = item.exact
                    ? pathname === item.href
                    : pathname === item.href || pathname.startsWith(item.href + '/');
                  return (
                    <SidebarItem
                      key={item.href}
                      label={item.label}
                      href={item.href}
                      icon={item.icon}
                      active={active}
                      collapsed={collapsed}
                      exact={item.exact}
                    />
                  );
                })}

                {/* Separator */}
                <div className={collapsed ? 'mx-2 my-1 border-t border-border' : 'mt-3 mb-1 border-t border-border pt-2'} />

                {/* Settings button */}
                {collapsed ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => setOverlayView('settings')}
                        className={cn(
                          'flex w-full items-center justify-center gap-2.5 px-2.5 py-1.5 rounded-lg text-[13px] font-medium transition-all duration-150',
                          isConfigurationPath(pathname)
                            ? 'bg-blue-50 text-blue-700'
                            : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900',
                        )}
                      >
                        <Settings className="w-5 h-5 shrink-0" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="right" className="text-xs">Settings</TooltipContent>
                  </Tooltip>
                ) : (
                  <button
                    onClick={() => setOverlayView('settings')}
                    className={cn(
                      'flex w-full items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-[13px] font-medium transition-all duration-150',
                      isConfigurationPath(pathname)
                        ? 'bg-blue-50 text-blue-700'
                        : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900',
                    )}
                  >
                    <Settings className="h-[15px] w-[15px] shrink-0" />
                    <span className="flex-1 truncate text-left">Settings</span>
                  </button>
                )}

                {/* Admin button */}
                {collapsed ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => setOverlayView('admin')}
                        className={cn(
                          'flex w-full items-center justify-center gap-2.5 px-2.5 py-1.5 rounded-lg text-[13px] font-medium transition-all duration-150',
                          pathname.startsWith('/admin')
                            ? 'bg-blue-50 text-blue-700'
                            : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900',
                        )}
                      >
                        <Shield className="w-5 h-5 shrink-0" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="right" className="text-xs">Admin</TooltipContent>
                  </Tooltip>
                ) : (
                  <button
                    onClick={() => setOverlayView('admin')}
                    className={cn(
                      'flex w-full items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-[13px] font-medium transition-all duration-150',
                      pathname.startsWith('/admin')
                        ? 'bg-blue-50 text-blue-700'
                        : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900',
                    )}
                  >
                    <Shield className="h-[15px] w-[15px] shrink-0" />
                    <span className="flex-1 truncate text-left">Admin</span>
                  </button>
                )}
              </>
            )}
          </div>
        </nav>

        {/* Footer */}
        <div className="p-1.5 border-t border-border space-y-1">
          <div
            className={cn(
              'flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-gray-100 cursor-pointer transition-colors',
              collapsed && 'justify-center',
            )}
            onClick={handleSignOut}
            title="Sign out"
          >
            <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-[10px] font-bold shrink-0">
              {initials}
            </div>
            {!collapsed && (
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-gray-900 truncate">{displayName}</p>
                <p className="text-[10px] text-gray-400 flex items-center gap-1">
                  <LogOut className="h-2.5 w-2.5" /> Sign out
                </p>
              </div>
            )}
          </div>

          <button
            onClick={toggle}
            className={cn(
              'w-full flex items-center px-2.5 py-1.5 rounded-lg text-xs text-gray-400 hover:bg-gray-100 transition-colors',
              collapsed ? 'justify-center' : 'gap-2',
            )}
          >
            {collapsed ? (
              <ChevronRight className="h-3.5 w-3.5" />
            ) : (
              <>
                <ChevronLeft className="h-3.5 w-3.5" />
                <span>Collapse</span>
              </>
            )}
          </button>
        </div>
      </aside>

      {/* Overlay Sidebars */}
      <OverlaySidebar
        title="Settings"
        items={CONFIG_ITEMS}
        isOpen={overlayView === 'settings'}
        onClose={() => setOverlayView(null)}
        collapsed={collapsed}
      />
      <OverlaySidebar
        title="Admin"
        items={ADMIN_ITEMS}
        isOpen={overlayView === 'admin'}
        onClose={() => setOverlayView(null)}
        collapsed={collapsed}
      />
    </TooltipProvider>
  );
}
