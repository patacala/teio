import { describe, expect, it } from 'vitest';
import { reachableChannels } from './reachable-channels';

describe('reachableChannels', () => {
  it('is empty when the lead has no phone or channel identifiers', () => {
    expect(reachableChannels({ phone: undefined, channel_ids: undefined })).toEqual([]);
  });

  it('includes sms when the lead has a phone number', () => {
    expect(reachableChannels({ phone: '+15551234567', channel_ids: undefined })).toEqual(['sms']);
  });

  it('includes every channel the lead has an identifier for', () => {
    expect(
      reachableChannels({
        phone: '+15551234567',
        channel_ids: { whatsapp: 'wa-1', instagram: 'ig-1', facebook: 'fb-1' },
      }),
    ).toEqual(['sms', 'whatsapp', 'instagram', 'facebook']);
  });
});
