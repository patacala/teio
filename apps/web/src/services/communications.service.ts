import { authClient } from '@/lib/auth-client';
import type { CommunicationTemplate, CommunicationDelivery } from '@crm/shared';

export interface CreateTemplateBody {
  event_type: string;
  channel_type: string;
  provider: string;
  provider_template_id: string;
  name?: string;
  description?: string;
  from_override?: string;
  is_active?: boolean;
  priority?: number;
}

export interface UpdateTemplateBody extends Partial<CreateTemplateBody> {}

export interface PaginatedDeliveries {
  items: CommunicationDelivery[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

export const communicationsService = {
  // Org templates
  getTemplates: (params?: { event_type?: string; channel_type?: string }) => {
    const qs = new URLSearchParams();
    if (params?.event_type) qs.set('event_type', params.event_type);
    if (params?.channel_type) qs.set('channel_type', params.channel_type);
    const query = qs.toString();
    return authClient.get<CommunicationTemplate[]>(`/communications/templates${query ? `?${query}` : ''}`);
  },
  createTemplate: (body: CreateTemplateBody) =>
    authClient.post<CommunicationTemplate>('/communications/templates', body),
  updateTemplate: (id: string, body: UpdateTemplateBody) =>
    authClient.patch<CommunicationTemplate>(`/communications/templates/${id}`, body),
  deleteTemplate: (id: string) =>
    authClient.delete<void>(`/communications/templates/${id}`),

  // Metadata
  getEventTypes: () =>
    authClient.get<string[]>('/communications/templates/events'),
  getPlatformEventTypes: () =>
    authClient.get<string[]>('/communications/templates/events/platform'),

  // Deliveries
  getDeliveries: (page = 1, limit = 20) =>
    authClient.get<PaginatedDeliveries>(`/communications/deliveries?page=${page}&limit=${limit}`),

  // Single template by ID
  getTemplateById: (id: string) =>
    authClient.get<CommunicationTemplate>(`/communications/templates/${id}`),

  // System templates (platform admin only)
  getSystemTemplateById: (id: string) =>
    authClient.get<CommunicationTemplate>(`/communications/templates/system/${id}`),
  getSystemTemplates: (params?: { event_type?: string; channel_type?: string }) => {
    const qs = new URLSearchParams();
    if (params?.event_type) qs.set('event_type', params.event_type);
    if (params?.channel_type) qs.set('channel_type', params.channel_type);
    const query = qs.toString();
    return authClient.get<CommunicationTemplate[]>(`/communications/templates/system${query ? `?${query}` : ''}`);
  },
  createSystemTemplate: (body: CreateTemplateBody) =>
    authClient.post<CommunicationTemplate>('/communications/templates/system', body),
  updateSystemTemplate: (id: string, body: UpdateTemplateBody) =>
    authClient.patch<CommunicationTemplate>(`/communications/templates/system/${id}`, body),
  deleteSystemTemplate: (id: string) =>
    authClient.delete<void>(`/communications/templates/system/${id}`),
};
