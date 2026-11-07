import { describe } from 'vitest';
import { itCallsEndpoints } from '@/test/msw/api';
import { automationAgentsService } from './automation-agents.service';

describe('automationAgentsService', () => {
  itCallsEndpoints([
    {
      name: 'getAutomationAgents',
      call: () => automationAgentsService.getAutomationAgents(),
      method: 'get',
      path: '/ai/agents',
    },
    {
      name: 'updateAutomationAgent',
      call: () => automationAgentsService.updateAutomationAgent('agent-1', { is_active: false }),
      method: 'patch',
      path: '/ai/agents/agent-1',
      body: { is_active: false },
    },
  ]);
});
