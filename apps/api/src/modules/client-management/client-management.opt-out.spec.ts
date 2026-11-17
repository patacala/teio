import { ClientManagementService } from './client-management.service';
import type { AutomationSequenceService } from '../automation-engine/automation-sequence.service';

function buildService(opts: { tags?: string[]; sequenceService?: AutomationSequenceService | undefined }) {
  const contact = { id: 'contact-1', organization_id: 'org-1', tags: opts.tags ?? [] };
  const contactRepo = {
    findOne: jest.fn().mockResolvedValue(contact),
    save: jest.fn().mockImplementation((c) => Promise.resolve(c)),
  };

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
    undefined,
    undefined,
    undefined,
    opts.sequenceService,
  );

  return { service, contactRepo };
}

describe('ClientManagementService.optOut', () => {
  it('tags the contact opt-out and cancels every active sequence', async () => {
    const cancelAllForContact = jest.fn().mockResolvedValue(2);
    const { service, contactRepo } = buildService({
      sequenceService: { cancelAllForContact } as unknown as AutomationSequenceService,
    });

    const result = await service.optOut('contact-1', 'org-1');

    expect(cancelAllForContact).toHaveBeenCalledWith('org-1', 'contact-1', 'opt_out');
    expect(contactRepo.save).toHaveBeenCalledWith(expect.objectContaining({ tags: ['opt-out'] }));
    expect(result.sequences_cancelled).toBe(2);
    expect(result.contact.tags).toEqual(['opt-out']);
  });

  it('is idempotent — opting out twice never duplicates the tag', async () => {
    const { service, contactRepo } = buildService({ tags: ['opt-out'] });

    await service.optOut('contact-1', 'org-1');

    expect(contactRepo.save).not.toHaveBeenCalled();
  });

  it('still tags the contact when no sequence service is wired up', async () => {
    const { service } = buildService({ sequenceService: undefined });

    const result = await service.optOut('contact-1', 'org-1');

    expect(result.sequences_cancelled).toBe(0);
    expect(result.contact.tags).toEqual(['opt-out']);
  });
});
