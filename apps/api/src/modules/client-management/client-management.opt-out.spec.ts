import { ClientManagementService } from './client-management.service';

function buildService(opts: { tags?: string[]; stopped?: number }) {
  const contact = { id: 'contact-1', organization_id: 'org-1', tags: opts.tags ?? [] };
  const query = jest.fn(async () => Array.from({ length: opts.stopped ?? 0 }, (_, i) => ({ id: `run-${i}` })));
  const contactRepo = {
    findOne: jest.fn().mockResolvedValue(contact),
    save: jest.fn().mockImplementation((c) => Promise.resolve(c)),
    manager: { query },
  };
  const rmq = { emit: jest.fn() };

  const service = new ClientManagementService(
    contactRepo as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    rmq as never,
  );

  return { service, contactRepo, query, rmq };
}

describe('ClientManagementService.optOut', () => {
  it('tags the contact opt-out and stops its runs in automations that respect opt-outs', async () => {
    const { service, contactRepo, query, rmq } = buildService({ stopped: 2 });

    const result = await service.optOut('contact-1', 'org-1');

    expect(query).toHaveBeenCalledWith(expect.stringContaining("'respect_opt_out'"), ['org-1', 'contact-1']);
    expect(contactRepo.save).toHaveBeenCalledWith(expect.objectContaining({ tags: ['opt-out'] }));
    expect(rmq.emit).toHaveBeenCalledWith('contact.tag.added', expect.objectContaining({ tag: 'opt-out', source: 'manual' }));
    expect(result.automations_stopped).toBe(2);
    expect(result.contact.tags).toEqual(['opt-out']);
  });

  it('is idempotent — opting out twice never duplicates the tag', async () => {
    const { service, contactRepo } = buildService({ tags: ['opt-out'] });

    await service.optOut('contact-1', 'org-1');

    expect(contactRepo.save).not.toHaveBeenCalled();
  });

  it('reports who opted the contact out (e.g. the AI)', async () => {
    const { service, rmq } = buildService({});
    await service.optOut('contact-1', 'org-1', 'ai');
    expect(rmq.emit).toHaveBeenCalledWith('contact.tag.added', expect.objectContaining({ source: 'ai' }));
  });
});
