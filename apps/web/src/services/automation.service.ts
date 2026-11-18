import { authClient } from '@/lib/auth-client';

export interface AutomatedFollowUp {
  id: string;
  organization_id: string;
  calendar_id: string;
  contact_id: string;
  title: string;
  description?: string;
  status: 'pending' | 'processing' | 'awaiting_user' | 'completed' | 'cancelled' | 'failed';
  /** When the step runs (or is due for a person). */
  due_at: string;
  timezone?: string;
  /** Set when the step belongs to an automation run (the run drives it). */
  run_id?: string | null;
  origin?: string;
  action: string;
  executor: string;
  channel_strategy: string;
  message_content?: string;
  source?: string;
  attempts: number;
  max_attempts: number;
  last_error?: string;
  resolved_channel?: string;
  completed_at?: string;
  contact?: {
    id: string;
    first_name: string;
    last_name?: string;
    email?: string;
    phone?: string;
  };
  created_at: string;
  updated_at: string;
}

export interface CreateFollowUpInput {
  contact_id: string;
  action: string;
  due_at: string;
  calendar_id?: string;
  executor?: string;
  channel_strategy?: string;
  message_content?: string;
  title?: string;
  description?: string;
  source?: string;
  metadata?: Record<string, unknown>;
}

export interface UpdateFollowUpInput {
  title?: string;
  description?: string;
  message_content?: string;
  /** Moves a step that has not run yet. */
  due_at?: string;
}

export interface FollowUpListParams {
  status?: string;
  action?: string;
  contact_id?: string;
  calendar_id?: string;
  from?: string;
  to?: string;
  sort?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

export interface FollowUpListResponse {
  items: AutomatedFollowUp[];
  total: number;
}

export interface FollowUpMetrics {
  today_count: number;
  week_count: number;
  pending_count: number;
  completed_count: number;
  awaiting_user_count: number;
}

export const automationService = {
  async createFollowUp(input: CreateFollowUpInput): Promise<AutomatedFollowUp> {
    return authClient.post('/automation/follow-ups', input);
  },

  async listFollowUps(params?: FollowUpListParams): Promise<FollowUpListResponse> {
    const searchParams = new URLSearchParams();
    for (const key of ['status', 'action', 'contact_id', 'calendar_id', 'from', 'to', 'sort'] as const) {
      if (params?.[key]) searchParams.set(key, String(params[key]));
    }
    if (params?.limit) searchParams.set('limit', String(params.limit));
    if (params?.offset) searchParams.set('offset', String(params.offset));
    const qs = searchParams.toString();
    return authClient.get(`/automation/follow-ups${qs ? `?${qs}` : ''}`);
  },

  async getFollowUpMetrics(calendarId?: string): Promise<FollowUpMetrics> {
    return authClient.get(`/automation/follow-ups/metrics${calendarId ? `?calendar_id=${calendarId}` : ''}`);
  },

  async getFollowUp(id: string): Promise<AutomatedFollowUp> {
    return authClient.get(`/automation/follow-ups/${id}`);
  },

  async updateFollowUp(id: string, input: UpdateFollowUpInput): Promise<AutomatedFollowUp> {
    return authClient.patch(`/automation/follow-ups/${id}`, input);
  },

  /** Done (by the person it was handed to); an automation waiting on it moves on. */
  async completeFollowUp(id: string): Promise<AutomatedFollowUp> {
    return authClient.post(`/automation/follow-ups/${id}/complete`, {});
  },

  /** Skips the step; an automation waiting on it moves on. */
  async cancelFollowUp(id: string): Promise<AutomatedFollowUp> {
    return authClient.patch(`/automation/follow-ups/${id}/cancel`, {});
  },

  async deleteFollowUp(id: string): Promise<void> {
    return authClient.delete(`/automation/follow-ups/${id}`);
  },

  async getContactFollowUps(
    contactId: string,
    params?: { status?: string; action?: string },
  ): Promise<AutomatedFollowUp[]> {
    const searchParams = new URLSearchParams();
    if (params?.status) searchParams.set('status', params.status);
    if (params?.action) searchParams.set('action', params.action);
    const qs = searchParams.toString();
    return authClient.get(`/automation/follow-ups/contact/${contactId}${qs ? `?${qs}` : ''}`);
  },
};
