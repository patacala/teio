import { describe, expect, it } from 'vitest';
import { ChannelType } from '@crm/shared';
import { itCallsEndpoints, mockApi } from '@/test/msw/api';
import { channelsService, whatsappService } from './channels.service';

describe('channelsService', () => {
  itCallsEndpoints([
    { name: 'getChannels', call: () => channelsService.getChannels(), method: 'get', path: '/channels' },
    { name: 'getChannel', call: () => channelsService.getChannel('ch-1'), method: 'get', path: '/channels/ch-1' },
    {
      name: 'createChannel',
      call: () =>
        channelsService.createChannel({
          type: ChannelType.SMS,
          provider: 'twilio',
          external_identifier: '+15550100',
          config: { account_sid: 'AC123' },
        }),
      method: 'post',
      path: '/channels',
      body: { type: ChannelType.SMS, provider: 'twilio', external_identifier: '+15550100', config: { account_sid: 'AC123' } },
    },
    {
      name: 'updateChannel',
      call: () => channelsService.updateChannel('ch-1', { is_active: true }),
      method: 'patch',
      path: '/channels/ch-1',
      body: { is_active: true },
    },
    { name: 'deleteChannel', call: () => channelsService.deleteChannel('ch-1'), method: 'delete', path: '/channels/ch-1' },
    {
      name: 'deactivateChannel',
      call: () => channelsService.deactivateChannel('ch-1'),
      method: 'patch',
      path: '/channels/ch-1/deactivate',
      body: {},
    },
    {
      name: 'testChannelConnection',
      call: () => channelsService.testChannelConnection('ch-1'),
      method: 'post',
      path: '/channels/ch-1/test',
      body: {},
    },
  ]);

  it('returns the connection test result', async () => {
    mockApi('post', '/channels/ch-1/test', { data: { success: false, message: 'Invalid credentials' } });

    await expect(channelsService.testChannelConnection('ch-1')).resolves.toEqual({
      success: false,
      message: 'Invalid credentials',
    });
  });
});

describe('whatsappService', () => {
  itCallsEndpoints([
    {
      name: 'createSession with no label',
      call: () => whatsappService.createSession(),
      method: 'post',
      path: '/channels/whatsapp/sessions',
      body: {},
    },
    {
      name: 'createSession with a label',
      call: () => whatsappService.createSession({ label: 'Front desk' }),
      method: 'post',
      path: '/channels/whatsapp/sessions',
      body: { label: 'Front desk' },
    },
    { name: 'getStatus', call: () => whatsappService.getStatus('ch-1'), method: 'get', path: '/channels/whatsapp/ch-1/status' },
    { name: 'getQr', call: () => whatsappService.getQr('ch-1'), method: 'get', path: '/channels/whatsapp/ch-1/qr' },
    {
      name: 'requestPairingCode maps to phone_number',
      call: () => whatsappService.requestPairingCode('ch-1', '5215512345678'),
      method: 'post',
      path: '/channels/whatsapp/ch-1/pairing-code',
      body: { phone_number: '5215512345678' },
    },
    { name: 'relink', call: () => whatsappService.relink('ch-1'), method: 'post', path: '/channels/whatsapp/ch-1/relink', body: {} },
    { name: 'unlink', call: () => whatsappService.unlink('ch-1'), method: 'post', path: '/channels/whatsapp/ch-1/unlink', body: {} },
  ]);
});
