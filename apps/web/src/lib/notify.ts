import { toast } from '@/hooks/useToast';
import { playNotificationSound } from '@/lib/notification-sound';
import type { AddNotificationInput, NotificationType } from '@/hooks/useNotifications';
import type { RealtimeNotification } from '@/types/realtime.types';

const seenIds = new Set<string>();
const recentFingerprints = new Set<string>();

const KNOWN_TYPES = new Set<NotificationType>([
  'message',
  'ai',
  'voice',
  'appointment',
  'lead',
  'integration',
  'system',
]);

function normalizeType(type: RealtimeNotification['type']): NotificationType {
  if (type === 'call') return 'voice';
  if (KNOWN_TYPES.has(type as NotificationType)) return type as NotificationType;
  return 'system';
}

function isViewingConversation(conversationId?: string): boolean {
  if (!conversationId || typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('conversationId') === conversationId;
}

function showBrowserNotification(
  payload: RealtimeNotification,
  navigate: (href: string) => void,
) {
  try {
    console.log('[Browser Notification] Showing:', payload.title);
    const n = new Notification(payload.title, {
      body: payload.description,
      tag: payload.id,
      requireInteraction: false,
    });
    
    console.log('[Browser Notification] Created, waiting for display...');
    
    n.onshow = () => {
      console.log('[Browser Notification] ✓ Displayed successfully');
    };
    
    n.onerror = (error) => {
      console.error('[Browser Notification] ✗ Display error:', error);
    };
    
    n.onclick = () => {
      console.log('[Browser Notification] Clicked');
      window.focus();
      if (payload.href) navigate(payload.href);
      n.close();
    };
  } catch (error) {
    console.error('[Browser Notification] Error:', error);
  }
}

export function notifyFromRealtime(
  payload: RealtimeNotification,
  opts: {
    currentUserId?: string | null;
    add: (n: AddNotificationInput) => void;
    navigate: (href: string) => void;
  },
) {
  if (payload.id && seenIds.has(payload.id)) return;
  if (payload.id) seenIds.add(payload.id);
  if (payload.actorUserId && payload.actorUserId === opts.currentUserId) return;

  const fingerprint = `${payload.conversationId ?? ''}:${payload.description ?? payload.title}`;
  if (fingerprint !== ':' && recentFingerprints.has(fingerprint)) return;
  if (fingerprint !== ':') {
    recentFingerprints.add(fingerprint);
    setTimeout(() => recentFingerprints.delete(fingerprint), 12_000);
  }

  const type = normalizeType(payload.type);
  opts.add({
    id: payload.id,
    type,
    title: payload.title,
    description: payload.description,
    href: payload.href,
    conversationId: payload.conversationId,
  });

  if (isViewingConversation(payload.conversationId)) return;

  playNotificationSound();

  const hidden = typeof document !== 'undefined' && document.visibilityState === 'hidden';
  const canOs =
    hidden &&
    typeof Notification !== 'undefined' &&
    Notification.permission === 'granted';

  console.log('[notifyFromRealtime]', {
    title: payload.title,
    hidden,
    permission: typeof Notification !== 'undefined' ? Notification.permission : 'N/A',
    canOs,
    conversationId: payload.conversationId,
  });

  if (canOs) {
    showBrowserNotification(payload, opts.navigate);
    return;
  }

  toast({
    title: payload.title,
    description: payload.description,
    variant: type === 'ai' ? 'ai' : 'info',
    action: payload.href
      ? { label: 'Ver', onClick: () => opts.navigate(payload.href!) }
      : undefined,
  });
}
