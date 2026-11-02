'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { funnelsService, type FunnelStage } from '@/services/funnels.service';

export function useFunnels() {
  return useQuery({
    queryKey: ['funnels'],
    queryFn: () => funnelsService.getFunnels(),
    staleTime: 5 * 60 * 1000,
  });
}

export function useCreateFunnel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string }) => funnelsService.createFunnel(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['funnels'] }),
  });
}

export function useFunnelStages(funnelId: string | null) {
  return useQuery({
    queryKey: ['funnel-stages', funnelId],
    queryFn: () => funnelsService.getFunnelStages(funnelId!),
    enabled: !!funnelId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useCreateFunnelStage(funnelId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<FunnelStage>) => funnelsService.createFunnelStage(funnelId, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['funnel-stages', funnelId] }),
  });
}

export function useUpdateFunnelStage(funnelId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ stageId, body }: { stageId: string; body: Partial<FunnelStage> }) =>
      funnelsService.updateFunnelStage(funnelId, stageId, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['funnel-stages', funnelId] }),
  });
}

export function useDeleteFunnelStage(funnelId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (stageId: string) => funnelsService.deleteFunnelStage(funnelId, stageId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['funnel-stages', funnelId] }),
  });
}

export function useReorderFunnelStages(funnelId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (orderedIds: string[]) => funnelsService.reorderFunnelStages(funnelId, orderedIds),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['funnel-stages', funnelId] }),
  });
}

export function useFunnelTemplates() {
  return useQuery({
    queryKey: ['funnel-templates'],
    queryFn: () => funnelsService.getFunnelTemplates(),
    staleTime: Infinity,
  });
}

export function useApplyFunnelTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (templateId: string) => funnelsService.applyFunnelTemplate(templateId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['funnels'] }),
  });
}

export function useUpdateContactStage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ contactId, stageId }: { contactId: string; stageId: string }) =>
      funnelsService.updateContactStage(contactId, stageId),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['contacts', variables.contactId] });
      qc.invalidateQueries({ queryKey: ['contacts'] });
    },
  });
}
