import {
  Bot,
  FileText,
  Workflow,
  Zap,
  Plug,
  Wallet,
  BarChart,
  Users,
  CreditCard,
  Key,
  LayoutDashboard,
  MessageSquare,
  Calendar,
  MonitorPlay,
  Gauge,
  Settings2,
} from 'lucide-react';
import type { Permissions } from '@/lib/permissions';
import type { SidebarNavItem } from './sidebar-section';

/** A nav entry, optionally restricted to users holding a permission. */
export interface NavItem extends SidebarNavItem {
  requires?: keyof Permissions;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

/** Daily work. Contacts, the funnel board and voice calls live inside the Inbox now. */
export const MAIN_ITEMS: NavItem[] = [
  { label: 'Dashboard', href: '/', icon: LayoutDashboard, exact: true },
  { label: 'Inbox', href: '/inbox', icon: MessageSquare },
  { label: 'Schedule', href: '/schedule', icon: Calendar },
  { label: 'Payments', href: '/payments', icon: Wallet },
];

/** Platform admins outside an organization. */
export const PLATFORM_ITEMS: NavItem[] = [
  { label: 'Dashboard', href: '/platform', icon: LayoutDashboard, exact: true },
  { label: 'Demos', href: '/admin/demo', icon: MonitorPlay },
  { label: 'Demo accounts', href: '/platform/demo-accounts', icon: Gauge },
];

/**
 * Configuration, grouped by purpose. Groups whose items are all hidden for
 * the user's role disappear entirely.
 */
export const SETTINGS_GROUPS: NavGroup[] = [
  {
    label: 'AI Agent',
    items: [{ label: 'AI Agent', href: '/config/agents', icon: Bot, requires: 'canManageConfiguration' }],
  },
  {
    label: 'Automation',
    items: [{ label: 'Automations', href: '/config/automations', icon: Workflow }],
  },
  {
    label: 'Messaging',
    items: [{ label: 'Quick replies', href: '/templates', icon: FileText }],
  },
  {
    label: 'Payments setup',
    items: [
      { label: 'Stripe & services', href: '/config/payments', icon: Settings2, requires: 'canManageConfiguration' },
    ],
  },
  {
    label: 'Connections',
    items: [
      { label: 'Channels', href: '/config/channels', icon: Plug, requires: 'canManageConfiguration' },
      { label: 'Webhooks', href: '/config/webhooks', icon: Zap, requires: 'canManageConfiguration' },
      { label: 'API keys', href: '/admin/api-keys', icon: Key, requires: 'canAccessAdmin' },
    ],
  },
];

export const ADMIN_ITEMS: NavItem[] = [
  { label: 'Panel', href: '/admin', icon: BarChart, exact: true, requires: 'canAccessAdmin' },
  { label: 'Team', href: '/admin/team', icon: Users, requires: 'canAccessAdmin' },
  { label: 'Billing', href: '/admin/billing', icon: CreditCard, requires: 'canAccessAdmin' },
];

export function isNavItemVisible(item: NavItem, permissions: Permissions): boolean {
  return !item.requires || permissions[item.requires] === true;
}

export function visibleItems(items: NavItem[], permissions: Permissions): NavItem[] {
  return items.filter((item) => isNavItemVisible(item, permissions));
}

export function visibleGroups(groups: NavGroup[], permissions: Permissions): NavGroup[] {
  return groups
    .map((group) => ({ ...group, items: visibleItems(group.items, permissions) }))
    .filter((group) => group.items.length > 0);
}

export const SETTINGS_ITEMS: NavItem[] = SETTINGS_GROUPS.flatMap((group) => group.items);

export function navItemMatchesPath(pathname: string, item: SidebarNavItem): boolean {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(item.href + '/');
}

export function isConfigurationPath(pathname: string): boolean {
  return SETTINGS_ITEMS.some((item) => navItemMatchesPath(pathname, item));
}

export function isAdminPath(pathname: string): boolean {
  return ADMIN_ITEMS.some((item) => navItemMatchesPath(pathname, item)) && !isConfigurationPath(pathname);
}
