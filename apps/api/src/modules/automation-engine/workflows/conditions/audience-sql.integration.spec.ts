/**
 * Runs against a real PostgreSQL built from packages/database/schemas:
 *   TEST_DATABASE_URL=postgres://... pnpm --filter @crm/api test audience-sql.integration
 * Skipped when TEST_DATABASE_URL is not set.
 *
 * The SQL contact filter and the in-memory evaluator must pick exactly the
 * same contacts: a step that messages "contacts tagged vip" and an if/else on
 * "contact has tag vip" can never disagree.
 */
import 'reflect-metadata';
import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import type { ConditionGroup, ConditionRule } from '@crm/shared';
import { compileAudience } from './audience-sql.compiler';
import { evaluateCondition } from './condition-evaluator';
import { contactView } from '../variables/contact-view';
import { ContactEntity } from '../../../client-management/contact.entity';

const url = process.env.TEST_DATABASE_URL;
const describeDb = url ? describe : describe.skip;

jest.setTimeout(60_000);

const NOW = new Date('2026-03-20T12:00:00Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();

interface Seed {
  first_name: string;
  last_name?: string | null;
  email?: string | null;
  phone?: string | null;
  tags?: string[];
  lead_score?: number;
  handled_by?: string;
  channel_ids?: Record<string, string>;
  custom_fields?: Record<string, unknown>;
  created_at?: string;
  last_contacted_at?: string | null;
}

const SEEDS: Seed[] = [
  {
    first_name: 'Ana',
    last_name: 'García',
    email: 'ana@example.com',
    phone: '+5215550001',
    tags: ['VIP', 'lead'],
    lead_score: 80,
    handled_by: 'ai',
    channel_ids: { whatsapp: '5215550001' },
    custom_fields: { budget: '5000', decision_maker: true, urgency_level: 'High', city: 'Monterrey' },
    created_at: daysAgo(40),
    last_contacted_at: daysAgo(2),
  },
  {
    first_name: 'Luis',
    email: 'luis@example.com',
    tags: ['customer'],
    lead_score: 20,
    handled_by: 'human',
    custom_fields: { budget: 900, decision_maker: 'yes', city: 'monterrey ' },
    created_at: daysAgo(5),
    last_contacted_at: daysAgo(45),
  },
  {
    first_name: 'Marta',
    phone: '+5215550003',
    tags: [],
    lead_score: 0,
    channel_ids: { instagram: 'ig-marta' },
    custom_fields: { decision_maker: false, budget: 'unknown' },
    created_at: daysAgo(100),
    last_contacted_at: null,
  },
  {
    first_name: 'Pedro',
    last_name: 'Núñez',
    tags: ['vip', 'opt-out'],
    lead_score: 60,
    channel_ids: { facebook: 'fb-1', whatsapp: '' },
    custom_fields: { decision_maker: 'no', notes: '100% interested_now' },
    created_at: daysAgo(1),
  },
  { first_name: 'Sin datos', created_at: daysAgo(10) },
];

const r = (field: string, operator: string, value?: unknown): ConditionRule => ({ field, operator, value }) as ConditionRule;
const only = (...rules: ConditionRule[]): ConditionGroup => ({ any: [{ all: rules }] });

const CASES: Array<[string, ConditionGroup]> = [
  ['empty filter', { any: [] }],
  ['tag vip (any case)', only(r('contact.tags', 'has_tag', 'vip'))],
  ['no tag vip', only(r('contact.tags', 'not_has_tag', 'vip'))],
  ['tags equals lead', only(r('contact.tags', 'equals', 'lead'))],
  ['tags any of', only(r('contact.tags', 'in', ['customer', 'opt-out']))],
  ['tags none of', only(r('contact.tags', 'not_in', 'customer, opt-out'))],
  ['no tags', only(r('contact.tags', 'is_empty'))],
  ['has tags', only(r('contact.tags', 'is_not_empty'))],
  ['first name is ana', only(r('contact.first_name', 'equals', 'ANA'))],
  ['first name is not ana', only(r('contact.first_name', 'not_equals', 'ana'))],
  ['last name empty', only(r('contact.last_name', 'is_empty'))],
  ['email contains example', only(r('contact.email', 'contains', 'EXAMPLE.com'))],
  ['email does not contain luis', only(r('contact.email', 'not_contains', 'luis'))],
  ['email starts with ana', only(r('contact.email', 'starts_with', 'Ana@'))],
  ['first name in list', only(r('contact.first_name', 'in', ['marta', 'pedro']))],
  ['phone present', only(r('contact.phone', 'is_not_empty'))],
  ['handled by ai', only(r('contact.handled_by', 'equals', 'ai'))],
  ['score >= 60', only(r('contact.lead_score', 'gte', 60))],
  ['score < 20', only(r('contact.lead_score', 'lt', 20))],
  ['score != 0', only(r('contact.lead_score', 'not_equals', 0))],
  ['created more than 30 days ago', only(r('contact.created_at', 'older_than_days', 30))],
  ['created within 7 days', only(r('contact.created_at', 'newer_than_days', 7))],
  ['last contacted more than 30 days ago', only(r('contact.last_contacted_at', 'older_than_days', 30))],
  ['never contacted', only(r('contact.last_contacted_at', 'is_empty'))],
  ['created before a date', only(r('contact.created_at', 'lt', daysAgo(20)))],
  ['reachable on whatsapp', only(r('contact.channels', 'equals', 'whatsapp'))],
  ['reachable by sms', only(r('contact.channels', 'equals', 'sms'))],
  ['reachable by email or instagram', only(r('contact.channels', 'in', ['email', 'instagram']))],
  ['not reachable by email', only(r('contact.channels', 'not_equals', 'email'))],
  ['unreachable', only(r('contact.channels', 'is_empty'))],
  ['custom budget = 5000', only(r('contact.custom.budget', 'equals', '5000'))],
  ['custom budget = 900 (number)', only(r('contact.custom.budget', 'equals', 900))],
  ['custom budget > 1000', only(r('contact.custom.budget', 'gt', 1000))],
  ['custom budget <= 900', only(r('contact.custom.budget', 'lte', 900))],
  ['custom decision maker (yes/true)', only(r('contact.custom.decision_maker', 'is_true'))],
  ['custom decision maker is not yes', only(r('contact.custom.decision_maker', 'is_false'))],
  ['custom decision maker equals yes', only(r('contact.custom.decision_maker', 'equals', 'yes'))],
  ['custom decision maker equals no', only(r('contact.custom.decision_maker', 'equals', 'no'))],
  ['custom decision maker equals true (boolean)', only(r('contact.custom.decision_maker', 'equals', true))],
  ['custom decision maker equals false (boolean)', only(r('contact.custom.decision_maker', 'equals', false))],
  ['custom city (case and spaces)', only(r('contact.custom.city', 'equals', 'Monterrey'))],
  ['custom urgency in', only(r('contact.custom.urgency_level', 'in', ['high', 'urgent']))],
  ['custom notes contain a LIKE wildcard literally', only(r('contact.custom.notes', 'contains', '100%'))],
  ['custom notes contain an underscore literally', only(r('contact.custom.notes', 'contains', 'd_n'))],
  ['custom missing is empty', only(r('contact.custom.nothing', 'is_empty'))],
  ['custom missing not equal', only(r('contact.custom.nothing', 'not_equals', 'x'))],
  [
    'OR of AND blocks',
    {
      any: [
        { all: [r('contact.tags', 'has_tag', 'vip'), r('contact.channels', 'equals', 'whatsapp')] },
        { all: [r('contact.lead_score', 'lt', 30), r('contact.email', 'is_not_empty')] },
      ],
    },
  ],
];

describeDb('contact filters: SQL and evaluator agree', () => {
  let ds: DataSource;
  const org = randomUUID();
  const views = new Map<string, ReturnType<typeof contactView>>();

  beforeAll(async () => {
    ds = new DataSource({ type: 'postgres', url, entities: [] });
    await ds.initialize();
    await ds.query(`INSERT INTO core.organizations (id, name, slug) VALUES ($1, 'Audience', $2)`, [org, `aud-${org}`]);
    for (const seed of SEEDS) {
      const id = randomUUID();
      await ds.query(
        `INSERT INTO clients.contacts (id, organization_id, first_name, last_name, email, phone, tags, lead_score,
           handled_by, channel_ids, custom_fields, created_at, last_contacted_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [
          id,
          org,
          seed.first_name,
          seed.last_name ?? null,
          seed.email ?? null,
          seed.phone ?? null,
          seed.tags ?? [],
          seed.lead_score ?? 0,
          seed.handled_by ?? 'ai',
          JSON.stringify(seed.channel_ids ?? {}),
          JSON.stringify(seed.custom_fields ?? {}),
          seed.created_at ?? NOW.toISOString(),
          seed.last_contacted_at ?? null,
        ],
      );
      const [row] = (await ds.query(`SELECT * FROM clients.contacts WHERE id = $1`, [id])) as ContactEntity[];
      views.set(id, contactView(row));
    }
  });

  afterAll(async () => {
    await ds?.destroy();
  });

  it.each(CASES)('%s', async (_name, group) => {
    const { sql, params } = compileAudience(group, NOW);
    const [query, values] = ds.driver.escapeQueryWithParameters(
      `SELECT c.id FROM clients.contacts c WHERE c.organization_id = :org AND ${sql} ORDER BY c.id`,
      { ...params, org },
      {},
    );
    const fromSql = ((await ds.query(query, values)) as Array<{ id: string }>).map((row) => row.id).sort();
    const fromEvaluator = [...views.entries()]
      .filter(([, contact]) => evaluateCondition(group, { contact }, NOW))
      .map(([id]) => id)
      .sort();
    expect(fromSql).toEqual(fromEvaluator);
  });

  it('the cases are not trivial: they select different sets of contacts', async () => {
    const sizes = new Set<number>();
    for (const [, group] of CASES) {
      sizes.add([...views.values()].filter((contact) => evaluateCondition(group, { contact }, NOW)).length);
    }
    expect(sizes.size).toBeGreaterThanOrEqual(4);
  });
});
