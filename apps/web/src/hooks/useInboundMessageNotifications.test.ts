import { act, renderHook, waitFor } from '@testing-library/react';
import type { User } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockApi } from '@/test/msw/api';
import { createQueryWrapper } from '@/test/query';
import { testSession } from '@/test/supabase';
import type { Conversation } from '@/services/conversations.service';
import { useInboundMessageNotifications } from './useInboundMessageNotifications';

const mocks = vi.hoisted(() => ({
  user: null as User | null,
  add: vi.fn(),
  notifyFromRealtime: vi.fn(),
  push: vi.fn(),
}));

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: mocks.user }) }));
vi.mock('@/hooks/useNotifications', () => ({ useNotifications: () => ({ add: mocks.add }) }));
vi.mock('@/lib/notify', () => ({ notifyFromRealtime: mocks.notifyFromRealtime }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }));

function conversation(
  id: string,
  overrides: Partial<Conversation> & { last?: Partial<NonNullable<Conversation['last_message']>> | null } = {},
): Conversation {
  const { last, ...rest } = overrides;
  return {
    id,
    status: 'open',
    channel: 'whatsapp',
    contact_id: `contact-${id}`,
    contact: { id: `contact-${id}`, first_name: 'Ana', last_name: 'Pérez' },
    unread_count: 0,
    created_at: '2026-03-15T10:00:00Z',
    updated_at: '2026-03-15T10:00:00Z',
    last_message:
      last === null
        ? undefined
        : { content: 'Hola', created_at: '2026-03-15T12:00:00Z', direction: 'inbound', ...last },
    ...rest,
  };
}

function serveConversations(items: Conversation[]) {
  return mockApi('get', '/conversations', {
    data: { items, meta: { total: items.length, page: 1, limit: 30, total_pages: 1 } },
  });
}

async function renderPrimed(initial: Conversation[]) {
  const requests = serveConversations(initial);
  mockApi('get', '/users/me', { data: { id: 'me', organization_id: 'org-1' } });
  const { queryClient, wrapper } = createQueryWrapper();
  const hook = renderHook(() => useInboundMessageNotifications(), { wrapper });
  await waitFor(() => expect(requests).toHaveLength(1));
  await waitFor(() => expect(queryClient.getQueryData(['current-user', 'me'])).toBeDefined());

  const poll = async (items: Conversation[]) => {
    const next = serveConversations(items);
    await act(async () => {
      await queryClient.refetchQueries({ queryKey: ['conversations', { forNotifications: true }] });
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(next).toHaveLength(1);
  };
  return { ...hook, requests, poll };
}

beforeEach(() => {
  mocks.user = testSession({ userId: 'me' }).user;
  mocks.add.mockReset();
  mocks.notifyFromRealtime.mockReset();
  mocks.push.mockReset();
});

describe('useInboundMessageNotifications', () => {
  it('polls the 30 most recent conversations once signed in', async () => {
    const { requests } = await renderPrimed([]);

    expect(requests[0].url.searchParams.get('limit')).toBe('30');
  });

  it('does not poll while signed out', async () => {
    mocks.user = null;
    const requests = serveConversations([]);
    const { wrapper } = createQueryWrapper();

    renderHook(() => useInboundMessageNotifications(), { wrapper });
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(requests).toHaveLength(0);
  });

  describe('first load', () => {
    it('adds one summary per conversation with unread messages, without alerting', async () => {
      await renderPrimed([
        conversation('c-1', { unread_count: 3, last: { content: 'Are you open on Sunday?' } }),
        conversation('c-2', { unread_count: 1, last: { content: 'Thanks!' } }),
        conversation('c-3', { unread_count: 0 }),
      ]);

      await waitFor(() => expect(mocks.add).toHaveBeenCalledTimes(2));
      expect(mocks.add).toHaveBeenCalledWith({
        id: 'unread:c-1',
        type: 'message',
        title: 'Messages from Ana Pérez',
        description: '3 unread · Are you open on Sunday?',
        href: '/inbox?conversationId=c-1',
        conversationId: 'c-1',
        createdAt: new Date('2026-03-15T12:00:00Z'),
      });
      expect(mocks.add).toHaveBeenCalledWith(expect.objectContaining({ id: 'unread:c-2', description: 'Thanks!' }));
      expect(mocks.notifyFromRealtime).not.toHaveBeenCalled();
    });

    it('falls back to a count and a generic title when data is missing', async () => {
      await renderPrimed([conversation('c-1', { unread_count: 2, contact: undefined, last: null })]);

      await waitFor(() => expect(mocks.add).toHaveBeenCalled());
      expect(mocks.add).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Unread messages', description: '2 unread', createdAt: undefined }),
      );
    });
  });

  describe('later polls', () => {
    it('alerts about an inbound message newer than the last one seen', async () => {
      const { poll } = await renderPrimed([conversation('c-1', { last: { created_at: '2026-03-15T12:00:00Z' } })]);

      await poll([conversation('c-1', { last: { created_at: '2026-03-15T12:05:00Z', content: 'Can I book for 5pm?' } })]);

      expect(mocks.notifyFromRealtime).toHaveBeenCalledTimes(1);
      const [payload, opts] = mocks.notifyFromRealtime.mock.calls[0];
      expect(payload).toEqual({
        id: 'c-1:2026-03-15T12:05:00Z',
        type: 'message',
        title: 'New message from Ana Pérez',
        description: 'Can I book for 5pm?',
        href: '/inbox?conversationId=c-1',
        conversationId: 'c-1',
        createdAt: '2026-03-15T12:05:00Z',
      });
      expect(opts.currentUserId).toBe('me');
      expect(opts.add).toBe(mocks.add);

      opts.navigate('/inbox?conversationId=c-1');
      expect(mocks.push).toHaveBeenCalledWith('/inbox?conversationId=c-1');
    });

    it('stays quiet when nothing new arrived', async () => {
      const initial = [conversation('c-1')];
      const { poll } = await renderPrimed(initial);

      await poll(initial);

      expect(mocks.notifyFromRealtime).not.toHaveBeenCalled();
    });

    it('does not alert about our own outbound replies', async () => {
      const { poll } = await renderPrimed([conversation('c-1')]);

      await poll([conversation('c-1', { last: { created_at: '2026-03-15T12:05:00Z', direction: 'outbound' } })]);

      expect(mocks.notifyFromRealtime).not.toHaveBeenCalled();
    });

    it('alerts about the first message of a conversation it had not seen yet', async () => {
      const { poll } = await renderPrimed([conversation('c-1')]);

      await poll([conversation('c-2', { last: { content: 'Hi, new lead here' } }), conversation('c-1')]);

      expect(mocks.notifyFromRealtime).toHaveBeenCalledTimes(1);
      expect(mocks.notifyFromRealtime.mock.calls[0][0]).toMatchObject({ conversationId: 'c-2' });
    });

    it('does not re-alert for the same message on the following poll', async () => {
      const { poll } = await renderPrimed([conversation('c-1')]);
      const newer = [conversation('c-1', { last: { created_at: '2026-03-15T12:05:00Z' } })];

      await poll(newer);
      await poll(newer);

      expect(mocks.notifyFromRealtime).toHaveBeenCalledTimes(1);
    });
  });
});
