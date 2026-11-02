import { authClient } from '@/lib/auth-client';
import { DemoRequestStatus, DemoType } from '@crm/shared';

export type { DemoRequestStatus, DemoType };

export interface DemoRequest {
  id: string;
  contact_id: string | null;
  company_id: string | null;
  organization_id: string;
  demo_type: DemoType | string;
  status: DemoRequestStatus | string;
  init_token_id: string | null;
  experience_token_id: string | null;
  demo_url: string | null;
  error_message: string | null;
  contact_name: string | null;
  contact_email: string | null;
  created_at: string;
  updated_at: string;
}

export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  total_pages: number;
}

export interface DemoRequestsPage {
  items: DemoRequest[];
  meta: PaginationMeta;
}

export interface DemoRequestListParams {
  page?: number;
  limit?: number;
}

export const demoService = {
  getDemoRequests(params?: DemoRequestListParams): Promise<DemoRequestsPage> {
    const qs = new URLSearchParams();
    if (params?.page) qs.set('page', String(params.page));
    if (params?.limit) qs.set('limit', String(params.limit));
    return authClient.get<DemoRequestsPage>(`/demo/requests?${qs.toString()}`);
  },

  revokeDemoLink(linkId: string): Promise<void> {
    return authClient.patch<void>(`/demo/links/${linkId}/revoke`, {});
  },

  sendDemoEmail(requestId: string, email?: string): Promise<void> {
    return authClient.post<void>(`/demo/requests/${requestId}/send-email`, { email });
  },
};
