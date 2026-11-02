'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { automationService, type SequenceStepInput } from '@/services/automation.service';

const KEY = ['sequence-templates'];

export function useSequenceTemplates() {
  return useQuery({
    queryKey: KEY,
    queryFn: () => automationService.listTemplates(),
    staleTime: 30_000,
  });
}

export function useSequenceTemplate(id: string | null) {
  return useQuery({
    queryKey: [...KEY, id],
    queryFn: () => automationService.getTemplate(id!),
    enabled: !!id,
    staleTime: 30_000,
  });
}

export function useDuplicateTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name?: string }) =>
      automationService.duplicateTemplate(id, name),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useUpdateTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: { name?: string; description?: string; is_active?: boolean } }) =>
      automationService.updateTemplate(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useReplaceTemplateSteps() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, steps }: { id: string; steps: SequenceStepInput[] }) =>
      automationService.replaceTemplateSteps(id, steps),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useDeleteTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => automationService.deleteTemplate(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

/** Cloned steps of a running sequence — used by the contact follow-up card. */
export function useSequenceSteps(sequenceId: string | null) {
  return useQuery({
    queryKey: ['sequence-steps', sequenceId],
    queryFn: () => automationService.getSequenceSteps(sequenceId!),
    enabled: !!sequenceId,
    staleTime: 30_000,
  });
}
