import { authClient } from '@/lib/auth-client';

export interface Webhook {
  id: string;
  organization_id: string;
  name: string;
  url: string;
  events: string[];
  is_active: boolean;
  last_triggered_at?: string | null;
  failure_count?: number;
  metadata?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface CreateWebhookBody {
  name: string;
  url: string;
  events: string[];
  secret?: string;
}

export interface UpdateWebhookBody {
  name?: string;
  url?: string;
  events?: string[];
  is_active?: boolean;
  secret?: string;
}

export interface WebhookLog {
  id: string;
  webhook_id: string;
  organization_id: string;
  event_type: string;
  payload: Record<string, unknown>;
  status_code: number | null;
  response_body: string | null;
  duration_ms: number | null;
  succeeded: boolean | null;
  error_message: string | null;
  delivered_at: string;
}

export interface TestWebhookResult {
  success: boolean;
  status_code?: number;
  response_body?: string;
  error?: string;
}

export const webhooksService = {
  getWebhooks: () =>
    authClient.get<Webhook[]>('/webhooks'),

  createWebhook: (body: CreateWebhookBody) =>
    authClient.post<Webhook>('/webhooks', body),

  updateWebhook: (id: string, body: UpdateWebhookBody) =>
    authClient.patch<Webhook>(`/webhooks/${id}`, body),

  deleteWebhook: (id: string) =>
    authClient.delete<void>(`/webhooks/${id}`),

  getWebhookLogs: (id: string, limit = 50) =>
    authClient.get<WebhookLog[]>(`/webhooks/${id}/logs?limit=${limit}`),

  testWebhook: (id: string) =>
    authClient.post<TestWebhookResult>(`/webhooks/${id}/test`, {}),
};
