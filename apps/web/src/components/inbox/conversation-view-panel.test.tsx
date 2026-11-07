import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import type { ComponentType, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ActivityEvent } from '@/services/activity.service';
import { API_BASE, mockApi } from '@/test/msw/api';
import { server } from '@/test/msw/server';
import { createQueryWrapper } from '@/test/query';
import { createFakeRealtime } from '@/test/realtime';
import { ConversationViewPanel } from './conversation-view-panel';

const mocks = vi.hoisted(() => ({
  realtime: null as ReturnType<typeof import('@/test/realtime').createFakeRealtime> | null,
  toast: vi.fn(),
}));

vi.mock('@/providers/realtime-provider', () => ({
  useRealtime: () => ({ client: mocks.realtime!.client, activeCalls: new Map() }),
}));
vi.mock('@/hooks/useToast', () => ({ toast: mocks.toast }));

// jsdom has no layout, so the real virtualized list would render no rows.
vi.mock('react-virtuoso', () => ({
  Virtuoso: <T,>({
    data,
    itemContent,
    components,
  }: {
    data: T[];
    itemContent: (index: number, item: T) => ReactNode;
    components?: { Header?: ComponentType; Footer?: ComponentType };
  }) => {
    const { Header, Footer } = components ?? {};
    return (
      <div>
        {Header && <Header />}
        {data.map((item, index) => (
          <div key={index}>{itemContent(index, item)}</div>
        ))}
        {Footer && <Footer />}
      </div>
    );
  },
}));

type MessageEvent = Extract<ActivityEvent, { type: 'message' }>;

function message(id: string, content: string, direction: 'inbound' | 'outbound', minute: number): MessageEvent {
  return {
    type: 'message',
    id,
    content,
    direction,
    sender: direction === 'inbound' ? 'contact' : 'agent',
    sender_type: direction === 'inbound' ? 'customer' : 'agent',
    channel: 'whatsapp',
    timestamp: `2026-03-15T12:${String(minute).padStart(2, '0')}:00Z`,
  };
}

/** In-memory thread: reads come from contact activity, sends append to it. */
function serveConversation() {
  const thread: ActivityEvent[] = [
    message('m-1', 'Hola, ¿tienen citas esta semana?', 'inbound', 0),
    message('m-2', 'Sí, tenemos espacio el jueves.', 'outbound', 1),
  ];
  const sent: unknown[] = [];

  mockApi('get', '/conversations/conv-1', {
    data: {
      id: 'conv-1',
      status: 'open',
      channel: 'whatsapp',
      contact_id: 'contact-1',
      contact: { id: 'contact-1', first_name: 'Ana', last_name: 'Pérez' },
      unread_count: 0,
      created_at: '2026-03-15T12:00:00Z',
      updated_at: '2026-03-15T12:01:00Z',
    },
  });
  mockApi('get', '/templates', { data: [] });
  server.use(
    http.get(`${API_BASE}/contacts/contact-1/activity`, () =>
      HttpResponse.json({ data: { events: thread, next_cursor: null } }),
    ),
    http.post(`${API_BASE}/conversations/conv-1/messages`, async ({ request }) => {
      const body = (await request.json()) as { content: string };
      sent.push(body);
      const saved = message(`m-${thread.length + 1}`, body.content, 'outbound', thread.length);
      thread.push(saved);
      return HttpResponse.json({ data: { ...saved, conversation_id: 'conv-1' } });
    }),
  );
  return { thread, sent };
}

function renderPanel() {
  const { queryClient, wrapper } = createQueryWrapper();
  render(<ConversationViewPanel conversationId="conv-1" />, { wrapper });
  return { queryClient, user: userEvent.setup() };
}

const composer = () => screen.getByPlaceholderText('Type a message…');
const conversationChannel = () => mocks.realtime!.channel('conversation:conv-1');
const broadcastsSent = () => conversationChannel().send.mock.calls.map(([m]) => m.event);

beforeEach(() => {
  mocks.realtime = createFakeRealtime();
  mocks.toast.mockReset();
});

describe('ConversationViewPanel', () => {
  it('asks to pick a conversation when none is selected', () => {
    const { wrapper } = createQueryWrapper();
    render(<ConversationViewPanel conversationId={null} />, { wrapper });

    expect(screen.getByText('Select a conversation')).toBeInTheDocument();
  });

  it('shows the contact and the message thread', async () => {
    serveConversation();
    renderPanel();

    expect(await screen.findByText('Ana Pérez')).toBeInTheDocument();
    expect(await screen.findByText('Hola, ¿tienen citas esta semana?')).toBeInTheDocument();
    expect(screen.getByText('Sí, tenemos espacio el jueves.')).toBeInTheDocument();
  });

  describe('sending', () => {
    it('sends the draft with Enter and shows the saved message in the thread', async () => {
      const { sent } = serveConversation();
      const { user } = renderPanel();
      await screen.findByText('Hola, ¿tienen citas esta semana?');

      await user.type(composer(), 'Perfecto, te agendo el jueves a las 5pm');
      expect(broadcastsSent()).toContain('typing.started');

      await user.keyboard('{Enter}');

      expect(composer()).toHaveValue('');
      expect(await screen.findByText('Perfecto, te agendo el jueves a las 5pm')).toBeInTheDocument();
      expect(sent).toEqual([{ content: 'Perfecto, te agendo el jueves a las 5pm' }]);
      expect(broadcastsSent()).toContain('typing.stopped');
    });

    it('sends with the send button and trims the draft', async () => {
      const { sent } = serveConversation();
      const { user } = renderPanel();
      await screen.findByText('Ana Pérez');
      const sendButton = () => screen.getAllByRole('button').at(-1)!;

      expect(sendButton()).toBeDisabled();
      await user.type(composer(), '   ');
      expect(sendButton()).toBeDisabled();

      await user.type(composer(), 'Gracias!  ');
      await user.click(sendButton());

      await waitFor(() => expect(sent).toEqual([{ content: 'Gracias!' }]));
    });

    it('uses Shift+Enter for a new line instead of sending', async () => {
      const { sent } = serveConversation();
      const { user } = renderPanel();
      await screen.findByText('Ana Pérez');

      await user.type(composer(), 'Línea 1{Shift>}{Enter}{/Shift}Línea 2');

      expect(composer()).toHaveValue('Línea 1\nLínea 2');
      expect(sent).toEqual([]);
    });
  });

  describe('receiving', () => {
    it('shows a new inbound message when the thread refreshes', async () => {
      const { thread } = serveConversation();
      const { queryClient } = renderPanel();
      await screen.findByText('Hola, ¿tienen citas esta semana?');

      thread.push(message('m-3', '¿Puede ser a las 6pm?', 'inbound', 5));
      await act(() => queryClient.invalidateQueries({ queryKey: ['contact-activity'] }));

      expect(await screen.findByText('¿Puede ser a las 6pm?')).toBeInTheDocument();
    });

    it('streams an AI reply live and removes the draft bubble once complete', async () => {
      serveConversation();
      renderPanel();
      await screen.findByText('Hola, ¿tienen citas esta semana?');

      act(() =>
        conversationChannel().broadcast('ai.response.streaming', {
          messageId: 'ai-1',
          conversationId: 'conv-1',
          delta: 'Claro',
          content: 'Claro, el jueves',
          isComplete: false,
        }),
      );
      expect(await screen.findByText('Claro, el jueves')).toBeInTheDocument();

      act(() =>
        conversationChannel().broadcast('ai.response.streaming', {
          messageId: 'ai-1',
          conversationId: 'conv-1',
          delta: '',
          content: 'Claro, el jueves',
          isComplete: true,
        }),
      );
      await waitFor(() => expect(screen.queryByText('Claro, el jueves')).not.toBeInTheDocument());
    });

    it('shows who is typing on the other side', async () => {
      serveConversation();
      renderPanel();
      await screen.findByText('Ana Pérez');

      act(() =>
        conversationChannel().broadcast('typing.started', {
          userId: 'ai-agent',
          userName: 'AI',
          senderType: 'ai',
          conversationId: 'conv-1',
        }),
      );
      expect(await screen.findByText('AI is typing…')).toBeInTheDocument();

      act(() =>
        conversationChannel().broadcast('typing.stopped', {
          userId: 'ai-agent',
          userName: 'AI',
          senderType: 'ai',
          conversationId: 'conv-1',
        }),
      );
      await waitFor(() => expect(screen.queryByText('AI is typing…')).not.toBeInTheDocument());
    });
  });
});
