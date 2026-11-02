import { authClient } from '@/lib/auth-client';

// Automation agents (ai_agents.agents table) — the webhook targets the
// agent_trigger queue actually calls (n8n workflows, or ProSales). Distinct
// from AIAgent (services/ai-agents.service.ts), which is the conversational
// config UI that today doesn't feed this runtime at all.
export interface AutomationAgent {
  id: string;
  organization_id: string;
  name: string;
  description?: string | null;
  trigger_event: string;
  workflow_endpoint: string;
  auth_header_value?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export const automationAgentsService = {
  getAutomationAgents: () => authClient.get<AutomationAgent[]>('/ai/agents'),

  updateAutomationAgent: (id: string, body: Partial<AutomationAgent>) =>
    authClient.patch<AutomationAgent>(`/ai/agents/${id}`, body),
};
