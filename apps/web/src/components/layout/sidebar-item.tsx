'use client';

import Link from 'next/link';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { LucideIcon } from 'lucide-react';

export interface SidebarItemProps {
  label: string;
  href: string;
  icon: LucideIcon;
  active: boolean;
  collapsed: boolean;
  exact?: boolean;
  onClick?: () => void;
}

export function SidebarItem({ label, href, icon: Icon, active, collapsed, onClick }: SidebarItemProps) {
  const link = (
    <Link
      href={href}
      className={cn(
        'flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-[13px] font-medium transition-all duration-150',
        collapsed ? 'justify-center' : '',
        active
          ? 'bg-blue-50 text-blue-700'
          : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900',
      )}
      onClick={onClick}
    >
      <Icon className={cn('shrink-0', collapsed ? 'w-5 h-5' : 'w-[15px] h-[15px]')} />
      {!collapsed && <span className="truncate">{label}</span>}
    </Link>
  );

  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{link}</TooltipTrigger>
        <TooltipContent side="right" className="text-xs">{label}</TooltipContent>
      </Tooltip>
    );
  }

  return link;
}
