import { authClient } from '@/lib/auth-client';

export interface MessageTemplate {
  id: string;
  name: string;
  content: string;
  channel: string;
  variables?: string[];
}

export interface CreateTemplateBody {
  name: string;
  content: string;
  channel?: string;
  variables?: string[];
}

export const templatesService = {
  getTemplates: (channel?: string) => {
    const qs = new URLSearchParams();
    if (channel) qs.set('channel', channel);
    return authClient.get<MessageTemplate[]>(`/templates?${qs.toString()}`);
  },

  createTemplate: (body: CreateTemplateBody) =>
    authClient.post<MessageTemplate>('/templates', body),

  updateTemplate: (id: string, body: Partial<CreateTemplateBody>) =>
    authClient.patch<MessageTemplate>(`/templates/${id}`, body),

  deleteTemplate: (id: string) =>
    authClient.delete<void>(`/templates/${id}`),
};
