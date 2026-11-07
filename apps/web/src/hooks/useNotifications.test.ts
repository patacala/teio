import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type NotificationsModule = typeof import('./useNotifications');
let useNotifications: NotificationsModule['useNotifications'];

beforeEach(async () => {
  vi.resetModules();
  ({ useNotifications } = await import('./useNotifications'));
});

describe('useNotifications', () => {
  it('adds unread notifications newest first', () => {
    const { result } = renderHook(() => useNotifications());

    act(() => result.current.add({ type: 'message', title: 'First' }));
    act(() => result.current.add({ type: 'lead', title: 'Second' }));

    expect(result.current.notifications.map((n) => n.title)).toEqual(['Second', 'First']);
    expect(result.current.notifications[0]).toMatchObject({ read: false, type: 'lead' });
    expect(result.current.notifications[0].id).toEqual(expect.any(String));
    expect(result.current.notifications[0].createdAt).toBeInstanceOf(Date);
    expect(result.current.unreadCount).toBe(2);
  });

  it('keeps an explicit id and createdAt', () => {
    const createdAt = new Date('2026-03-15T12:00:00Z');
    const { result } = renderHook(() => useNotifications());

    act(() => result.current.add({ id: 'n-1', type: 'system', title: 'Hi', createdAt }));

    expect(result.current.notifications[0]).toMatchObject({ id: 'n-1', createdAt });
  });

  it('ignores a notification whose id is already stored', () => {
    const { result } = renderHook(() => useNotifications());

    act(() => result.current.add({ id: 'n-1', type: 'message', title: 'Original' }));
    act(() => result.current.add({ id: 'n-1', type: 'message', title: 'Duplicate' }));

    expect(result.current.notifications).toHaveLength(1);
    expect(result.current.notifications[0].title).toBe('Original');
  });

  it('keeps only the 50 most recent notifications', () => {
    const { result } = renderHook(() => useNotifications());

    act(() => {
      for (let i = 1; i <= 55; i++) result.current.add({ type: 'message', title: `n${i}` });
    });

    expect(result.current.notifications).toHaveLength(50);
    expect(result.current.notifications[0].title).toBe('n55');
    expect(result.current.notifications.at(-1)?.title).toBe('n6');
  });

  it('marks one or all notifications as read', () => {
    const { result } = renderHook(() => useNotifications());
    act(() => {
      result.current.add({ id: 'a', type: 'message', title: 'A' });
      result.current.add({ id: 'b', type: 'message', title: 'B' });
      result.current.add({ id: 'c', type: 'message', title: 'C' });
    });

    act(() => result.current.markRead('b'));
    expect(result.current.unreadCount).toBe(2);
    expect(result.current.notifications.find((n) => n.id === 'b')?.read).toBe(true);

    act(() => result.current.markAllRead());
    expect(result.current.unreadCount).toBe(0);
  });

  it('shares one store between every component using the hook', () => {
    const bell = renderHook(() => useNotifications());
    const dropdown = renderHook(() => useNotifications());

    act(() => bell.result.current.add({ id: 'n-1', type: 'ai', title: 'AI replied' }));
    expect(dropdown.result.current.notifications.map((n) => n.id)).toEqual(['n-1']);

    act(() => dropdown.result.current.markRead('n-1'));
    expect(bell.result.current.unreadCount).toBe(0);
  });

  it('gives a newly mounted component the notifications added before it mounted', () => {
    const first = renderHook(() => useNotifications());
    act(() => first.result.current.add({ id: 'n-1', type: 'message', title: 'Earlier' }));

    const late = renderHook(() => useNotifications());

    expect(late.result.current.notifications.map((n) => n.id)).toEqual(['n-1']);
  });
});
