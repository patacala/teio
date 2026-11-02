'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { contactsService } from '@/services/contacts.service';

export function useCapturedFields(contactId: string | null) {
  return useQuery({
    queryKey: ['captured-fields', contactId],
    queryFn: () => contactsService.getCapturedData(contactId!),
    enabled: !!contactId,
  });
}

export function useUpdateCapturedFields(contactId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (fields: Record<string, string>) =>
      contactsService.updateCapturedData(contactId!, fields),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['captured-fields', contactId] });
    },
  });
}
