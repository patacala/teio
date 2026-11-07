import { describe, expect, it } from 'vitest';
import { itCallsEndpoints, mockApi } from '@/test/msw/api';
import { aiAgentsService, type Identity, type QualificationField, type Rule } from './ai-agents.service';

const identity: Identity = {
  name: 'Sofía',
  description: 'Front desk assistant',
  communication_style: 'warm',
  compliance_notes: '',
  principles: ['Be honest'],
  beliefs: [],
  values: [],
  words_never_use: ['cheap'],
  words_prefer: [],
};

const rule: Rule = {
  rule_id: 'r-1',
  intent: 'pricing',
  action_type: 'send_price_list',
  action_params: {},
  priority: 1,
};

const field: QualificationField = {
  key: 'budget',
  label: 'Budget',
  type: 'number',
  options: [],
  ask_priority: 'early',
  required_for_scheduling: true,
  crm_field: 'custom_fields.budget',
  sticky: true,
  enabled: true,
  bant_dimension: 'budget',
};

describe('aiAgentsService', () => {
  itCallsEndpoints([
    {
      name: 'provisionAgent maps to agent_type',
      call: () => aiAgentsService.provisionAgent('customer_service'),
      method: 'post',
      path: '/ai-agents/config/provision',
      body: { agent_type: 'customer_service' },
    },
    { name: 'getConfig', call: () => aiAgentsService.getConfig(), method: 'get', path: '/ai-agents/config' },
    {
      name: 'configureFromBrief',
      call: () => aiAgentsService.configureFromBrief('We are a dental clinic in CDMX'),
      method: 'post',
      path: '/ai-agents/config/from-brief',
      body: { brief: 'We are a dental clinic in CDMX' },
    },
    {
      name: 'updateIdentity',
      call: () => aiAgentsService.updateIdentity(identity),
      method: 'put',
      path: '/ai-agents/config/identity',
      body: identity,
    },
    {
      name: 'updatePersonality',
      call: () =>
        aiAgentsService.updatePersonality({
          brand_traits: ['friendly'],
          brand_tone: 'casual',
          brand_instructions: [],
          voice_traits: [],
          voice_tone: 'calm',
          voice_instructions: [],
        }),
      method: 'put',
      path: '/ai-agents/config/personality',
      body: {
        brand_traits: ['friendly'],
        brand_tone: 'casual',
        brand_instructions: [],
        voice_traits: [],
        voice_tone: 'calm',
        voice_instructions: [],
      },
    },
    {
      name: 'updateRules sends the full list',
      call: () => aiAgentsService.updateRules([rule]),
      method: 'put',
      path: '/ai-agents/config/rules',
      body: [rule],
    },
    {
      name: 'updateStrategies',
      call: () => aiAgentsService.updateStrategies([]),
      method: 'put',
      path: '/ai-agents/config/strategies',
      body: [],
    },
    {
      name: 'updateQualification',
      call: () => aiAgentsService.updateQualification([field]),
      method: 'put',
      path: '/ai-agents/config/qualification',
      body: [field],
    },
    { name: 'getAIAgents', call: () => aiAgentsService.getAIAgents(), method: 'get', path: '/ai-agents' },
    { name: 'getAIAgent', call: () => aiAgentsService.getAIAgent('agent-1'), method: 'get', path: '/ai-agents/agent-1' },
    {
      name: 'getCaptureFields',
      call: () => aiAgentsService.getCaptureFields('agent-1'),
      method: 'get',
      path: '/ai-agents/agent-1/capture-fields',
    },
  ]);

  it('returns the generated config from a brief', async () => {
    const result = { identity, personality: null, rules: [rule], strategies: [] };
    mockApi('post', '/ai-agents/config/from-brief', { data: result });

    await expect(aiAgentsService.configureFromBrief('brief')).resolves.toEqual(result);
  });

  it('rejects when the agent backend is unavailable', async () => {
    mockApi('get', '/ai-agents/config', { status: 503, message: 'ProSales is unavailable' });

    await expect(aiAgentsService.getConfig()).rejects.toThrow('ProSales is unavailable');
  });
});
