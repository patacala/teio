'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useNotifications, type Notification } from '@/hooks/useNotifications';
import { Button } from '@/components/ui/button';
import { formatRelativeTime } from '@/lib/utils';
import { Bot, MessageSquare, Phone, Plug, Info, Calendar, User, Bell } from 'lucide-react';
import { cn } from '@/lib/utils';
import { playNotificationSound } from '@/lib/notification-sound';

const typeConfig: Record<Notification['type'], { icon: React.ReactNode; color: string }> = {
  message: {
    icon: <MessageSquare className="h-4 w-4" />,
    color: 'text-chart-cyan',
  },
  ai: {
    icon: <Bot className="h-4 w-4" />,
    color: 'text-accent',
  },
  voice: {
    icon: <Phone className="h-4 w-4" />,
    color: 'text-chart-purple',
  },
  appointment: {
    icon: <Calendar className="h-4 w-4" />,
    color: 'text-chart-yellow',
  },
  lead: {
    icon: <User className="h-4 w-4" />,
    color: 'text-chart-pink',
  },
  integration: {
    icon: <Plug className="h-4 w-4" />,
    color: 'text-secondary',
  },
  system: {
    icon: <Info className="h-4 w-4" />,
    color: 'text-muted',
  },
};

export function NotificationDropdown() {
  const { notifications, markRead, markAllRead } = useNotifications();
  const router = useRouter();
  const [permission, setPermission] = useState<NotificationPermission | null>(null);

  useEffect(() => {
    if (typeof Notification === 'undefined') {
      setPermission('denied');
      return;
    }
    setPermission(Notification.permission);
  }, []);

  const requestBrowserPermission = async () => {
    if (typeof Notification === 'undefined') return;
    playNotificationSound();
    const result = await Notification.requestPermission();
    setPermission(result);
  };

  const openNotification = (n: Notification) => {
    markRead(n.id);
    if (n.href) router.push(n.href);
  };

  return (
    <div className="w-80 max-h-[480px] flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-subtle">
        <h3 className="text-sm font-semibold text-primary">Notifications</h3>
        <Button variant="ghost" size="sm" onClick={markAllRead} className="text-xs">
          Mark all read
        </Button>
      </div>

      <div className="overflow-y-auto flex-1">
        {notifications.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted">
            No notifications
          </div>
        ) : (
          notifications.map((n) => {
            const config = typeConfig[n.type] ?? typeConfig.system;
            return (
              <button
                key={n.id}
                onClick={() => openNotification(n)}
                className={cn(
                  'w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-surface-hover transition-colors',
                  !n.read && 'bg-olive-dark/40',
                )}
              >
                <div className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-subtle bg-surface-raised', config.color)}>{config.icon}</div>
                <div className="flex-1 min-w-0">
                  <p
                    className={cn(
                      'text-sm leading-tight',
                      n.read
                        ? 'text-secondary'
                        : 'text-primary font-medium',
                    )}
                  >
                    {n.title}
                  </p>
                  {n.description && (
                    <p className="text-xs text-secondary mt-0.5 truncate">
                      {n.description}
                    </p>
                  )}
                  <p className="text-[11px] text-muted mt-1">
                    {formatRelativeTime(n.createdAt)}
                  </p>
                </div>
                {!n.read && (
                  <div className="mt-1.5 h-2 w-2 rounded-full bg-accent shrink-0" aria-hidden="true" />
                )}
              </button>
            );
          })
        )}
      </div>

      {permission !== null && permission !== 'granted' && (
        <div className="px-4 py-3 border-t border-subtle space-y-2">
          {permission === 'denied' ? (
            <p className="text-xs text-muted">
              Browser notifications are blocked. Enable them in your site settings.
            </p>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="w-full text-xs"
              onClick={requestBrowserPermission}
            >
              <Bell className="h-3.5 w-3.5 mr-1.5" />
              Enable browser notifications
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
