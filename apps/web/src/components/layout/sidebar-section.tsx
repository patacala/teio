'use client';

import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { SidebarItem } from './sidebar-item';
import type { LucideIcon } from 'lucide-react';

export interface SidebarNavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  exact?: boolean;
}

export interface SidebarSectionProps {
  title: string;
  items: SidebarNavItem[];
  collapsed: boolean;
}

export function SidebarSection({ title, items, collapsed }: SidebarSectionProps) {
  const pathname = usePathname();

  return (
    <div className="space-y-0.5">
      {!collapsed && title ? (
        <p className="px-2.5 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-widest text-gray-400 select-none">
          {title}
        </p>
      ) : null}
      {collapsed && (
        <div className="mx-2 my-1 border-t border-border" />
      )}
      {items.map((item) => {
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
    </div>
  );
}
