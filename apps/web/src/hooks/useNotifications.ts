'use client';

import { useState, useCallback, useEffect } from 'react';

export type NotificationType =
  | 'message'
  | 'ai'
  | 'voice'
  | 'appointment'
  | 'lead'
  | 'integration'
  | 'system';

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  description?: string;
  href?: string;
  conversationId?: string;
  read: boolean;
  createdAt: Date;
}

const MAX_NOTIFICATIONS = 50;

let listeners: Array<(n: Notification[]) => void> = [];
let notificationStore: Notification[] = [];

function broadcast() {
  listeners.forEach((fn) => fn([...notificationStore]));
}

export type AddNotificationInput = Omit<Notification, 'id' | 'read' | 'createdAt'> & {
  id?: string;
  createdAt?: Date;
};

export function useNotifications() {
  const [notifications, setNotifications] = useState<Notification[]>(notificationStore);

  useEffect(() => {
    const fn = (n: Notification[]) => setNotifications(n);
    listeners.push(fn);
    return () => {
      listeners = listeners.filter((l) => l !== fn);
    };
  }, []);

  const add = useCallback((n: AddNotificationInput) => {
    if (n.id && notificationStore.some((x) => x.id === n.id)) return;
    const item: Notification = {
      ...n,
      id: n.id ?? Math.random().toString(36).slice(2),
      read: false,
      createdAt: n.createdAt ?? new Date(),
    };
    notificationStore = [item, ...notificationStore].slice(0, MAX_NOTIFICATIONS);
    broadcast();
  }, []);

  const markRead = useCallback((id: string) => {
    notificationStore = notificationStore.map((n) =>
      n.id === id ? { ...n, read: true } : n,
    );
    broadcast();
  }, []);

  const markAllRead = useCallback(() => {
    notificationStore = notificationStore.map((n) => ({ ...n, read: true }));
    broadcast();
  }, []);

  const unreadCount = notifications.filter((n) => !n.read).length;

  return { notifications, add, markRead, markAllRead, unreadCount };
}
