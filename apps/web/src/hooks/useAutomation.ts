'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { automationService } from '@/services/automation.service';
import type { CreateFollowUpInput, CreateSequenceInput } from '@/services/automation.service';

export function useFollowUps(params?: {
  status?: string;
  action?: string;
  contact_id?: string;
  limit?: number;
  offset?: number;
}) {
  return useQuery({
    queryKey: ['follow-ups', params],
    queryFn: () => automationService.listFollowUps(params),
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
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateFollowUpInput) => automationService.createFollowUp(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['follow-ups'] });
      qc.invalidateQueries({ queryKey: ['appointments'] });
    },
  });
}

export function useCancelFollowUp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => automationService.cancelFollowUp(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['follow-ups'] });
      qc.invalidateQueries({ queryKey: ['appointments'] });
    },
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
