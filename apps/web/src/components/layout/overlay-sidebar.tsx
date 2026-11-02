'use client';

import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { SidebarItem } from './sidebar-item';
import { ArrowLeft } from 'lucide-react';
import type { SidebarNavItem } from './sidebar-section';

interface OverlaySidebarProps {
  title: string;
  items: SidebarNavItem[];
  isOpen: boolean;
  onClose: () => void;
  collapsed?: boolean;
}

export function OverlaySidebar({ title, items, isOpen, onClose, collapsed = false }: OverlaySidebarProps) {
  const pathname = usePathname();

  if (!isOpen) return null;

  return (
    <aside
      className={cn(
        'fixed top-0 left-0 bottom-0 z-50 border-r border-border bg-sidebar flex flex-col transition-all duration-200',
        collapsed ? 'w-[52px]' : 'w-[220px]',
      )}
    >
        {/* Header */}
        <div className="h-14 border-b border-border flex items-center px-3 shrink-0">
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-900 transition-colors mr-2"
            aria-label="Go back"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          {!collapsed && (
            <span className="font-bold text-gray-900 text-sm tracking-tight">
              {title}
            </span>
          )}
        </div>

        {/* Nav Items */}
        <nav className="flex-1 overflow-y-auto px-1.5 py-2">
          <div className="space-y-0.5">
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
        </nav>
    </aside>
  );
}
