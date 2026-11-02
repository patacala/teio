import { authClient } from '@/lib/auth-client';

// --- ProSales-backed agent config (the real thing — one agent per org,
// proxied through apps/api/src/modules/ai-agents to ProSales' Management
// API). Shapes mirror ProSales' IdentityPayload/PersonalityPayload/
// RulePayload/StrategyPayload — see
// pro-cognitive-ai/src/prosales/api/v1/schemas/management.py.

export interface Identity {
  name: string;
  description: string;
  communication_style: string;
  compliance_notes: string;
  principles: string[];
  beliefs: string[];
  values: string[];
  words_never_use: string[];
  words_prefer: string[];
}

export interface Personality {
  brand_traits: string[];
  brand_tone: string;
  brand_instructions: string[];
  voice_traits: string[];
  voice_tone: string;
  voice_instructions: string[];
}

export interface Rule {
  rule_id: string;
  intent?: string | null;
  sentiment?: string | null;
  urgency?: string | null;
  action_type: string;
  action_params: Record<string, unknown>;
  priority: number;
}

export interface Tactic {
  name: string;
  prompt_instruction: string;
  position: number;
}

export interface Strategy {
  strategy_type: string;
  name: string;
  description: string;
  triggers: Record<string, unknown>[];
  priority: number;
  cooldown_seconds: number;
  tactics: Tactic[];
}

export interface KnowledgeDocument {
  id: string;
  title: string;
  category: string;
  created_at: string | null;
}

export type BantDimension = 'need' | 'budget' | 'authority' | 'timeline';

export interface QualificationField {
  key: string;
  label: string;
  type: 'text' | 'number' | 'email' | 'phone' | 'boolean' | 'enum' | 'date';
  options: string[];
  ask_priority: 'early' | 'normal';
  required_for_scheduling: boolean;
  crm_field: string;
  sticky: boolean;
  enabled: boolean;
  bant_dimension: BantDimension | null;
}

export interface AgentConfig {
  identity: Identity | null;
  personality: Personality | null;
  rules: Rule[];
  strategies: Strategy[];
  qualification: QualificationField[];
  knowledge: KnowledgeDocument[];
}

// What a pasted brief gets transformed into (persisted server-side; returned
// for a read-only summary). No knowledge — that's managed separately.
export interface BriefResult {
  identity: Identity;
  personality: Personality;
  rules: Rule[];
  strategies: Strategy[];
}

// --- Legacy (agents.ai_agents) — the OLD, disconnected config store (see
// CLAUDE.md / crm-integration-2026-09 memory). Kept only because
// useCaptureFieldLabels (contacts/Kanban field labeling) still reads it.
// Not shown in the /config/agents UI anymore.

export interface AIAgent {
  id: string;
  organization_id: string;
  name: string;
  description?: string;
  provider: string;
  model: string;
  system_prompt: string;
  temperature: number;
  max_tokens: number;
  status: 'active' | 'inactive';
  channels: string[];
  role: string;
  tone: string;
  welcome_message?: string;
  fallback_message?: string;
  apology_message?: string;
  transfer_keywords: string[];
  created_at: string;
  updated_at: string;
}

export interface CaptureField {
  id: string;
  agent_id: string;
  organization_id: string;
  field_name: string;
  field_label: string;
  field_type: string;
  required: boolean;
  position: number;
  created_at: string;
  updated_at: string;
}

// Agent types a user can pick when creating an agent. Must match ProSales'
// SELECTABLE_AGENT_TYPES (infrastructure/agent/templates.py).
export const AGENT_TYPES = [
  { value: 'sales', label: 'Sales' },
  { value: 'customer_service', label: 'Customer service' },
  { value: 'consulting', label: 'Consulting' },
  { value: 'technical_service', label: 'Technical service' },
  { value: 'receptionist', label: 'Receptionist' },
] as const;

export type AgentType = (typeof AGENT_TYPES)[number]['value'];

export const aiAgentsService = {
  // ProSales-backed config
  provisionAgent: (agentType: AgentType) =>
    authClient.post<{ agent_version_id: string }>('/ai-agents/config/provision', {
      agent_type: agentType,
    }),

  getConfig: () => authClient.get<AgentConfig>('/ai-agents/config'),

  // Paste a plain-language brief → ProSales generates & persists the whole
  // config and returns it. Lets a non-technical user skip the expert forms.
  configureFromBrief: (brief: string) =>
    authClient.post<BriefResult>('/ai-agents/config/from-brief', { brief }),

  updateIdentity: (body: Identity) =>
    authClient.put<Identity>('/ai-agents/config/identity', body),

  updatePersonality: (body: Personality) =>
    authClient.put<Personality>('/ai-agents/config/personality', body),

  updateRules: (body: Rule[]) => authClient.put<Rule[]>('/ai-agents/config/rules', body),

  updateStrategies: (body: Strategy[]) =>
    authClient.put<Strategy[]>('/ai-agents/config/strategies', body),

  updateQualification: (body: QualificationField[]) =>
    authClient.put<QualificationField[]>('/ai-agents/config/qualification', body),

  // Knowledge is managed via services/knowledge.service.ts (KnowledgeTab),
  // not here — see modules/knowledge/* on the backend for why.

  // Legacy — see note above
  getAIAgents: () => authClient.get<AIAgent[]>('/ai-agents'),

  getAIAgent: (id: string) => authClient.get<AIAgent>(`/ai-agents/${id}`),

  getCaptureFields: (agentId: string) =>
    authClient.get<CaptureField[]>(`/ai-agents/${agentId}/capture-fields`),
};
