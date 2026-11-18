import { ChannelsService } from './channels.service';

describe('ChannelsService Retell connection test (English messages)', () => {
  const fetchMock = jest.fn();
  const realFetch = global.fetch;
  beforeAll(() => { global.fetch = fetchMock as never; });
  afterAll(() => { global.fetch = realFetch; });
  beforeEach(() => fetchMock.mockReset());

  const testRetell = (cfg: Record<string, string>) =>
    (new ChannelsService({} as never, {} as never, {} as never) as unknown as {
      testRetell: (c: Record<string, string>) => Promise<{ success: boolean; message: string }>;
    }).testRetell(cfg);

  it('asks for the API key', async () => {
    expect(await testRetell({})).toEqual({ success: false, message: 'The Retell API key is missing' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('accepts the key but says an agent id is missing', async () => {
    fetchMock.mockResolvedValue({ ok: true });
    expect(await testRetell({ api_key: 'k' })).toEqual({
      success: true,
      message: 'Valid API key. The inbound or outbound agent id is missing.',
    });
  });

  it('names the agent Retell rejects', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 404 });
    expect(await testRetell({ api_key: 'k', inbound_agent_id: 'agent_in' })).toEqual({
      success: false,
      message: 'Agent agent_in: Retell returned 404',
    });
  });

  it('confirms every configured agent', async () => {
    fetchMock.mockResolvedValue({ ok: true });
    expect(await testRetell({ api_key: 'k', inbound_agent_id: 'a1', outbound_agent_id: 'a2' })).toEqual({
      success: true,
      message: 'Connection OK (a1, a2)',
    });
  });
});
