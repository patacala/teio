'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { communicationsService, type CreateTemplateBody, type UpdateTemplateBody } from '@/services/communications.service';

// ── Org templates ─────────────────────────────────────────────────────────────

export function useCommunicationTemplates(params?: { event_type?: string; channel_type?: string }) {
  return useQuery({
    queryKey: ['communication-templates', params],
    queryFn: () => communicationsService.getTemplates(params),
    staleTime: 30_000,
  });
}

export function useCreateCommunicationTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateTemplateBody) => communicationsService.createTemplate(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['communication-templates'] }),
  });
}

export function useUpdateCommunicationTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateTemplateBody }) =>
      communicationsService.updateTemplate(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['communication-templates'] }),
  });
}

export function useDeleteCommunicationTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => communicationsService.deleteTemplate(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['communication-templates'] }),
  });
}

export function useCommunicationTemplate(id?: string) {
  return useQuery({
    queryKey: ['communication-template', id],
    queryFn: () => communicationsService.getTemplateById(id!),
    staleTime: 30_000,
    enabled: !!id,
  });
}

export function useSystemTemplate(id?: string) {
  return useQuery({
    queryKey: ['system-template', id],
    queryFn: () => communicationsService.getSystemTemplateById(id!),
    staleTime: 30_000,
    enabled: !!id,
  });
}

// ── Event types ───────────────────────────────────────────────────────────────

export function useEventTypes() {
  return useQuery({
    queryKey: ['communication-event-types'],
    queryFn: () => communicationsService.getEventTypes(),
    staleTime: 60_000 * 10,
  });
}

export function usePlatformEventTypes(enabled = true) {
  return useQuery({
    queryKey: ['platform-event-types'],
    queryFn: () => communicationsService.getPlatformEventTypes(),
    staleTime: 60_000 * 10,
    enabled,
  });
}

// ── Deliveries ────────────────────────────────────────────────────────────────

export function useDeliveries(page = 1, limit = 20) {
  return useQuery({
    queryKey: ['communication-deliveries', page, limit],
    queryFn: () => communicationsService.getDeliveries(page, limit),
    staleTime: 15_000,
  });
}

// ── System templates (platform admin) ─────────────────────────────────────────

export function useSystemTemplates(params?: { event_type?: string; channel_type?: string }, enabled = true) {
  return useQuery({
    queryKey: ['system-templates', params],
    queryFn: () => communicationsService.getSystemTemplates(params),
    staleTime: 30_000,
    enabled,
  });
}

export function useCreateSystemTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateTemplateBody) => communicationsService.createSystemTemplate(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['system-templates'] }),
  });
}

export function useUpdateSystemTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateTemplateBody }) =>
      communicationsService.updateSystemTemplate(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['system-templates'] }),
  });
}

export function useDeleteSystemTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => communicationsService.deleteSystemTemplate(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['system-templates'] }),
  });
}
