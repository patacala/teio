import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RealtimeNotification } from '@/types/realtime.types';

const { toast, playNotificationSound } = vi.hoisted(() => ({
  toast: vi.fn(),
  playNotificationSound: vi.fn(),
}));

vi.mock('@/hooks/useToast', () => ({ toast }));
vi.mock('@/lib/notification-sound', () => ({ playNotificationSound }));

let notifyFromRealtime: typeof import('./notify').notifyFromRealtime;

function payload(overrides: Partial<RealtimeNotification> = {}): RealtimeNotification {
  return {
    id: 'n-1',
    type: 'message',
    title: 'New message',
    description: 'Hola!',
    href: '/inbox?conversationId=c-1',
    conversationId: 'c-1',
    createdAt: '2026-03-15T12:00:00Z',
    ...overrides,
  };
}

function setup(currentUserId: string | null = 'me') {
  const add = vi.fn();
  const navigate = vi.fn();
  const notify = (p: RealtimeNotification) => notifyFromRealtime(p, { currentUserId, add, navigate });
  return { add, navigate, notify };
}

function setVisibility(state: DocumentVisibilityState) {
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue(state);
}

class FakeNotification {
  static permission: NotificationPermission = 'granted';
  static instances: FakeNotification[] = [];
  onshow: (() => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  onclick: (() => void) | null = null;
  close = vi.fn();
  constructor(
    public title: string,
    public options: NotificationOptions,
  ) {
    FakeNotification.instances.push(this);
  }
}

beforeEach(async () => {
  vi.resetModules();
  toast.mockReset();
  playNotificationSound.mockReset();
  FakeNotification.instances = [];
  FakeNotification.permission = 'granted';
  vi.spyOn(console, 'log').mockImplementation(() => {});
  window.history.replaceState(null, '', '/');
  ({ notifyFromRealtime } = await import('./notify'));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('notifyFromRealtime', () => {
  it('stores the notification, plays a sound and shows an info toast with a View action', () => {
    const { add, navigate, notify } = setup();

    notify(payload());

    expect(add).toHaveBeenCalledWith({
      id: 'n-1',
      type: 'message',
      title: 'New message',
      description: 'Hola!',
      href: '/inbox?conversationId=c-1',
      conversationId: 'c-1',
    });
    expect(playNotificationSound).toHaveBeenCalledTimes(1);
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'New message', description: 'Hola!', variant: 'info' }),
    );

    toast.mock.calls[0][0].action.onClick();
    expect(navigate).toHaveBeenCalledWith('/inbox?conversationId=c-1');
  });

  it('omits the toast action when there is no href', () => {
    const { notify } = setup();

    notify(payload({ href: undefined }));

    expect(toast.mock.calls[0][0].action).toBeUndefined();
  });

  it.each([
    ['call', 'voice'],
    ['appointment', 'appointment'],
    ['something-new', 'system'],
  ] as const)('normalizes type "%s" to "%s"', (incoming, expected) => {
    const { add, notify } = setup();

    notify(payload({ type: incoming as RealtimeNotification['type'] }));

    expect(add).toHaveBeenCalledWith(expect.objectContaining({ type: expected }));
  });

  it('uses the ai toast variant for ai notifications', () => {
    const { notify } = setup();

    notify(payload({ type: 'ai' }));

    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'ai' }));
  });

  it('ignores a notification id it has already handled', () => {
    const { add, notify } = setup();

    notify(payload());
    notify(payload({ description: 'different text' }));

    expect(add).toHaveBeenCalledTimes(1);
  });

  it("ignores notifications caused by the current user's own actions", () => {
    const { add, notify } = setup('user-1');

    notify(payload({ actorUserId: 'user-1' }));

    expect(add).not.toHaveBeenCalled();
    expect(toast).not.toHaveBeenCalled();
  });

  it('drops a duplicate of the same conversation + text for 12 seconds', () => {
    vi.useFakeTimers();
    const { add, notify } = setup();

    notify(payload({ id: 'a' }));
    notify(payload({ id: 'b' }));
    expect(add).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(12_000);
    notify(payload({ id: 'c' }));
    expect(add).toHaveBeenCalledTimes(2);
  });

  it('stores but stays silent when the user is already viewing that conversation', () => {
    window.history.replaceState(null, '', '/inbox?conversationId=c-1');
    const { add, notify } = setup();

    notify(payload());

    expect(add).toHaveBeenCalledTimes(1);
    expect(playNotificationSound).not.toHaveBeenCalled();
    expect(toast).not.toHaveBeenCalled();
  });

  it('shows an OS notification instead of a toast when the tab is hidden and permission is granted', () => {
    vi.stubGlobal('Notification', FakeNotification);
    setVisibility('hidden');
    const focus = vi.spyOn(window, 'focus').mockImplementation(() => {});
    const { navigate, notify } = setup();

    notify(payload());

    expect(toast).not.toHaveBeenCalled();
    expect(FakeNotification.instances).toHaveLength(1);
    const osNotification = FakeNotification.instances[0];
    expect(osNotification.title).toBe('New message');
    expect(osNotification.options).toMatchObject({ body: 'Hola!', tag: 'n-1' });

    osNotification.onclick?.();
    expect(focus).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith('/inbox?conversationId=c-1');
    expect(osNotification.close).toHaveBeenCalled();
  });

  it('falls back to a toast when the tab is hidden but permission was not granted', () => {
    FakeNotification.permission = 'denied';
    vi.stubGlobal('Notification', FakeNotification);
    setVisibility('hidden');
    const { notify } = setup();

    notify(payload());

    expect(FakeNotification.instances).toHaveLength(0);
    expect(toast).toHaveBeenCalledTimes(1);
  });

  it('uses a toast while the tab is visible even with permission granted', () => {
    vi.stubGlobal('Notification', FakeNotification);
    setVisibility('visible');
    const { notify } = setup();

    notify(payload());

    expect(FakeNotification.instances).toHaveLength(0);
    expect(toast).toHaveBeenCalledTimes(1);
  });
});
