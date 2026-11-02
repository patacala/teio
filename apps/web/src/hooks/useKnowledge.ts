'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  knowledgeService,
  type KnowledgeListParams,
  type CreateKnowledgeEntryBody,
  type UpdateKnowledgeEntryBody,
} from '@/services/knowledge.service';

export const KNOWLEDGE_KEYS = {
  all: ['knowledge'] as const,
  metrics: () => [...KNOWLEDGE_KEYS.all, 'metrics'] as const,
  list: (params?: KnowledgeListParams) => [...KNOWLEDGE_KEYS.all, 'list', params] as const,
  detail: (id: string) => [...KNOWLEDGE_KEYS.all, 'detail', id] as const,
};

export function useKnowledgeMetrics() {
  return useQuery({
    queryKey: KNOWLEDGE_KEYS.metrics(),
    queryFn: () => knowledgeService.getMetrics(),
    staleTime: 30_000,
  });
}

export function useKnowledgeEntries(params?: KnowledgeListParams) {
  return useQuery({
    queryKey: KNOWLEDGE_KEYS.list(params),
    queryFn: () => knowledgeService.getEntries(params),
    staleTime: 30_000,
  });
}

export function useCreateKnowledgeEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateKnowledgeEntryBody) => knowledgeService.createEntry(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KNOWLEDGE_KEYS.all });
    },
  });
}

export function useUpdateKnowledgeEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateKnowledgeEntryBody }) =>
      knowledgeService.updateEntry(id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KNOWLEDGE_KEYS.all });
    },
  });
}

export function useDeleteKnowledgeEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => knowledgeService.deleteEntry(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KNOWLEDGE_KEYS.all });
    },
  });
}

export function useToggleKnowledgeEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => knowledgeService.toggleEntry(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KNOWLEDGE_KEYS.all });
    },
  });
}

export function useUploadKnowledgeFile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ file, title, category }: { file: File; title?: string; category?: string }) =>
      knowledgeService.uploadFile(file, { title, category }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KNOWLEDGE_KEYS.all });
    },
  });
}

export function useReindexKnowledge() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => knowledgeService.reindex(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KNOWLEDGE_KEYS.all });
    },
  });
}
