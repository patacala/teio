import { ConversationManagementService } from './conversation-management.service';
import { ConversationManagementController } from './conversation-management.controller';

/** Events automations are triggered by: published through the outbox, with who/what produced them. */
function build(existingConversation: Record<string, unknown> | null = null) {
  const published: Array<{ topic: string; data: Record<string, unknown> }> = [];
  const outbox = {
    publish: jest.fn(async (topic: string, data: Record<string, unknown>) => {
      published.push({ topic, data });
      return 'evt-1';
    }),
  };
  const rmqClient = { emit: jest.fn() };
  const conversation = {
    id: 'conv-1',
    organization_id: 'org-1',
    contact_id: 'contact-1',
    channel: 'whatsapp',
    status: 'open',
    bot_active: true,
  };
  const conversationRepo = {
    findOne: jest.fn(async () => existingConversation ?? conversation),
    create: jest.fn((v: Record<string, unknown>) => v),
    save: jest.fn(async (v: Record<string, unknown>) => ({ id: 'conv-new', ...v })),
    update: jest.fn(async () => undefined),
  };
  const messageRepo = {
    findOne: jest.fn(async () => null),
    create: jest.fn((v: Record<string, unknown>) => v),
    save: jest.fn(async (v: Record<string, unknown>) => ({ ...v, id: 'msg-1', sent_at: new Date('2026-03-20T14:05:00Z') })),
    update: jest.fn(async () => undefined),
  };
  const service = new ConversationManagementService(
    conversationRepo as never,
    messageRepo as never,
    rmqClient as never,
    {
      findByIds: jest.fn(async () => []),
      findOrCreateByChannel: jest.fn(async () => ({ id: 'contact-1', first_name: 'Ana', last_name: null })),
      updateLastContacted: jest.fn(async () => undefined),
    } as never,
    {
      findById: jest.fn(async () => ({ id: 'chan-1', organization_id: 'org-1', type: 'whatsapp', is_active: true, config: {} })),
      findByWidgetId: jest.fn(),
    } as never,
    undefined,
    undefined,
    undefined,
    outbox as never,
  );
  return { service, published, rmqClient, conversationRepo, messageRepo };
}

describe('conversation events for automations', () => {
  it('publishes a sent message with its sender, text and the automation run that sent it', async () => {
    const { service, published, rmqClient, messageRepo } = build();
    await service.sendMessage('conv-1', 'org-1', {
      content: 'Following up on your request',
      sender_type: 'automation',
      metadata: { automation_run_id: 'run-1' },
    });

    expect(messageRepo.create).toHaveBeenCalledWith(expect.objectContaining({ sender_type: 'automation' }));
    expect(published).toEqual([
      {
        topic: 'message.send',
        data: {
          message_id: 'msg-1',
          conversation_id: 'conv-1',
          organization_id: 'org-1',
          contact_id: 'contact-1',
          direction: 'outbound',
          channel: 'whatsapp',
          content: 'Following up on your request',
          sender_type: 'automation',
          automation_run_id: 'run-1',
        },
      },
    ]);
    expect(rmqClient.emit).not.toHaveBeenCalledWith('message.send', expect.anything());
  });

  it('reports a message without a sender as sent by a team member', async () => {
    const { service, published } = build();
    await service.sendMessage('conv-1', 'org-1', { content: 'Hi' });
    expect(published[0].data).toMatchObject({ sender_type: 'agent', automation_run_id: null });
  });

  it('publishes conversation.opened only when a conversation is created, with who opened it', async () => {
    const created = build();
    created.conversationRepo.findOne.mockResolvedValueOnce(null as never);
    await created.service.findOrCreateActiveConversation('org-1', 'contact-1', 'chan-1', 'instagram', 'contact');
    expect(created.published).toEqual([
      {
        topic: 'conversation.opened',
        data: { organization_id: 'org-1', conversation_id: 'conv-new', contact_id: 'contact-1', channel: 'instagram', opened_by: 'contact' },
      },
    ]);

    const existing = build();
    await existing.service.findOrCreateActiveConversation('org-1', 'contact-1', 'chan-1', 'whatsapp', 'contact');
    expect(existing.published).toEqual([]);
  });

  it('treats a conversation opened to send something as opened by the business', async () => {
    const { service, published, conversationRepo } = build();
    conversationRepo.findOne.mockResolvedValueOnce(null as never);
    await service.findOrCreateActiveConversation('org-1', 'contact-1', '', 'sms');
    expect(published[0].data).toMatchObject({ opened_by: 'business' });
  });

  it('publishes conversation.closed through the outbox when resolved', async () => {
    const { service, published } = build();
    await service.resolve('conv-1', 'org-1');
    expect(published).toEqual([
      {
        topic: 'conversation.closed',
        data: { organization_id: 'org-1', conversation_id: 'conv-1', contact_id: 'contact-1', channel: 'whatsapp' },
      },
    ]);
  });

  it('an inbound message opens its conversation as the contact and publishes message.received', async () => {
    const { service, published, conversationRepo } = build();
    conversationRepo.findOne.mockResolvedValueOnce(null as never);
    await service.ingestMessage({ channel_id: 'chan-1', content: 'hola', sender_identifier: '+15550000000' });
    expect(published.map((p) => p.topic)).toEqual(['conversation.opened', 'message.received']);
    expect(published[0].data).toMatchObject({ opened_by: 'contact' });
  });
});

describe('ConversationManagementController: who sent a message', () => {
  const call = async (role: string, body: Record<string, unknown>) => {
    const service = { sendMessage: jest.fn(async () => ({})) };
    const controller = new ConversationManagementController(service as never);
    await controller.sendMessage('conv-1', body as never, { organization_id: 'org-1', role, user_id: 'u-1' } as never);
    return (service.sendMessage.mock.calls[0] as unknown[])[2];
  };

  it('marks messages from the inbox as sent by a team member', async () => {
    expect(await call('agent', { content: 'Hi' })).toMatchObject({ content: 'Hi', sender_type: 'agent' });
  });

  it('marks messages from an API key as sent by an integration', async () => {
    expect(await call('api_key', { content: 'Hi' })).toMatchObject({ sender_type: 'api' });
  });

  it('never lets the request body choose the sender', async () => {
    expect(await call('agent', { content: 'Hi', sender_type: 'automation' })).toMatchObject({ sender_type: 'agent' });
  });
});
