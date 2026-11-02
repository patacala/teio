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
    color: 'text-blue-500',
  },
  ai: {
    icon: <Bot className="h-4 w-4" />,
    color: 'text-accent-500',
  },
  voice: {
    icon: <Phone className="h-4 w-4" />,
    color: 'text-accent-500',
  },
  appointment: {
    icon: <Calendar className="h-4 w-4" />,
    color: 'text-blue-500',
  },
  lead: {
    icon: <User className="h-4 w-4" />,
    color: 'text-blue-500',
  },
  integration: {
    icon: <Plug className="h-4 w-4" />,
    color: 'text-highlight-500',
  },
  system: {
    icon: <Info className="h-4 w-4" />,
    color: 'text-gray-500',
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
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h3 className="text-sm font-semibold text-gray-900">Notifications</h3>
        <Button variant="ghost" size="sm" onClick={markAllRead} className="text-xs">
          Mark all read
        </Button>
      </div>

      <div className="overflow-y-auto flex-1">
        {notifications.length === 0 ? (
          <div className="py-8 text-center text-sm text-gray-500">
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
                  'w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors',
                  !n.read && 'bg-blue-50/50',
                )}
              >
                <div className={cn('mt-0.5 shrink-0', config.color)}>{config.icon}</div>
                <div className="flex-1 min-w-0">
                  <p
                    className={cn(
                      'text-sm leading-tight',
                      n.read
                        ? 'text-gray-600'
                        : 'text-gray-900 font-medium',
                    )}
                  >
                    {n.title}
                  </p>
                  {n.description && (
                    <p className="text-xs text-gray-500 mt-0.5 truncate">
                      {n.description}
                    </p>
                  )}
                  <p className="text-xs text-gray-400 mt-1">
                    {formatRelativeTime(n.createdAt)}
                  </p>
                </div>
                {!n.read && (
                  <div className="mt-1.5 h-2 w-2 rounded-full bg-blue-500 shrink-0" />
                )}
              </button>
            );
          })
        )}
      </div>

      {permission !== null && permission !== 'granted' && (
        <div className="px-4 py-3 border-t border-border space-y-2">
          {permission === 'denied' ? (
            <p className="text-xs text-gray-400">
              Avisos del navegador bloqueados. Actívalos desde la configuración del sitio.
            </p>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="w-full text-xs"
              onClick={requestBrowserPermission}
            >
              <Bell className="h-3.5 w-3.5 mr-1.5" />
              Activar avisos del navegador
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
