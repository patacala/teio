import { authClient } from '@/lib/auth-client';

export interface AutomatedFollowUp {
  id: string;
  organization_id: string;
  calendar_id: string;
  contact_id: string;
  title: string;
  description?: string;
  status: string;
  starts_at: string;
  ends_at: string;
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
  source?: string;
  metadata?: Record<string, unknown>;
}

export interface FollowUpListResponse {
  items: AutomatedFollowUp[];
  total: number;
}

export interface AutomationSequence {
  id: string;
  organization_id: string;
  contact_id: string;
  conversation_id?: string;
  sequence_type: string;
  current_attempt: number;
  max_attempts: number;
  status: string;
  completion_reason?: string;
  source: string;
  started_at: string;
  completed_at?: string;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

/** One touch in a cadence: what to do, how to reach the contact, and when. */
export interface SequenceStepInput {
  action: string;
  channel_strategy: string;
  delay_hours: number;
  config?: Record<string, unknown>;
}

export interface SequenceTemplateStep extends SequenceStepInput {
  id: string;
  template_id: string;
  position: number;
}

export interface SequenceTemplate {
  id: string;
  /** null = platform default (read-only); set = this org's editable copy */
  organization_id: string | null;
  name: string;
  description?: string;
  sequence_type: string;
  is_active: boolean;
  steps: SequenceTemplateStep[];
  created_at: string;
  updated_at: string;
}

/** The cloned, per-sequence plan — independent from the template it came from. */
export interface SequenceStep extends SequenceStepInput {
  id: string;
  sequence_id: string;
  position: number;
  executed_action: string | null;
  resolved_channel: string | null;
}

export interface CreateSequenceInput {
  contact_id: string;
  conversation_id?: string;
  sequence_type?: string;
  /** Pins the exact cadence to clone — preferred over `sequence_type`. */
  template_id?: string;
  source?: string;
  due_at?: string;
  /** Overrides the AI-generated body of the first message. */
  message_content?: string;
  metadata?: Record<string, unknown>;
}

export interface SequenceListResponse {
  items: AutomationSequence[];
  total: number;
}

export const automationService = {
  async createFollowUp(input: CreateFollowUpInput): Promise<AutomatedFollowUp> {
    return authClient.post('/automation/follow-ups', input);
  },

  async listFollowUps(params?: {
    status?: string;
    action?: string;
    contact_id?: string;
    limit?: number;
    offset?: number;
  }): Promise<FollowUpListResponse> {
    const searchParams = new URLSearchParams();
    if (params?.status) searchParams.set('status', params.status);
    if (params?.action) searchParams.set('action', params.action);
    if (params?.contact_id) searchParams.set('contact_id', params.contact_id);
    if (params?.limit) searchParams.set('limit', String(params.limit));
    if (params?.offset) searchParams.set('offset', String(params.offset));
    const qs = searchParams.toString();
    return authClient.get(`/automation/follow-ups${qs ? `?${qs}` : ''}`);
  },

  async getFollowUp(id: string): Promise<AutomatedFollowUp> {
    return authClient.get(`/automation/follow-ups/${id}`);
  },

  async cancelFollowUp(id: string): Promise<{ success: boolean }> {
    return authClient.patch(`/automation/follow-ups/${id}/cancel`, {});
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

  // ── Sequences ──

  async createSequence(input: CreateSequenceInput): Promise<AutomationSequence> {
    return authClient.post('/automation/sequences', input);
  },

  async listSequences(params?: {
    status?: string;
    contact_id?: string;
    sequence_type?: string;
    limit?: number;
    offset?: number;
  }): Promise<SequenceListResponse> {
    const searchParams = new URLSearchParams();
    if (params?.status) searchParams.set('status', params.status);
    if (params?.contact_id) searchParams.set('contact_id', params.contact_id);
    if (params?.sequence_type) searchParams.set('sequence_type', params.sequence_type);
    if (params?.limit) searchParams.set('limit', String(params.limit));
    if (params?.offset) searchParams.set('offset', String(params.offset));
    const qs = searchParams.toString();
    return authClient.get(`/automation/sequences${qs ? `?${qs}` : ''}`);
  },

  async getSequence(id: string): Promise<AutomationSequence> {
    return authClient.get(`/automation/sequences/${id}`);
  },

  async cancelSequence(id: string): Promise<{ success: boolean }> {
    return authClient.patch(`/automation/sequences/${id}/cancel`, {});
  },

  /** Cloned steps of one running sequence, for the contact's follow-up card. */
  async getSequenceSteps(id: string): Promise<SequenceStep[]> {
    return authClient.get(`/automation/sequences/${id}/steps`);
  },

  // ── Templates ──

  async listTemplates(): Promise<SequenceTemplate[]> {
    return authClient.get('/automation/sequences/templates');
  },

  async getTemplate(id: string): Promise<SequenceTemplate> {
    return authClient.get(`/automation/sequences/templates/${id}`);
  },

  /** Platform templates are read-only — duplicating yields an editable copy. */
  async duplicateTemplate(id: string, name?: string): Promise<SequenceTemplate> {
    return authClient.post(`/automation/sequences/templates/${id}/duplicate`, { name });
  },

  async updateTemplate(
    id: string,
    body: { name?: string; description?: string; is_active?: boolean },
  ): Promise<SequenceTemplate> {
    return authClient.patch(`/automation/sequences/templates/${id}`, body);
  },

  /** Sends the whole ordered cadence; positions are derived server-side. */
  async replaceTemplateSteps(id: string, steps: SequenceStepInput[]): Promise<SequenceTemplate> {
    return authClient.put(`/automation/sequences/templates/${id}/steps`, { steps });
  },

  async deleteTemplate(id: string): Promise<void> {
    return authClient.delete(`/automation/sequences/templates/${id}`);
  },
};
