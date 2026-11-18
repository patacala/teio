'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AutomationDefinition, ConditionGroup } from '@crm/shared';
import { automationsService, type CreateAutomationInput, type RunListParams } from '@/services/automations.service';

const KEY = ['automations'] as const;

export function useAutomations() {
  return useQuery({ queryKey: KEY, queryFn: () => automationsService.list(), staleTime: 15_000 });
}

export function useAutomation(id: string | null) {
  return useQuery({
    queryKey: [...KEY, id],
    queryFn: () => automationsService.get(id!),
    enabled: !!id,
    staleTime: 15_000,
  });
}

export function useAutomationCatalog() {
  return useQuery({ queryKey: [...KEY, 'catalog'], queryFn: () => automationsService.catalog(), staleTime: 60_000 });
}

function useInvalidate() {
  const qc = useQueryClient();
  return (id?: string) => {
    void qc.invalidateQueries({ queryKey: KEY, exact: true });
    if (id) void qc.invalidateQueries({ queryKey: [...KEY, id] });
  };
}

export function useCreateAutomation() {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: (input: CreateAutomationInput) => automationsService.create(input), onSuccess: () => invalidate() });
}

export function useRenameAutomation() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; name?: string; description?: string }) => automationsService.rename(id, body),
    onSuccess: (a) => invalidate(a.id),
  });
}

export function useSaveAutomationDraft() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, draft }: { id: string; draft: AutomationDefinition }) => automationsService.saveDraft(id, draft),
    onSuccess: (a) => {
      qc.setQueryData([...KEY, a.id], a);
      void qc.invalidateQueries({ queryKey: KEY, exact: true });
    },
  });
}

export function useValidateAutomation() {
  return useMutation({ mutationFn: (draft: AutomationDefinition) => automationsService.validate(draft) });
}

/** Publish / pause / resume / duplicate: all return the automation. */
export function useAutomationAction(action: 'publish' | 'resume' | 'duplicate') {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: (id: string) => automationsService[action](id), onSuccess: (a) => invalidate(a.id) });
}

export function usePauseAutomation() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, stopRuns }: { id: string; stopRuns?: boolean }) => automationsService.pause(id, stopRuns),
    onSuccess: (a) => invalidate(a.id),
  });
}

export function useDeleteAutomation() {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: (id: string) => automationsService.remove(id), onSuccess: () => invalidate() });
}

export function useAutomationRuns(id: string | null, params: RunListParams) {
  return useQuery({
    queryKey: [...KEY, id, 'runs', params],
    queryFn: () => automationsService.runs(id!, params),
    enabled: !!id,
    placeholderData: keepPreviousData,
    staleTime: 10_000,
  });
}

export function useAutomationRun(runId: string | null) {
  return useQuery({ queryKey: [...KEY, 'run', runId], queryFn: () => automationsService.run(runId!), enabled: !!runId });
}

export function useContactAutomationRuns(contactId: string | null) {
  return useQuery({
    queryKey: [...KEY, 'contact', contactId],
    queryFn: () => automationsService.contactRuns(contactId!),
    enabled: !!contactId,
    staleTime: 15_000,
  });
}

export function useCancelAutomationRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (runId: string) => automationsService.cancelRun(runId),
    onSuccess: () => void qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useEnrollInAutomation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, contactIds }: { id: string; contactIds: string[] }) => automationsService.enroll(id, contactIds),
    onSuccess: () => void qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useAudiencePreview(filter: ConditionGroup | null) {
  const key = JSON.stringify(filter ?? null);
  return useQuery({
    queryKey: [...KEY, 'audience', key],
    queryFn: () => automationsService.audiencePreview(filter!),
    enabled: !!filter && filter.any.some((b) => b.all.length > 0),
    staleTime: 30_000,
    retry: false,
  });
}
