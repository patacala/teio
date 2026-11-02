import { authClient } from '@/lib/auth-client';

export interface TeamMember {
  id: string;
  organization_id: string;
  email: string;
  full_name: string;
  role: string;
  is_active: boolean;
  is_platform_admin?: boolean;
  avatar_url?: string;
  last_seen_at?: string;
  created_at: string;
  updated_at: string;
}

export interface UpdateMemberBody {
  full_name?: string;
  role?: string;
  is_active?: boolean;
}

export const teamService = {
  getMembers: () =>
    authClient.get<TeamMember[]>('/users'),

  getCurrentUser: () =>
    authClient.get<TeamMember>('/users/me'),

  updateMember: (id: string, body: UpdateMemberBody) =>
    authClient.patch<TeamMember>(`/users/${id}`, body),
};
