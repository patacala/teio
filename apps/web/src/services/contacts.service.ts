import { authClient } from '@/lib/auth-client';
import type { PaginatedResponse } from './conversations.service';

export type ContactsPage = PaginatedResponse<Contact>;

export interface ContactCompanyInput {
  name: string;
  company_type?: string;
  website?: string;
  logo?: string;
  demo_link?: string;
  company_context?: string;
}

export interface Contact {
  id: string;
  first_name: string;
  last_name: string;
  email?: string;
  phone?: string;
  company_id?: string;
  tags?: string[];
  lead_score?: number;
  lead_stage?: string;
  handled_by?: 'ai' | 'human';
  last_contacted_at?: string;
  custom_fields?: Record<string, unknown>;
  channel_ids?: Record<string, string>;
  ai_insights?: {
    intent?: string;
    sentiment?: string;
    summary?: string;
  };
  last_activity?: string;
  created_at: string;
  updated_at: string;
}

export interface CreateContactInput extends Partial<Contact> {
  company?: ContactCompanyInput;
}

export interface ConversationSummary {
  id: string;
  channel: string;
  status: string;
  last_message_at?: string;
  contact_id: string;
}

export interface ContactConversationsSummary {
  total: number;
  conversations: ConversationSummary[];
}

export interface CallSummary {
  id: string;
  status: string;
  duration_seconds?: number;
  started_at?: string;
  created_at: string;
  recording_url?: string;
}

export interface ContactCallsSummary {
  total: number;
  calls: CallSummary[];
}

export interface Appointment {
  id: string;
  title: string;
  starts_at: string;
  ends_at?: string;
  status: string;
  notes?: string;
}

export interface ContactStats {
  total: number;
  new_this_month: number;
  ai_handled: number;
  human_handled: number;
}

export interface CapturedData {
  fields: Record<string, string>;
}

export interface ContactListParams {
  search?: string;
  page?: number;
  limit?: number;
  tag?: string;
  stage_id?: string;
}

export const contactsService = {
  getContacts: (params?: ContactListParams) => {
    const qs = new URLSearchParams();
    if (params?.search) qs.set('search', params.search);
    if (params?.page) qs.set('page', String(params.page));
    if (params?.limit) qs.set('limit', String(params.limit));
    if (params?.tag) qs.set('tag', params.tag);
    if (params?.stage_id) qs.set('stage_id', params.stage_id);
    return authClient.get<PaginatedResponse<Contact>>(`/contacts?${qs.toString()}`);
  },

  getContact: (id: string) => authClient.get<Contact>(`/contacts/${id}`),

  createContact: (body: CreateContactInput) =>
    authClient.post<Contact>('/contacts', body),

  updateContact: (id: string, body: Partial<Contact>) =>
    authClient.patch<Contact>(`/contacts/${id}`, body),

  getCapturedData: (id: string) =>
    authClient.get<CapturedData>(`/contacts/${id}/captured-data`),

  updateCapturedData: (id: string, fields: Record<string, string>) =>
    authClient.patch<CapturedData>(`/contacts/${id}/captured-data`, { fields }),

  addTag: (id: string, tag: string) =>
    authClient.post<Contact>(`/contacts/${id}/tags`, { tag }),

  removeTag: (id: string, tagId: string) =>
    authClient.delete<void>(`/contacts/${id}/tags/${tagId}`),

  updateLeadScore: (id: string, score: number) =>
    authClient.patch<Contact>(`/contacts/${id}`, { lead_score: score }),

  getStats: () =>
    authClient.get<ContactStats>('/contacts/stats'),

  exportContacts: () =>
    authClient.get<Contact[]>('/contacts/export'),

  getContactConversations: (id: string) =>
    authClient.get<ContactConversationsSummary>(`/contacts/${id}/messages`),

  getContactCalls: (id: string) =>
    authClient.get<ContactCallsSummary>(`/contacts/${id}/calls`),

  getContactAppointments: (id: string) =>
    authClient.get<Appointment[]>(`/contacts/${id}/appointments`),

  updateStage: (id: string, stageId: string) =>
    authClient.patch<Contact>(`/contacts/${id}/stage`, { stage_id: stageId }),
};
