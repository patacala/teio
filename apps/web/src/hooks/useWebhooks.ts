'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  webhooksService,
  type CreateWebhookBody,
  type UpdateWebhookBody,
} from '@/services/webhooks.service';

export function useWebhooks() {
  return useQuery({
    queryKey: ['webhooks'],
    queryFn: () => webhooksService.getWebhooks(),
    staleTime: 30_000,
  });
}

export function useCreateWebhook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateWebhookBody) => webhooksService.createWebhook(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['webhooks'] }),
  });
}

export function useUpdateWebhook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateWebhookBody }) =>
      webhooksService.updateWebhook(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['webhooks'] }),
  });
}

export function useDeleteWebhook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => webhooksService.deleteWebhook(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['webhooks'] }),
  });
}

export function useWebhookLogs(webhookId: string | null) {
  return useQuery({
    queryKey: ['webhook-logs', webhookId],
    queryFn: () => webhooksService.getWebhookLogs(webhookId!),
    enabled: !!webhookId,
    staleTime: 10_000,
  });
}

export function useTestWebhook() {
  return useMutation({
    mutationFn: (id: string) => webhooksService.testWebhook(id),
  });
}
