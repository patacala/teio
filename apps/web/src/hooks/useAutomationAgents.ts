'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  automationAgentsService,
  type AutomationAgent,
} from '@/services/automation-agents.service';

export function useAutomationAgents() {
  return useQuery({
    queryKey: ['automation-agents'],
    queryFn: () => automationAgentsService.getAutomationAgents(),
  });
}

/**
 * Activate exactly one automation agent for a trigger event, deactivating
 * every other candidate for that same event — this is the "manual switch"
 * (ProSales vs n8n) for message.received: only one webhook target is ever
 * active per event, no automatic fallback.
 */
export function useSetActiveAutomationAgent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      activateId,
      allForEvent,
    }: {
      triggerEvent: string;
      activateId: string;
      allForEvent: AutomationAgent[];
    }) => {
      const others = allForEvent.filter((a) => a.id !== activateId && a.is_active);
      await Promise.all([
        automationAgentsService.updateAutomationAgent(activateId, { is_active: true }),
        ...others.map((a) =>
          automationAgentsService.updateAutomationAgent(a.id, { is_active: false })
        ),
      ]);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['automation-agents'] });
    },
  });
}
