'use client';

import Link from 'next/link';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { LucideIcon } from 'lucide-react';

export interface SidebarItemProps {
  label: string;
  href?: string;
  icon: LucideIcon;
  active: boolean;
  collapsed: boolean;
  exact?: boolean;
  onClick?: () => void;
}

export function SidebarItem({ label, href, icon: Icon, active, collapsed, onClick }: SidebarItemProps) {
  const className = cn(
    'flex h-10 items-center gap-3 rounded-control border text-[13px] font-medium transition-colors',
    collapsed ? 'mx-auto w-10 justify-center' : 'w-full px-3 text-left',
    active
      ? 'nav-item-active'
      : 'border-transparent text-secondary hover:bg-surface-hover hover:text-primary',
  );

  const content = (
    <>
      <Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.9} />
      {!collapsed && <span className="truncate">{label}</span>}
    </>
  );

  const control = href ? (
    <Link
      href={href}
      className={className}
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      aria-label={collapsed ? label : undefined}
    >
      {content}
    </Link>
  ) : (
    <button
      type="button"
      className={className}
      onClick={onClick}
      aria-label={collapsed ? label : undefined}
    >
      {content}
    </button>
  );

  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{control}</TooltipTrigger>
        <TooltipContent side="right">{label}</TooltipContent>
      </Tooltip>
    );
  }

  return control;
}
