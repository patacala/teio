'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { automationService } from '@/services/automation.service';
import type {
  CreateFollowUpInput,
  CreateSequenceInput,
  FollowUpListParams,
  UpdateFollowUpInput,
} from '@/services/automation.service';

export function useFollowUps(params: FollowUpListParams | null) {
  return useQuery({
    queryKey: ['follow-ups', params],
    queryFn: () => automationService.listFollowUps(params ?? undefined),
    enabled: params !== null,
    staleTime: 30_000,
  });
}

export function useFollowUpMetrics(calendarId: string | null, enabled = true) {
  return useQuery({
    queryKey: ['follow-up-metrics', calendarId],
    queryFn: () => automationService.getFollowUpMetrics(calendarId ?? undefined),
    enabled: enabled && !!calendarId,
    staleTime: 60_000,
  });
}

function useInvalidateFollowUps() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ['follow-ups'] });
    qc.invalidateQueries({ queryKey: ['follow-up-metrics'] });
    qc.invalidateQueries({ queryKey: ['contact-follow-ups'] });
  };
}

export function useUpdateFollowUp() {
  const invalidate = useInvalidateFollowUps();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateFollowUpInput }) => automationService.updateFollowUp(id, input),
    onSuccess: invalidate,
  });
}

export function useCompleteFollowUp() {
  const invalidate = useInvalidateFollowUps();
  return useMutation({
    mutationFn: (id: string) => automationService.completeFollowUp(id),
    onSuccess: invalidate,
  });
}

export function useDeleteFollowUp() {
  const invalidate = useInvalidateFollowUps();
  return useMutation({
    mutationFn: (id: string) => automationService.deleteFollowUp(id),
    onSuccess: invalidate,
  });
}

export function useFollowUp(id: string | null) {
  return useQuery({
    queryKey: ['follow-up', id],
    queryFn: () => automationService.getFollowUp(id!),
    enabled: !!id,
  });
}

export function useContactFollowUps(
  contactId: string | null,
  params?: { status?: string; action?: string },
) {
  return useQuery({
    queryKey: ['contact-follow-ups', contactId, params],
    queryFn: () => automationService.getContactFollowUps(contactId!, params),
    enabled: !!contactId,
  });
}

export function useCreateFollowUp() {
  const invalidate = useInvalidateFollowUps();
  return useMutation({
    mutationFn: (input: CreateFollowUpInput) => automationService.createFollowUp(input),
    onSuccess: invalidate,
  });
}

export function useCancelFollowUp() {
  const invalidate = useInvalidateFollowUps();
  return useMutation({
    mutationFn: (id: string) => automationService.cancelFollowUp(id),
    onSuccess: invalidate,
  });
}

// ── Sequences ──

export function useSequences(params?: {
  status?: string;
  contact_id?: string;
  sequence_type?: string;
  limit?: number;
  offset?: number;
}) {
  return useQuery({
    queryKey: ['sequences', params],
    queryFn: () => automationService.listSequences(params),
  });
}

export function useCreateSequence() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSequenceInput) => automationService.createSequence(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sequences'] });
      qc.invalidateQueries({ queryKey: ['appointments'] });
    },
  });
}

export function useCancelSequence() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => automationService.cancelSequence(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sequences'] });
      qc.invalidateQueries({ queryKey: ['appointments'] });
    },
  });
}
