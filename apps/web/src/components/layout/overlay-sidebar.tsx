'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { SidebarItem } from './sidebar-item';
import { ArrowLeft } from 'lucide-react';
import type { SidebarNavItem } from './sidebar-section';

interface OverlaySidebarProps {
  title: string;
  items: SidebarNavItem[];
  isOpen: boolean;
  onClose: () => void;
}

export function OverlaySidebar({ title, items, isOpen, onClose }: OverlaySidebarProps) {
  const pathname = usePathname();

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <aside
      aria-label={title}
      className="shell-surface fixed bottom-3 left-3 top-3 z-50 hidden w-[232px] flex-col rounded-panel shadow-menu md:flex lg:bottom-4 lg:left-4 lg:top-4"
    >
      <div className="flex h-16 shrink-0 items-center gap-2 border-b border-subtle px-3">
        <button
          onClick={onClose}
          className="flex h-9 w-9 items-center justify-center rounded-control text-secondary transition-colors hover:bg-surface-hover hover:text-primary"
          aria-label="Go back"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <span className="text-sm font-semibold text-primary">{title}</span>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
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
              collapsed={false}
              exact={item.exact}
            />
          );
        })}
      </nav>
    </aside>
  );
}
