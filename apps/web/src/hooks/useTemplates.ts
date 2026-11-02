'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { templatesService, type CreateTemplateBody } from '@/services/templates.service';

export function useTemplates(channel?: string) {
  return useQuery({
    queryKey: ['templates', channel],
    queryFn: () => templatesService.getTemplates(channel),
    staleTime: 5 * 60 * 1000,
  });
}

export function useCreateTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateTemplateBody) => templatesService.createTemplate(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['templates'] }),
  });
}

export function useUpdateTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<CreateTemplateBody> }) =>
      templatesService.updateTemplate(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['templates'] }),
  });
}

export function useDeleteTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => templatesService.deleteTemplate(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['templates'] }),
  });
}
