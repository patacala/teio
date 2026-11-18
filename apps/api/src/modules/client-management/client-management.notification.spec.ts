import { ClientManagementService } from './client-management.service';

/** A chainable query-builder stub whose terminal call resolves to `result`. */
function queryBuilder(result: unknown) {
  const qb: Record<string, unknown> = {};
  for (const m of ['innerJoin', 'where', 'andWhere', 'orderBy', 'addOrderBy', 'select', 'limit']) qb[m] = () => qb;
  qb.getRawOne = async () => result;
  return qb;
}

function build() {
  const contactRepo = { create: (x: object) => x, save: async (x: object) => ({ ...x, id: 'c-1' }) };
  const stageRepo = { createQueryBuilder: () => queryBuilder(null) };
  const realtime = { notifyOrg: jest.fn(async (_org: string, _n: Record<string, unknown>) => undefined) };
  const service = new ClientManagementService(
    contactRepo as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never,
    stageRepo as never, {} as never, {} as never, undefined, undefined, realtime as never,
  );
  return { service, realtime };
}

describe('ClientManagementService new-contact notification (English)', () => {
  it('names the contact', async () => {
    const { service, realtime } = build();
    await service.create('org', { first_name: 'Ana', last_name: 'García' } as never, 'u1');
    expect(realtime.notifyOrg).toHaveBeenCalledWith('org', expect.objectContaining({
      type: 'lead', title: 'New contact: Ana García', href: '/inbox?lead=c-1', contactId: 'c-1', actorUserId: 'u1',
    }));
  });

  it('just says "New contact" when there is no name', async () => {
    const { service, realtime } = build();
    await service.create('org', { first_name: '' } as never);
    expect(realtime.notifyOrg.mock.calls[0][1].title).toBe('New contact');
  });
});
