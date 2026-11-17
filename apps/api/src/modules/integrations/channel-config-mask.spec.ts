import { isSensitiveConfigKey, maskChannelConfig, MASKED_VALUE } from './channel-config-mask';

describe('maskChannelConfig', () => {
  it('masks every credential the channel integrations actually store', () => {
    const masked = maskChannelConfig({
      page_access_token: 'EAAG-real-token',
      app_secret: 'meta-app-secret',
      verify_token: 'hub-verify',
      api_key: 'telnyx-key',
      hmac_secret: 'retell-hmac',
      access_token: 'tok',
      auth_token: 'twilio-auth',
      password: 'pw',
    });
    for (const value of Object.values(masked)) expect(value).toBe(MASKED_VALUE);
  });

  it('keeps the non-secret fields the UI and webhooks rely on', () => {
    const config = {
      phone_number: '+34600000000',
      widget_id: 'w-1',
      agent_id: 'agent_1',
      inbound_agent_id: 'agent_in',
      account_sid: 'AC123',
      push_name: 'Clinic',
      messaging_profile_id: 'mp-1',
    };
    expect(maskChannelConfig(config)).toEqual(config);
  });

  it('leaves empty or non-string values untouched and never mutates the input', () => {
    const config = { api_key: '', page_access_token: null, nested: { token: 'x' } };
    const copy = JSON.parse(JSON.stringify(config));
    expect(maskChannelConfig(config)).toEqual(config);
    expect(config).toEqual(copy);
  });

  it('treats future *_token / *_secret keys as sensitive by default', () => {
    expect(isSensitiveConfigKey('refresh_token')).toBe(true);
    expect(isSensitiveConfigKey('client_secret')).toBe(true);
    expect(isSensitiveConfigKey('phone_number')).toBe(false);
  });

  it('handles a missing config', () => {
    expect(maskChannelConfig(undefined)).toEqual({});
  });
});
