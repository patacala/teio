/// <reference types="jest" />
import { FindOperator } from 'typeorm';
import { FunnelRulesService } from './funnel-rules.service';
import type { ClientManagementService } from './client-management.service';
import type { FunnelStageEntity } from '../funnels/funnel-stage.entity';
import type { FunnelRuleEntity } from '../funnels/funnel-rule.entity';

const ORG = 'org-1';
const OTHER_ORG = 'org-2';
const FUNNEL = 'funnel-1';
const CONTACT = 'contact-1';

interface ContactState {
  id: string;
  organization_id: string;
  lead_stage: string | null;
  custom_fields: Record<string, unknown>;
}

function stage(
  id: string,
  position: number,
  stage_type: string,
  overrides: Partial<FunnelStageEntity> = {},
): FunnelStageEntity {
  return {
    id,
    organization_id: ORG,
    funnel_id: FUNNEL,
    name: id,
    position,
    stage_type,
    is_terminal: stage_type === 'won' || stage_type === 'lost',
    ...overrides,
  } as FunnelStageEntity;
}

function rule(overrides: Partial<FunnelRuleEntity>): FunnelRuleEntity {
  return {
    id: `rule-${overrides.name}`,
    organization_id: null,
    funnel_id: null,
    conditions: {},
    from_stage_types: [],
    direction_policy: 'forward_only',
    priority: 10,
    is_active: true,
    ...overrides,
  } as FunnelRuleEntity;
}

const SALES_STAGES = [
  stage('s-new', 0, 'new'),
  stage('s-contacted', 1, 'contacted'),
  stage('s-qualified', 2, 'qualified'),
  stage('s-scheduled', 3, 'appointment_scheduled'),
  stage('s-confirmed', 4, 'appointment_confirmed'),
  stage('s-lost', 5, 'lost'),
];

const DEFAULT_RULES = [
  rule({ name: 'Lead contacted', trigger_event: 'message.received', from_stage_types: ['new'], to_stage_type: 'contacted' }),
  rule({ name: 'Appointment scheduled', trigger_event: 'appointment.created', to_stage_type: 'appointment_scheduled' }),
  rule({ name: 'Appointment confirmed', trigger_event: 'appointment.confirmed', to_stage_type: 'appointment_confirmed' }),
  rule({
    name: 'Lead lost',
    trigger_event: 'sequence.exhausted',
    to_stage_type: 'lost',
    conditions: { event: { sequence_type: 'no_response' } },
  }),
];

/** Mirrors TypeORM: an `undefined` where-value means "no filter on that column". */
function matchesWhere(row: Record<string, unknown>, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([key, expected]) => {
    if (expected === undefined) return true;
    if (expected instanceof FindOperator) {
      if (expected.type === 'isNull') return row[key] === null || row[key] === undefined;
      throw new Error(`Unsupported operator ${expected.type}`);
    }
    return row[key] === expected;
  });
}

function buildHarness(options: { stages?: FunnelStageEntity[]; rules?: FunnelRuleEntity[]; startAt?: string } = {}) {
  const stages = options.stages ?? SALES_STAGES;
  const rules = options.rules ?? DEFAULT_RULES;
  const contact: ContactState = {
    id: CONTACT,
    organization_id: ORG,
    lead_stage: options.startAt ?? 's-new',
    custom_fields: {},
  };

  const contactRepo = {
    findOne: jest.fn(async ({ where }: { where: Record<string, unknown> }) =>
      matchesWhere(contact as unknown as Record<string, unknown>, where) ? { ...contact } : null,
    ),
  };
  const stageRepo = {
    findOne: jest.fn(
      async ({ where, order }: { where: Record<string, unknown>; order?: { position?: 'ASC' | 'DESC' } }) => {
        const found = stages.filter((s) => matchesWhere(s as unknown as Record<string, unknown>, where));
        if (order?.position) {
          found.sort((a, b) => (order.position === 'ASC' ? a.position - b.position : b.position - a.position));
        }
        return found[0] ?? null;
      },
    ),
  };
  const ruleRepo = {
    find: jest.fn(async ({ where }: { where: Record<string, unknown>[] }) =>
      rules
        .filter((r) => where.some((w) => matchesWhere(r as unknown as Record<string, unknown>, w)))
        .sort((a, b) => b.priority - a.priority),
    ),
  };
  const clientService = {
    moveStageIfUnchanged: jest.fn(
      async (id: string, orgId: string, expectedStageId: string, stageId: string, _reason: string) => {
        if (id !== contact.id || orgId !== contact.organization_id) return false;
        if (contact.lead_stage !== expectedStageId) return false;
        contact.lead_stage = stageId;
        return true;
      },
    ),
  };

  const service = new FunnelRulesService(
    contactRepo as never,
    stageRepo as never,
    ruleRepo as never,
    clientService as unknown as ClientManagementService,
  );
  return { service, contact, contactRepo, stageRepo, ruleRepo, clientService };
}

describe('FunnelRulesService.evaluate', () => {
  it('moves the contact to the rule target and records the rule name as the reason', async () => {
    const h = buildHarness();

    await h.service.evaluate(ORG, CONTACT, 'message.received');

    expect(h.contact.lead_stage).toBe('s-contacted');
    expect(h.clientService.moveStageIfUnchanged).toHaveBeenCalledWith(
      CONTACT, ORG, 's-new', 's-contacted', 'Lead contacted',
    );
  });

  it('does not hold back automation after a recent manual move (no anti-override window)', async () => {
    const h = buildHarness({ startAt: 's-qualified' });

    await h.service.evaluate(ORG, CONTACT, 'appointment.confirmed');

    expect(h.contact.lead_stage).toBe('s-confirmed');
  });

  describe('sequence.exhausted → Lost', () => {
    it.each(['appointment_reminder', 'post_service', 'reactivation', 'manual'])(
      'ignores a finished %s sequence',
      async (sequenceType) => {
        const h = buildHarness({ startAt: 's-confirmed' });

        await h.service.evaluate(ORG, CONTACT, 'sequence.exhausted', { sequence_type: sequenceType });

        expect(h.contact.lead_stage).toBe('s-confirmed');
        expect(h.clientService.moveStageIfUnchanged).not.toHaveBeenCalled();
      },
    );

    it('marks the lead Lost when the no_response sequence is exhausted', async () => {
      const h = buildHarness({ startAt: 's-contacted' });

      await h.service.evaluate(ORG, CONTACT, 'sequence.exhausted', { sequence_type: 'no_response' });

      expect(h.contact.lead_stage).toBe('s-lost');
    });
  });

  it('never moves a contact out of a terminal stage', async () => {
    const h = buildHarness({ startAt: 's-lost' });

    await h.service.evaluate(ORG, CONTACT, 'appointment.confirmed');

    expect(h.contact.lead_stage).toBe('s-lost');
  });

  it('does not move backwards under forward_only', async () => {
    const h = buildHarness({ startAt: 's-confirmed' });

    await h.service.evaluate(ORG, CONTACT, 'appointment.created');

    expect(h.contact.lead_stage).toBe('s-confirmed');
  });

  it('still matches custom_fields conditions', async () => {
    const bant = rule({
      name: 'Qualified (BANT)',
      trigger_event: 'contact.data.captured',
      from_stage_types: ['new', 'contacted'],
      to_stage_type: 'qualified',
      conditions: { custom_fields: { has_budget: true, timeline: '*' } },
    });
    const h = buildHarness({ rules: [bant], startAt: 's-contacted' });

    h.contact.custom_fields = { has_budget: 'yes' };
    await h.service.evaluate(ORG, CONTACT, 'contact.data.captured');
    expect(h.contact.lead_stage).toBe('s-contacted');

    h.contact.custom_fields = { has_budget: 'yes', timeline: 'next month' };
    await h.service.evaluate(ORG, CONTACT, 'contact.data.captured');
    expect(h.contact.lead_stage).toBe('s-qualified');
  });

  it('picks the lowest-position stage when a funnel has duplicate stage types', async () => {
    const stages = [
      stage('s-new', 0, 'new'),
      stage('s-contacted', 1, 'contacted'),
      stage('s-interested', 3, 'qualified'),
      stage('s-qualified', 2, 'qualified'),
    ];
    const toQualified = rule({ name: 'Qualify', trigger_event: 'contact.data.captured', to_stage_type: 'qualified' });
    const h = buildHarness({ stages, rules: [toQualified], startAt: 's-contacted' });

    await h.service.evaluate(ORG, CONTACT, 'contact.data.captured');

    expect(h.contact.lead_stage).toBe('s-qualified');
  });

  describe('tenant isolation', () => {
    it('skips a current stage that has no funnel instead of searching every funnel', async () => {
      const stages = [
        stage('s-legacy', 0, 'new', { funnel_id: null }),
        stage('foreign-contacted', 1, 'contacted', { organization_id: OTHER_ORG, funnel_id: 'foreign-funnel' }),
      ];
      const h = buildHarness({ stages, startAt: 's-legacy' });

      await h.service.evaluate(ORG, CONTACT, 'message.received');

      expect(h.contact.lead_stage).toBe('s-legacy');
      expect(h.clientService.moveStageIfUnchanged).not.toHaveBeenCalled();
    });

    it('only resolves stages of the contact organization', async () => {
      const stages = [
        stage('foreign-new', 0, 'new', { organization_id: OTHER_ORG }),
        stage('foreign-contacted', 1, 'contacted', { organization_id: OTHER_ORG }),
      ];
      const h = buildHarness({ stages, startAt: 'foreign-new' });

      await h.service.evaluate(ORG, CONTACT, 'message.received');

      expect(h.contact.lead_stage).toBe('foreign-new');
      for (const [args] of h.stageRepo.findOne.mock.calls) {
        expect(args.where.organization_id).toBe(ORG);
      }
    });
  });

  describe('concurrent events for the same contact', () => {
    it('ends in Confirmed when created + confirmed are evaluated at the same time (paid booking)', async () => {
      const h = buildHarness({ startAt: 's-qualified' });

      // Both evaluations read "Qualified" before either writes; "confirmed" writes first.
      let reads = 0;
      let bothRead!: () => void;
      const bothReadPromise = new Promise<void>((resolve) => (bothRead = resolve));
      const originalFind = h.contactRepo.findOne.getMockImplementation()!;
      h.contactRepo.findOne.mockImplementation(async (args) => {
        const row = await originalFind(args);
        if (++reads === 2) bothRead();
        return row;
      });
      let confirmedWritten!: () => void;
      const confirmedWrittenPromise = new Promise<void>((resolve) => (confirmedWritten = resolve));
      const originalMove = h.clientService.moveStageIfUnchanged.getMockImplementation()!;
      h.clientService.moveStageIfUnchanged.mockImplementation(async (...args) => {
        await bothReadPromise;
        const isConfirmed = args[3] === 's-confirmed';
        if (!isConfirmed) await confirmedWrittenPromise;
        const moved = await originalMove(...args);
        if (isConfirmed) confirmedWritten();
        return moved;
      });

      await Promise.all([
        h.service.evaluate(ORG, CONTACT, 'appointment.created'),
        h.service.evaluate(ORG, CONTACT, 'appointment.confirmed'),
      ]);

      expect(h.contact.lead_stage).toBe('s-confirmed');
      const results = await Promise.all(
        h.clientService.moveStageIfUnchanged.mock.results.map((r) => r.value as Promise<boolean>),
      );
      expect(results).toEqual(expect.arrayContaining([true, false]));
    });

    it('re-evaluates on fresh state when the contact moved between read and write', async () => {
      const h = buildHarness({ startAt: 's-contacted' });
      const originalMove = h.clientService.moveStageIfUnchanged.getMockImplementation()!;
      h.clientService.moveStageIfUnchanged.mockImplementationOnce(async (...args) => {
        h.contact.lead_stage = 's-qualified'; // another event won the race
        return originalMove(...args);
      });

      await h.service.evaluate(ORG, CONTACT, 'sequence.exhausted', { sequence_type: 'no_response' });

      expect(h.contact.lead_stage).toBe('s-lost');
      expect(h.clientService.moveStageIfUnchanged).toHaveBeenLastCalledWith(
        CONTACT, ORG, 's-qualified', 's-lost', 'Lead lost',
      );
    });

    it('gives up quietly after repeated conflicts', async () => {
      const h = buildHarness();
      h.clientService.moveStageIfUnchanged.mockResolvedValue(false);

      await expect(h.service.evaluate(ORG, CONTACT, 'message.received')).resolves.toBeUndefined();

      expect(h.clientService.moveStageIfUnchanged).toHaveBeenCalledTimes(3);
    });
  });

  it('swallows errors so a bad rule never breaks event processing', async () => {
    const h = buildHarness();
    h.ruleRepo.find.mockRejectedValue(new Error('db down'));

    await expect(h.service.evaluate(ORG, CONTACT, 'message.received')).resolves.toBeUndefined();
    expect(h.contact.lead_stage).toBe('s-new');
  });
});
