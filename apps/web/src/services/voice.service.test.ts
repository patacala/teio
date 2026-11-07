import { describe, expect, it } from 'vitest';
import { itCallsEndpoints, mockApi } from '@/test/msw/api';
import { voiceService } from './voice.service';

describe('voiceService', () => {
  itCallsEndpoints([
    { name: 'getStats', call: () => voiceService.getStats(), method: 'get', path: '/voice/calls/stats' },
    { name: 'getCalls without params', call: () => voiceService.getCalls(), method: 'get', path: '/voice/calls' },
    {
      name: 'getCalls keeps an offset of 0',
      call: () => voiceService.getCalls({ limit: 25, offset: 0 }),
      method: 'get',
      path: '/voice/calls',
      query: { limit: '25', offset: '0' },
    },
    { name: 'getCall', call: () => voiceService.getCall('call-1'), method: 'get', path: '/voice/calls/call-1' },
    {
      name: 'getTranscripts',
      call: () => voiceService.getTranscripts('call-1'),
      method: 'get',
      path: '/voice/calls/call-1/transcripts',
    },
    {
      name: 'respond maps to snake_case',
      call: () => voiceService.respond('call-1', 'One moment please'),
      method: 'post',
      path: '/voice/respond',
      body: { call_id: 'call-1', response_text: 'One moment please' },
    },
    {
      name: 'startCall for a contact',
      call: () => voiceService.startCall({ contact_id: 'contact-1' }),
      method: 'post',
      path: '/voice/calls',
      body: { contact_id: 'contact-1' },
    },
  ]);

  it('returns the call id and status of a started call', async () => {
    mockApi('post', '/voice/calls', { data: { call_id: 'call-9', status: 'initiated' } });

    await expect(voiceService.startCall({ to_number: '+15550100' })).resolves.toEqual({
      call_id: 'call-9',
      status: 'initiated',
    });
  });

  it('rejects when the call cannot be started', async () => {
    mockApi('post', '/voice/calls', { status: 502, message: 'Voice provider unavailable' });

    await expect(voiceService.startCall({ contact_id: 'contact-1' })).rejects.toThrow('Voice provider unavailable');
  });
});
