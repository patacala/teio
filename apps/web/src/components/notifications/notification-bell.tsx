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
            hasUnread && 'bg-blue-50 text-blue-600 hover:bg-blue-100 hover:text-blue-700',
          )}
          aria-label={
            hasUnread
              ? `${unreadCount} notificación${unreadCount === 1 ? '' : 'es'} sin leer`
              : 'Notificaciones'
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
            <Bell className={cn('h-4 w-4', hasUnread && 'fill-blue-600')} />
          </motion.span>
          {hasUnread && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center">
              <span className="absolute inset-0 animate-notification-badge-pulse rounded-full bg-red-400" />
              <span className="relative flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-0.5 text-[9px] font-bold leading-none text-white ring-2 ring-white">
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
