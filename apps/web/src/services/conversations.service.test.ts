import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { API_BASE, itCallsEndpoints, mockApi } from '@/test/msw/api';
import { server } from '@/test/msw/server';
import { conversationsService } from './conversations.service';

describe('conversationsService', () => {
  itCallsEndpoints([
    { name: 'getConversations without params', call: () => conversationsService.getConversations(), method: 'get', path: '/conversations' },
    {
      name: 'getConversations with every filter',
      call: () =>
        conversationsService.getConversations({
          status: 'open',
          channel: 'whatsapp',
          page: 2,
          limit: 30,
          search: 'ana',
          assigned_to: 'human',
        }),
      method: 'get',
      path: '/conversations',
      query: { status: 'open', channel: 'whatsapp', page: '2', limit: '30', search: 'ana', assigned_to: 'human' },
    },
    { name: 'getConversation', call: () => conversationsService.getConversation('conv-1'), method: 'get', path: '/conversations/conv-1' },
    {
      name: 'getMessages loads the latest 100',
      call: () => conversationsService.getMessages('conv-1'),
      method: 'get',
      path: '/conversations/conv-1/messages',
      query: { limit: '100' },
    },
    {
      name: 'sendMessage',
      call: () => conversationsService.sendMessage('conv-1', { content: 'Hola!', type: 'text' }),
      method: 'post',
      path: '/conversations/conv-1/messages',
      body: { content: 'Hola!', type: 'text' },
    },
    {
      name: 'resolveConversation',
      call: () => conversationsService.resolveConversation('conv-1'),
      method: 'patch',
      path: '/conversations/conv-1/resolve',
      body: {},
    },
    { name: 'handoff', call: () => conversationsService.handoff('conv-1'), method: 'post', path: '/conversations/conv-1/handoff', body: {} },
    {
      name: 'setPinned',
      call: () => conversationsService.setPinned('conv-1', true),
      method: 'patch',
      path: '/conversations/conv-1/pin',
      body: { pinned: true },
    },
  ]);

  it('returns the created message', async () => {
    const message = {
      id: 'msg-1',
      conversation_id: 'conv-1',
      content: 'Hola!',
      direction: 'outbound',
      sender_type: 'agent',
      type: 'text',
      channel: 'whatsapp',
      created_at: '2026-03-15T12:00:00Z',
    };
    mockApi('post', '/conversations/conv-1/messages', { data: message });

    await expect(conversationsService.sendMessage('conv-1', { content: 'Hola!' })).resolves.toEqual(message);
  });

  it('rejects with the API message when sending fails', async () => {
    mockApi('post', '/conversations/conv-1/messages', { status: 422, message: '24h messaging window expired' });

    await expect(conversationsService.sendMessage('conv-1', { content: 'Hola!' })).rejects.toThrow(
      '24h messaging window expired',
    );
  });

  it('falls back to a generic message when the error body is not JSON', async () => {
    server.use(http.post(`${API_BASE}/conversations/conv-1/handoff`, () => new HttpResponse('<html>502</html>', { status: 502 })));

    await expect(conversationsService.handoff('conv-1')).rejects.toThrow('Request failed');
  });
});
