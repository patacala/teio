import { SendMessageHandler } from './send-message.handler';
import { CallHandler } from './call.handler';

/** Follow-up steps without their own text send the English default, addressed to the contact ({{user_name}}). */
function conversation() {
  return {
    findOrCreateActiveConversation: jest.fn(async () => ({ conversation: { id: 'conv-1' } })),
    sendMessage: jest.fn(async (_id: string, _org: string, _msg: { content: string }) => undefined),
  };
}
const org = { id: 'org', name: 'Clínica Sol' } as never;
const contact = { id: 'c1', first_name: 'Ana', last_name: 'García', phone: null } as never;
const step = (extra: Record<string, unknown> = {}) =>
  ({ id: 's1', organization_id: 'org', message_content: null, ...extra }) as never;
const resolved = { channel: 'whatsapp', recipientId: '+1555' } as never;
const DEFAULT = "Hi Ana García, we're following up to see if there's anything we can help you with. - Clínica Sol";

describe('follow-up default text', () => {
  it('chat message step', async () => {
    const conv = conversation();
    await new SendMessageHandler(conv as never, {} as never).execute(step(), contact, resolved, org);
    expect(conv.sendMessage.mock.calls[0][2].content).toBe(DEFAULT);
  });

  it('chat message step keeps its own text', async () => {
    const conv = conversation();
    await new SendMessageHandler(conv as never, {} as never).execute(step({ message_content: 'Custom text' }), contact, resolved, org);
    expect(conv.sendMessage.mock.calls[0][2].content).toBe('Custom text');
  });

  it('call step degraded to a message (contact without phone)', async () => {
    const conv = conversation();
    await new CallHandler(conv as never, {} as never).execute(step(), contact, resolved, org);
    expect(conv.sendMessage.mock.calls[0][2].content).toBe(DEFAULT);
  });
});

describe('agenda follow-up on the email channel', () => {
  it('is sent as an email (it used to be saved to a conversation that is never dispatched)', async () => {
    const conv = conversation();
    const mail = { send: jest.fn(async (_m: { to: string; subject: string; html: string }) => undefined) };
    const result = await new SendMessageHandler(conv as never, mail as never).execute(
      step({ title: 'Checking in' }),
      contact,
      { channel: 'email', recipientId: 'ana@example.com' } as never,
      org,
    );
    expect(result).toEqual({ completed: true, channel: 'email' });
    expect(conv.sendMessage).not.toHaveBeenCalled();
    expect(mail.send.mock.calls[0][0]).toMatchObject({ to: 'ana@example.com', subject: 'Checking in' });
    expect(mail.send.mock.calls[0][0].html).toContain('Hi Ana García, we&#39;re following up');
  });
});
