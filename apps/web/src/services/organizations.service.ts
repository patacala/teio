import { authClient } from '@/lib/auth-client';

export interface Organization {
  id: string;
  name: string;
  slug: string;
  plan: string;
  is_active: boolean;
  is_internal?: boolean;
  created_at: string;
  settings?: {
    timezone?: string;
    locale?: string;
    [key: string]: unknown;
  };
}

export const organizationsService = {
  listAll: () => authClient.get<Organization[]>('/organizations'),
  getMyOrganization: () => authClient.get<Organization>('/organizations/me'),
  updateSequenceSettings: (enabled: boolean) =>
    authClient.patch<Organization>('/organizations/me/sequences', { enabled }),
  /** Platform admins: internal organizations are left out of the platform dashboard. */
  setInternal: (id: string, isInternal: boolean) =>
    authClient.patch<Organization>(`/organizations/${id}`, { is_internal: isInternal }),
};
