import { ClientManagementService } from './client-management.service';

/** Contact events automations are triggered by, published through the outbox. */
function build(existing: Record<string, unknown> | null = null) {
  const published: Array<{ topic: string; data: Record<string, unknown> }> = [];
  const outbox = {
    publish: jest.fn(async (topic: string, data: Record<string, unknown>) => {
      published.push({ topic, data });
      return 'evt';
    }),
  };
  const stored: Record<string, unknown> = existing ?? {
    id: 'contact-1',
    organization_id: 'org-1',
    first_name: 'Ana',
    last_name: 'García',
    email: 'ana@example.com',
    phone: null,
    tags: ['lead'],
    custom_fields: {},
    ai_insights: {},
    channel_ids: {},
  };
  const stageQb = {
    innerJoin: () => stageQb,
    where: () => stageQb,
    orderBy: () => stageQb,
    addOrderBy: () => stageQb,
    select: () => stageQb,
    limit: () => stageQb,
    getRawOne: async () => ({ id: 'stage-new' }),
  };
  const lookupQb = {
    where: () => lookupQb,
    andWhere: () => lookupQb,
    orderBy: () => lookupQb,
    getOne: async () => existing,
  };
  const contactRepo = {
    findOne: jest.fn(async () => stored),
    create: jest.fn((v: Record<string, unknown>) => ({ ...v })),
    save: jest.fn(async (v: Record<string, unknown>) => ({ id: v.id ?? 'contact-new', ...v })),
    createQueryBuilder: jest.fn(() => lookupQb),
    manager: {
      query: jest.fn(async (_sql: string, params: unknown[]) => [
        { id: 'contact-phone', organization_id: params[0], first_name: params[1], phone: params[2], last_name: null, email: null },
      ]),
    },
  };
  const service = new ClientManagementService(
    contactRepo as never,
    { create: jest.fn((v: unknown) => v), save: jest.fn(async () => undefined) } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    { create: jest.fn((v: unknown) => v), save: jest.fn(async () => undefined) } as never,
    { createQueryBuilder: jest.fn(() => stageQb), findOne: jest.fn(async () => ({ id: 'stage-b' })) } as never,
    {} as never,
    {} as never,
    { emit: jest.fn() } as never,
    undefined,
    undefined,
    outbox as never,
  );
  return { service, published, contactRepo };
}

const topics = (published: Array<{ topic: string }>) => published.map((p) => p.topic);

describe('contact events for automations', () => {
  it('publishes contact.created with who created it', async () => {
    const byPerson = build();
    await byPerson.service.create('org-1', { first_name: 'Ana' } as never, 'user-1');
    expect(byPerson.published[0]).toEqual({
      topic: 'contact.created',
      data: expect.objectContaining({ organization_id: 'org-1', contact_id: 'contact-new', first_name: 'Ana', source: 'manual' }),
    });

    const byApi = build();
    await byApi.service.create('org-1', { first_name: 'Ana', tags: ['vip'] } as never);
    expect(byApi.published.map((p) => [p.topic, p.data.source, p.data.tag])).toEqual([
      ['contact.created', 'api', undefined],
      ['contact.tag.added', 'api', 'vip'],
    ]);
  });

  it('publishes contact.created when a first message creates the contact (non-phone channel)', async () => {
    const { service, published } = build(null);
    await service.findOrCreateByChannel('org-1', 'instagram', 'ig-123', 'ana.garcia');
    expect(published).toEqual([
      {
        topic: 'contact.created',
        data: expect.objectContaining({ organization_id: 'org-1', contact_id: 'contact-new', source: 'channel', channel: 'instagram' }),
      },
    ]);
  });

  it('publishes contact.created when a first message or call creates a phone contact', async () => {
    const { service, published } = build(null);
    await service.findOrCreateByChannel('org-1', 'whatsapp', '+5215550001', 'Ana');
    expect(published).toEqual([
      {
        topic: 'contact.created',
        data: expect.objectContaining({ contact_id: 'contact-phone', phone: '+5215550001', source: 'channel', channel: 'whatsapp' }),
      },
    ]);
  });

  it('publishes nothing when the contact already exists', async () => {
    const { service, published } = build({ id: 'contact-1', organization_id: 'org-1', first_name: 'Ana', channel_ids: { instagram: 'ig-123' } });
    await service.findOrCreateByChannel('org-1', 'instagram', 'ig-123', 'ana');
    expect(published).toEqual([]);
  });

  it('publishes one event per tag added or removed', async () => {
    const { service, published } = build();
    await service.addTag('contact-1', 'org-1', 'vip');
    await service.addTag('contact-1', 'org-1', 'lead'); // already there: nothing
    await service.removeTag('contact-1', 'org-1', 'lead', 'api');
    expect(published.map((p) => [p.topic, p.data.tag, p.data.source])).toEqual([
      ['contact.tag.added', 'vip', 'manual'],
      ['contact.tag.removed', 'lead', 'api'],
    ]);
  });

  it('publishes tag changes made through a contact update, with their source', async () => {
    const { service, published } = build();
    await service.update('contact-1', 'org-1', { tags: ['vip', 'opt-out'] } as never, 'ai');
    expect(topics(published)).toEqual(['contact.updated', 'contact.tag.added', 'contact.tag.added', 'contact.tag.removed']);
    expect(published.slice(1).map((p) => [p.data.tag, p.data.source])).toEqual([
      ['vip', 'ai'],
      ['opt-out', 'ai'],
      ['lead', 'ai'],
    ]);
  });

  it('publishes no tag event when an update does not touch tags', async () => {
    const { service, published } = build();
    await service.update('contact-1', 'org-1', { first_name: 'Anna' } as never);
    expect(topics(published)).toEqual(['contact.updated']);
  });

  it('publishes the opt-out tag when a contact opts out', async () => {
    const { service, published } = build();
    await service.optOut('contact-1', 'org-1');
    expect(published.map((p) => [p.topic, p.data.tag])).toEqual([['contact.tag.added', 'opt-out']]);
  });

  it('publishes stage changes through the outbox', async () => {
    const { service, published } = build({ id: 'contact-1', organization_id: 'org-1', first_name: 'Ana', lead_stage: 'stage-a' });
    await service.updateStage('contact-1', 'org-1', 'stage-b', 'user-1');
    expect(published).toEqual([
      {
        topic: 'contact.stage.changed',
        data: expect.objectContaining({ contact_id: 'contact-1', from_stage_id: 'stage-a', to_stage_id: 'stage-b' }),
      },
    ]);
  });
});
