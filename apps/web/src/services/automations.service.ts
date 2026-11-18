import { authClient } from '@/lib/auth-client';
import type {
  AutomationCategory,
  AutomationDefinition,
  AutomationDetail,
  AutomationSummary,
  ConditionGroup,
  RunDetail,
  RunStatus,
  RunSummary,
  ValidationResult,
} from '@crm/shared';

/** Organization data the builder offers in its pickers (GET /automations/catalog). */
export interface AutomationOrgCatalog {
  channels: Array<{ id: string; type: string; name: string | null }>;
  stages: Array<{ id: string; name: string; stage_type: string; funnel_id: string | null; funnel_name: string | null }>;
  tags: string[];
  custom_fields: string[];
  users: Array<{ id: string; full_name: string | null; email: string; role: string }>;
  calendars: Array<{ id: string; name: string; type: string }>;
  services: Array<{ id: string; name: string }>;
  ai_connections: Array<{ id: string; name: string; is_active: boolean }>;
}

export interface AutomationVersionSummary {
  id: string;
  version: number;
  published_at: string;
  published_by: string | null;
}

export interface CreateAutomationInput {
  name: string;
  description?: string;
  category?: AutomationCategory;
  draft?: AutomationDefinition;
}

export interface RunListParams {
  status?: RunStatus;
  limit?: number;
  offset?: number;
}

function query(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== '') search.set(key, String(value));
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

export const automationsService = {
  list: () => authClient.get<AutomationSummary[]>('/automations'),
  get: (id: string) => authClient.get<AutomationDetail>(`/automations/${id}`),
  catalog: () => authClient.get<AutomationOrgCatalog>('/automations/catalog'),
  create: (input: CreateAutomationInput) => authClient.post<AutomationDetail>('/automations', input),
  rename: (id: string, body: { name?: string; description?: string }) => authClient.patch<AutomationDetail>(`/automations/${id}`, body),
  saveDraft: (id: string, draft: AutomationDefinition) => authClient.put<AutomationDetail>(`/automations/${id}/draft`, draft),
  validate: (draft: AutomationDefinition) => authClient.post<ValidationResult>('/automations/validate', draft),
  publish: (id: string) => authClient.post<AutomationDetail>(`/automations/${id}/publish`, {}),
  pause: (id: string, stopRuns = false) => authClient.post<AutomationDetail>(`/automations/${id}/pause`, { stop_runs: stopRuns }),
  resume: (id: string) => authClient.post<AutomationDetail>(`/automations/${id}/resume`, {}),
  duplicate: (id: string) => authClient.post<AutomationDetail>(`/automations/${id}/duplicate`, {}),
  remove: (id: string) => authClient.delete<void>(`/automations/${id}`),
  versions: (id: string) => authClient.get<AutomationVersionSummary[]>(`/automations/${id}/versions`),
  runs: (id: string, params: RunListParams = {}) =>
    authClient.get<{ items: RunSummary[]; total: number }>(`/automations/${id}/runs${query({ ...params })}`),
  run: (runId: string) => authClient.get<RunDetail>(`/automations/runs/${runId}`),
  cancelRun: (runId: string) => authClient.post<{ cancelled: boolean }>(`/automations/runs/${runId}/cancel`, {}),
  contactRuns: (contactId: string) => authClient.get<RunSummary[]>(`/automations/contact/${contactId}/runs`),
  enroll: (id: string, contactIds: string[]) =>
    authClient.post<{ started: string[]; skipped: string[] }>(`/automations/${id}/enroll`, { contact_ids: contactIds }),
  audiencePreview: (filter: ConditionGroup) => authClient.post<{ count: number }>('/automations/audience/preview', { filter }),
};
