import { ConfigService } from '@nestjs/config';
import { OutboundDispatchProcessor, type OutboundDispatchJobData } from './outbound-dispatch.processor';

function buildProcessor() {
  const qb = {
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    setParameter: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    execute: jest.fn().mockResolvedValue(undefined),
  };
  const messageRepo = { createQueryBuilder: jest.fn().mockReturnValue(qb) };

  const channelsService = { findActiveByType: jest.fn() };
  const clientService = { findById: jest.fn() };
  const smsService = { send: jest.fn() };
  const wahaService = { sendText: jest.fn() };

  const processor = new OutboundDispatchProcessor(
    new ConfigService(),
    channelsService as never,
    clientService as never,
    smsService as never,
    wahaService as never,
    messageRepo as never,
    {} as never,
  );

  return { processor, qb, channelsService, clientService, smsService, wahaService };
}

function job(data: Partial<OutboundDispatchJobData>) {
  return { data } as { data: OutboundDispatchJobData };
}

describe('OutboundDispatchProcessor — surfaces why a send never went out', () => {
  it('marks the message failed with a reason when the contact has no phone for SMS', async () => {
    const { processor, qb, channelsService, clientService } = buildProcessor();
    channelsService.findActiveByType.mockResolvedValue({ config: {} });
    clientService.findById.mockResolvedValue({ id: 'contact-1', phone: null });

    await (processor as unknown as { process: (j: ReturnType<typeof job>) => Promise<void> }).process(
      job({ channel: 'sms', organizationId: 'org', messageId: 'msg-1', content: 'hi', contactId: 'contact-1' }),
    );

    expect(qb.set).toHaveBeenCalledWith(expect.objectContaining({ status: 'failed' }));
    expect(qb.setParameter).toHaveBeenCalledWith(
      'patch',
      JSON.stringify({ failure_reason: 'Contact has no phone number' }),
    );
  });

  it('marks the message failed when the contact no longer exists', async () => {
    const { processor, qb, channelsService, clientService } = buildProcessor();
    channelsService.findActiveByType.mockResolvedValue(null);
    clientService.findById.mockResolvedValue(null);

    await (processor as unknown as { process: (j: ReturnType<typeof job>) => Promise<void> }).process(
      job({ channel: 'whatsapp', organizationId: 'org', messageId: 'msg-2', content: 'hi', contactId: 'gone' }),
    );

    expect(qb.setParameter).toHaveBeenCalledWith(
      'patch',
      JSON.stringify({ failure_reason: 'Contact no longer exists' }),
    );
  });

  it('marks the message failed when there is no active channel for the type', async () => {
    const { processor, qb, channelsService, clientService } = buildProcessor();
    channelsService.findActiveByType.mockResolvedValue(null);
    clientService.findById.mockResolvedValue({ id: 'contact-1' });

    await (processor as unknown as { process: (j: ReturnType<typeof job>) => Promise<void> }).process(
      job({ channel: 'facebook', organizationId: 'org', messageId: 'msg-3', content: 'hi', contactId: 'contact-1' }),
    );

    expect(qb.setParameter).toHaveBeenCalledWith(
      'patch',
      JSON.stringify({ failure_reason: 'No active facebook channel' }),
    );
  });
});
