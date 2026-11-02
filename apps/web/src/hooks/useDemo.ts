'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { demoService, type DemoRequestListParams } from '@/services/demo.service';

export function useDemoRequests(params?: DemoRequestListParams) {
  return useQuery({
    queryKey: ['demo-requests', params],
    queryFn: () => demoService.getDemoRequests(params),
    staleTime: 30_000,
  });
}

export function useRevokeDemoLink() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (linkId: string) => demoService.revokeDemoLink(linkId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['demo-requests'] });
    },
  });
}

export function useSendDemoEmail() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ requestId, email }: { requestId: string; email?: string }) =>
      demoService.sendDemoEmail(requestId, email),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['demo-requests'] });
    },
  });
}
