import { ConversationManagementService } from './conversation-management.service';
import type { IngestMessageDto } from './ingest-message.dto';

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
  const clientService = {
    findOrCreateByChannel: jest.fn().mockResolvedValue({ id: 'contact-1', first_name: 'Ada', last_name: 'Lovelace' }),
    updateLastContacted: jest.fn().mockResolvedValue(undefined),
  };
  const channelsService = {
    findById: jest.fn().mockResolvedValue({ id: 'chan-1', organization_id: 'org-1', type: 'whatsapp', is_active: true, config: {} }),
    findByWidgetId: jest.fn(),
  };
  const agentQueue = { add: jest.fn().mockResolvedValue(undefined) };

  const service = new ConversationManagementService(
    conversationRepo as never,
    messageRepo as never,
    rmqClient as never,
    clientService as never,
    channelsService as never,
    undefined,
    agentQueue as never,
    undefined,
    undefined,
    undefined,
  );

  jest.spyOn(service, 'findOrCreateActiveConversation').mockResolvedValue({ conversation: conversation as never, created: true });

  return { service, agentQueue };
}

const dto: IngestMessageDto = {
  channel_id: 'chan-1',
  content: 'hola',
  sender_identifier: '+15550000000',
};

describe('ConversationManagementService.ingestMessage — human handoff guard', () => {
  it('enqueues the agent trigger while the AI owns the conversation', async () => {
    const { service, agentQueue } = buildService({ botActive: true });
    await service.ingestMessage(dto);
    expect(agentQueue.add).toHaveBeenCalledWith('trigger', expect.objectContaining({ event_type: 'message.received' }), expect.anything());
  });

  it('never enqueues the agent trigger once a human has taken the conversation over', async () => {
    const { service, agentQueue } = buildService({ botActive: false });
    await service.ingestMessage(dto);
    expect(agentQueue.add).not.toHaveBeenCalled();
  });
});
