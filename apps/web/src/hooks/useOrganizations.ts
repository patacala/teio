'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { organizationsService } from '@/services/organizations.service';

export function useOrganizations(enabled = true) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['organizations', user?.id ?? null],
    queryFn: () => organizationsService.listAll(),
    enabled: enabled && !!user?.id,
    staleTime: 60_000,
  });
}

export function useMyOrganization() {
  return useQuery({
    queryKey: ['my-organization'],
    queryFn: () => organizationsService.getMyOrganization(),
    staleTime: 60_000,
  });
}

export function useUpdateSequenceSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (enabled: boolean) =>
      organizationsService.updateSequenceSettings(enabled),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-organization'] });
    },
  });
}
