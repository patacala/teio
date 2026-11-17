import type { AutomationAgentEntity } from './entities/automation-agent.entity';

export type PublicAutomationAgent = Omit<AutomationAgentEntity, 'auth_header_value'> & {
  /** Whether an X-API-Key is configured. The key itself never leaves the server. */
  has_auth_header: boolean;
};

export function toPublicAutomationAgent(agent: AutomationAgentEntity): PublicAutomationAgent {
  const { auth_header_value, ...rest } = agent;
  return { ...rest, has_auth_header: !!auth_header_value };
}
