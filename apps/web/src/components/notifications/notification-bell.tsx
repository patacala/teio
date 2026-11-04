'use client';

import { Bell } from 'lucide-react';
import { motion } from 'framer-motion';
import { useNotifications } from '@/hooks/useNotifications';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { NotificationDropdown } from './notification-dropdown';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function NotificationBell() {
  const { unreadCount } = useNotifications();
  const hasUnread = unreadCount > 0;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            'relative overflow-visible',
            hasUnread && 'text-primary',
          )}
          aria-label={
            hasUnread
              ? `${unreadCount} unread notification${unreadCount === 1 ? '' : 's'}`
              : 'Notifications'
          }
        >
          <motion.span
            className="inline-flex"
            style={{ originX: 0.5, originY: 0 }}
            animate={
              hasUnread
                ? { rotate: [0, 12, -10, 8, -5, 0] }
                : { rotate: 0 }
            }
            transition={
              hasUnread
                ? { duration: 0.9, repeat: Infinity, repeatDelay: 2, ease: 'easeInOut' }
                : { duration: 0.15 }
            }
          >
            <Bell className="h-[18px] w-[18px]" strokeWidth={1.9} />
          </motion.span>
          {hasUnread && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center">
              <span className="absolute inset-0 animate-notification-badge-pulse rounded-full bg-danger" />
              <span className="relative flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-0.5 text-[9px] font-bold leading-none text-app ring-2 ring-sidebar">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-0 w-80" align="end">
        <NotificationDropdown />
      </PopoverContent>
    </Popover>
  );
}
