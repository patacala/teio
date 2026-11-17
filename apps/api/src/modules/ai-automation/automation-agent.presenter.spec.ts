import { toPublicAutomationAgent } from './automation-agent.presenter';
import type { AutomationAgentEntity } from './entities/automation-agent.entity';

describe('toPublicAutomationAgent', () => {
  const base = {
    id: 'a1',
    organization_id: 'org',
    name: 'ProSales',
    trigger_event: 'message.received',
    workflow_endpoint: 'https://prosales.example/webhook',
    is_active: true,
  } as unknown as AutomationAgentEntity;

  it('never returns the X-API-Key, only whether one is set', () => {
    const out = toPublicAutomationAgent({ ...base, auth_header_value: 'secret-key' } as AutomationAgentEntity);
    expect(out).not.toHaveProperty('auth_header_value');
    expect(out.has_auth_header).toBe(true);
    expect(JSON.stringify(out)).not.toContain('secret-key');
  });

  it('reports has_auth_header=false when no key is configured', () => {
    expect(toPublicAutomationAgent({ ...base, auth_header_value: null } as AutomationAgentEntity).has_auth_header).toBe(false);
  });
});
