'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { teamService, type InviteMemberBody, type UpdateMemberBody } from '@/services/team.service';

export function useTeamMembers() {
  return useQuery({
    queryKey: ['team'],
    queryFn: () => teamService.getMembers(),
    staleTime: 30_000,
  });
}

export function useCurrentUser() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['current-user', user?.id ?? null],
    queryFn: () => teamService.getCurrentUser(),
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000,
  });
}

export function useUpdateMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateMemberBody }) =>
      teamService.updateMember(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['team'] }),
  });
}

export function useInviteMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: InviteMemberBody) => teamService.inviteMember(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['team'] }),
  });
}
