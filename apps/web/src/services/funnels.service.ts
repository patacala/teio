import { authClient } from '@/lib/auth-client';

export interface Funnel {
  id: string;
  name: string;
  organization_id: string;
  created_at: string;
  updated_at: string;
}

/** Known automation-portable values — see FunnelRulesService (apps/api). */
export type StageType =
  | 'new'
  | 'contacted'
  | 'qualified'
  | 'appointment_scheduled'
  | 'appointment_confirmed'
  | 'proposal'
  | 'negotiation'
  | 'won'
  | 'lost'
  | 'custom';

export interface FunnelStage {
  id: string;
  funnel_id: string;
  name: string;
  position: number;
  color?: string;
  stage_type?: StageType;
  is_terminal?: boolean;
  rotting_days?: number | null;
}

export interface FunnelTemplateStage {
  id: string;
  name: string;
  position: number;
  color?: string;
}

export interface FunnelTemplate {
  id: string;
  name: string;
  description?: string;
  category: string;
  stages: FunnelTemplateStage[];
}

export const funnelsService = {
  getFunnels: () =>
    authClient.get<Funnel[]>('/funnels'),

  createFunnel: (body: { name: string }) =>
    authClient.post<Funnel>('/funnels', body),

  getFunnelStages: (funnelId: string) =>
    authClient.get<FunnelStage[]>(`/funnels/${funnelId}/stages`),

  createFunnelStage: (funnelId: string, body: Partial<FunnelStage>) =>
    authClient.post<FunnelStage>(`/funnels/${funnelId}/stages`, body),

  updateFunnelStage: (funnelId: string, stageId: string, body: Partial<FunnelStage>) =>
    authClient.patch<FunnelStage>(`/funnels/${funnelId}/stages/${stageId}`, body),

  deleteFunnelStage: (funnelId: string, stageId: string) =>
    authClient.delete<void>(`/funnels/${funnelId}/stages/${stageId}`),

  reorderFunnelStages: (funnelId: string, orderedIds: string[]) =>
    authClient.post<void>(`/funnels/${funnelId}/stages/reorder`, { orderedIds }),

  getFunnelTemplates: () =>
    authClient.get<FunnelTemplate[]>('/funnels/templates'),

  applyFunnelTemplate: (templateId: string) =>
    authClient.post<{ funnel: Funnel; stages: FunnelStage[] }>('/funnels/templates/apply', {
      template_id: templateId,
    }),

  updateContactStage: (contactId: string, stageId: string) =>
    authClient.patch<void>(`/contacts/${contactId}/stage`, { stage_id: stageId }),

  getAllStages: () =>
    authClient.get<FunnelStage[]>('/funnels/stages'),
};
