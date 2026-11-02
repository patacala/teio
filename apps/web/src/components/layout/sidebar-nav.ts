import {
  Bot,
  FileText,
  Repeat,
  Zap,
  Plug,
  Mail,
  Wallet,
  BarChart,
  Users,
  CreditCard,
  Key,
} from 'lucide-react';
import type { SidebarNavItem } from './sidebar-section';

export const CONFIG_ITEMS: SidebarNavItem[] = [
  { label: 'AI Agent', href: '/config/agents', icon: Bot },
  { label: 'Sequences', href: '/config/sequences', icon: Repeat },
  { label: 'Templates', href: '/templates', icon: FileText },
  { label: 'Webhooks', href: '/config/webhooks', icon: Zap },
  { label: 'Channels', href: '/config/channels', icon: Plug },
  { label: 'Communications', href: '/config/communications', icon: Mail },
  { label: 'Payments', href: '/config/payments', icon: Wallet },
];

export const ADMIN_ITEMS: SidebarNavItem[] = [
  { label: 'Panel', href: '/admin', icon: BarChart, exact: true },
  { label: 'Team', href: '/admin/team', icon: Users },
  { label: 'Billing', href: '/admin/billing', icon: CreditCard },
  { label: 'API Keys', href: '/admin/api-keys', icon: Key },
];

export const CONFIGURATION_HREF = CONFIG_ITEMS[0]?.href ?? '/config/agents';

function itemMatchesPath(pathname: string, item: SidebarNavItem) {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(item.href + '/');
}

export function isConfigurationPath(pathname: string) {
  return [...CONFIG_ITEMS, ...ADMIN_ITEMS].some((item) => itemMatchesPath(pathname, item));
}
