'use client';

import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { contactsService, type ContactListParams, type Contact, type CreateContactInput } from '@/services/contacts.service';
import { funnelsService } from '@/services/funnels.service';


export function useContacts(params?: ContactListParams) {
  return useQuery({
    queryKey: ['contacts', params],
    queryFn: () => contactsService.getContacts(params),
  });
}

/** Contacts of one funnel stage (Board column / Table column). Keeps rows on screen while a bigger page loads. */
export function useStageContacts(stageId: string, limit: number) {
  const params: ContactListParams = { stage_id: stageId, limit };
  return useQuery({
    queryKey: ['contacts', params],
    queryFn: () => contactsService.getContacts(params),
    placeholderData: keepPreviousData,
  });
}

export function useContact(id: string | null) {
  return useQuery({
    queryKey: ['contacts', id],
    queryFn: () => contactsService.getContact(id!),
    enabled: !!id,
  });
}

export function useCreateContact() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateContactInput) => contactsService.createContact(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
    },
  });
}

export function useUpdateContact() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<Contact> }) =>
      contactsService.updateContact(id, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
    },
  });
}

export function useAddTag() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ contactId, tag }: { contactId: string; tag: string }) =>
      contactsService.addTag(contactId, tag),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['contacts', variables.contactId] });
    },
  });
}

export function useRemoveTag() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ contactId, tagId }: { contactId: string; tagId: string }) =>
      contactsService.removeTag(contactId, tagId),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['contacts', variables.contactId] });
    },
  });
}

export function useUpdateLeadScore() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ contactId, score }: { contactId: string; score: number }) =>
      contactsService.updateLeadScore(contactId, score),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['contacts', variables.contactId] });
    },
  });
}

export function useContactStats() {
  return useQuery({
    queryKey: ['contact-stats'],
    queryFn: () => contactsService.getStats(),
    staleTime: 30_000,
  });
}

export function useAllFunnelStages() {
  return useQuery({
    queryKey: ['all-funnel-stages'],
    queryFn: () => funnelsService.getAllStages(),
    staleTime: 60_000,
  });
}

export function useContactMessages(id: string | null) {
  return useQuery({
    queryKey: ['contact-messages', id],
    queryFn: () => contactsService.getContactConversations(id!),
    enabled: !!id,
    staleTime: 30_000,
  });
}

export function useContactCalls(id: string | null) {
  return useQuery({
    queryKey: ['contact-calls', id],
    queryFn: () => contactsService.getContactCalls(id!),
    enabled: !!id,
    staleTime: 30_000,
  });
}

export function useContactAppointments(id: string | null) {
  return useQuery({
    queryKey: ['contact-appointments', id],
    queryFn: () => contactsService.getContactAppointments(id!),
    enabled: !!id,
    staleTime: 30_000,
  });
}

export function useUpdateContactStage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ contactId, stageId }: { contactId: string; stageId: string }) =>
      contactsService.updateStage(contactId, stageId),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['contacts', variables.contactId] });
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      queryClient.invalidateQueries({ queryKey: ['contact-activity', variables.contactId] });
    },
  });
}

/** Opts a lead out of automated follow-ups — same effect as the AI's own opt-out tool. */
export function useOptOut() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (contactId: string) => contactsService.optOut(contactId),
    onSuccess: (_data, contactId) => {
      queryClient.invalidateQueries({ queryKey: ['contacts', contactId] });
    },
  });
}
