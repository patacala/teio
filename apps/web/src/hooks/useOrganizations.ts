'use client';

import { useQuery } from '@tanstack/react-query';
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
