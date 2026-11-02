'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  aiAgentsService,
  type AgentType,
  type Identity,
  type Personality,
  type QualificationField,
  type Rule,
  type Strategy,
} from '@/services/ai-agents.service';

// --- ProSales-backed agent config (the real thing) ---

export function useProvisionAgent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (agentType: AgentType) => aiAgentsService.provisionAgent(agentType),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['agent-config'] }),
  });
}

export function useAgentConfig() {
  return useQuery({
    queryKey: ['agent-config'],
    queryFn: () => aiAgentsService.getConfig(),
  });
}

export function useConfigureFromBrief() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (brief: string) => aiAgentsService.configureFromBrief(brief),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['agent-config'] }),
  });
}

export function useUpdateIdentity() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: Identity) => aiAgentsService.updateIdentity(body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['agent-config'] }),
  });
}

export function useUpdatePersonality() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: Personality) => aiAgentsService.updatePersonality(body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['agent-config'] }),
  });
}

export function useUpdateRules() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: Rule[]) => aiAgentsService.updateRules(body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['agent-config'] }),
  });
}

export function useUpdateStrategies() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: Strategy[]) => aiAgentsService.updateStrategies(body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['agent-config'] }),
  });
}

export function useUpdateQualification() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: QualificationField[]) => aiAgentsService.updateQualification(body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['agent-config'] }),
  });
}

// Knowledge is managed entirely by useKnowledge.ts (KnowledgeTab) — see
// modules/knowledge/* on the backend for why it doesn't live here.

// --- Legacy (agents.ai_agents) — kept only for useCaptureFieldLabels below
// (contacts/Kanban field labeling). See ai-agents.service.ts note. ---

/**
 * Org-wide field_name → field_label map, merged across every legacy agent.
 * Capture fields are configured per-(legacy)-agent and there's no
 * funnel↔agent link, so this is the simplest way to label a contact's
 * custom_fields regardless of which agent captured them. First agent to
 * define a name wins on collision.
 */
export function useCaptureFieldLabels() {
  return useQuery({
    queryKey: ['capture-field-labels'],
    queryFn: async () => {
      const agents = await aiAgentsService.getAIAgents();
      const lists = await Promise.all(agents.map((a) => aiAgentsService.getCaptureFields(a.id)));
      const labels: Record<string, string> = {};
      for (const fields of lists) {
        for (const f of fields) {
          if (!(f.field_name in labels)) labels[f.field_name] = f.field_label;
        }
      }
      return labels;
    },
  });
}
