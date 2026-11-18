import { ConversationManagementService } from './conversation-management.service';
import type { IngestMessageDto } from './ingest-message.dto';

/**
 * Ingesting only records the message and publishes message.received. Whether
 * the AI answers (and whether a team member took over) is decided by the
 * organization's automations, started from that event.
 */
function buildService(opts: { botActive: boolean }) {
  const conversation = {
    id: 'conv-1',
    organization_id: 'org-1',
    contact_id: 'contact-1',
    channel: 'whatsapp',
    bot_active: opts.botActive,
  };

  const conversationRepo = {
    findOne: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockImplementation((v) => v),
    save: jest.fn().mockResolvedValue(conversation),
    update: jest.fn().mockResolvedValue(undefined),
  };
  const messageRepo = {
    findOne: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockImplementation((v) => v),
    save: jest.fn().mockResolvedValue({ id: 'msg-1', sent_at: new Date() }),
  };
  const rmqClient = { emit: jest.fn() };
  const published: Array<{ topic: string; data: Record<string, unknown> }> = [];
  const outbox = { publish: jest.fn(async (topic: string, data: Record<string, unknown>) => void published.push({ topic, data })) };
  const clientService = {
    findOrCreateByChannel: jest.fn().mockResolvedValue({ id: 'contact-1', first_name: 'Ada', last_name: 'Lovelace' }),
    updateLastContacted: jest.fn().mockResolvedValue(undefined),
  };
  const channelsService = {
    findById: jest.fn().mockResolvedValue({ id: 'chan-1', organization_id: 'org-1', type: 'whatsapp', is_active: true, config: {} }),
    findByWidgetId: jest.fn(),
  };

  const service = new ConversationManagementService(
    conversationRepo as never,
    messageRepo as never,
    rmqClient as never,
    clientService as never,
    channelsService as never,
    undefined,
    undefined,
    undefined,
    outbox as never,
  );

  jest.spyOn(service, 'findOrCreateActiveConversation').mockResolvedValue({ conversation: conversation as never, created: false });

  return { service, published, rmqClient };
}

const dto: IngestMessageDto = {
  channel_id: 'chan-1',
  content: 'hola',
  sender_identifier: '+15550000000',
};

describe('ConversationManagementService.ingestMessage', () => {
  it.each([true, false])('publishes message.received whoever answers the conversation (AI active: %s)', async (botActive) => {
    const { service, published } = buildService({ botActive });
    await service.ingestMessage(dto);
    expect(published).toEqual([
      {
        topic: 'message.received',
        data: expect.objectContaining({
          organization_id: 'org-1',
          conversation_id: 'conv-1',
          contact_id: 'contact-1',
          channel: 'whatsapp',
          message: expect.objectContaining({ content: 'hola', direction: 'inbound' }),
        }),
      },
    ]);
  });
});
