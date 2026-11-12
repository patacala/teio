import type { Funnel, FunnelStage, FunnelTemplate } from '@/services/funnels.service';
import type { Contact } from '@/services/contacts.service';
import { ORG_ID } from './api-mock';

export interface FunnelScenario {
  funnels: Funnel[];
  stages: FunnelStage[];
  contacts: Contact[];
  templates?: FunnelTemplate[];
}

const FUNNEL_ID = 'funnel-sales';
const CREATED = '2026-05-01T09:00:00.000Z';

/** Stage colors are the legacy hex values real funnels still store. */
const STAGES: FunnelStage[] = [
  ['stage-new', 'New Lead', '#3B82F6', 'new', false],
  ['stage-contacted', 'Contacted', '#8B5CF6', 'contacted', false],
  ['stage-qualified', 'Qualified', '#6366F1', 'qualified', false],
  ['stage-scheduled', 'Appointment Scheduled', '#F59E0B', 'appointment_scheduled', false],
  ['stage-confirmed', 'Appointment Confirmed', '#14B8A6', 'appointment_confirmed', false],
  ['stage-lost', 'Lost', '#EF4444', 'lost', true],
].map(([id, name, color, stage_type, is_terminal], position) => ({
  id: id as string,
  funnel_id: FUNNEL_ID,
  name: name as string,
  position,
  color: color as string,
  stage_type: stage_type as FunnelStage['stage_type'],
  is_terminal: is_terminal as boolean,
  rotting_days: null,
}));

function contact(id: string, stage: string, fields: Partial<Contact>): Contact {
  return {
    id,
    first_name: 'Contact',
    last_name: id,
    lead_stage: stage,
    lead_score: 20,
    handled_by: 'ai',
    tags: [],
    custom_fields: {},
    ai_insights: {},
    created_at: CREATED,
    updated_at: CREATED,
    ...fields,
  };
}

const CONTACTS: Contact[] = [
  contact('c-1', 'stage-new', {
    first_name: 'Maria', last_name: 'Gomez', phone: '+1 305 555 0101', lead_score: 10,
    last_contacted_at: '2026-06-15T11:40:00.000Z',
  }),
  contact('c-2', 'stage-new', {
    first_name: 'James', last_name: 'Carter', email: 'james@carter.test', lead_score: 0, handled_by: 'human',
  }),
  contact('c-3', 'stage-contacted', {
    first_name: 'Lucia', last_name: 'Fernandez', phone: '+1 305 555 0133', lead_score: 40,
    last_contacted_at: '2026-06-15T09:00:00.000Z',
    custom_fields: { service_needed: 'Dental cleaning', timeline: 'Next week' },
    tags: ['instagram'],
  }),
  contact('c-4', 'stage-qualified', {
    first_name: 'Daniel', last_name: 'Smith', phone: '+1 305 555 0144', email: 'daniel@smith.test', lead_score: 85,
    last_contacted_at: '2026-06-15T11:55:00.000Z',
    custom_fields: { service_needed: 'Implant consultation', has_budget: 'yes', timeline: 'This month' },
    ai_insights: { summary: 'Wants to book an implant consultation this week.', intent: 'Book appointment', sentiment: 'positive' },
    tags: ['referral', 'vip'],
  }),
  contact('c-5', 'stage-scheduled', {
    first_name: 'Sofia', last_name: 'Ruiz', phone: '+1 305 555 0155', lead_score: 60,
    last_contacted_at: '2026-06-14T16:00:00.000Z',
    custom_fields: { service_needed: 'Whitening' },
  }),
  contact('c-6', 'stage-lost', {
    first_name: 'Peter', last_name: 'Brown', phone: '+1 305 555 0166', lead_score: 5,
    last_contacted_at: '2026-06-01T10:00:00.000Z',
  }),
];

const TEMPLATES: FunnelTemplate[] = [
  {
    id: 'tpl-sales', name: 'Sales Pipeline', category: 'sales',
    description: 'Appointment-driven sales pipeline with automatic stage movement',
    stages: STAGES.map(({ id, name, position, color }) => ({ id: `t-${id}`, name, position, color })),
  },
  {
    id: 'tpl-generic', name: 'Generic Funnel', category: 'generic',
    description: 'Standard sales pipeline for any industry',
    stages: STAGES.slice(0, 3).map(({ id, name, position, color }) => ({ id: `g-${id}`, name, position, color })),
  },
];

export const SALES_FUNNEL: FunnelScenario = {
  funnels: [{ id: FUNNEL_ID, name: 'Sales Pipeline', organization_id: ORG_ID, created_at: CREATED, updated_at: CREATED }],
  stages: STAGES,
  contacts: CONTACTS,
};

export const NO_FUNNELS: FunnelScenario = { funnels: [], stages: [], contacts: [], templates: TEMPLATES };
