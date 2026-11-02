import type { BaseTenantEntity } from './tenant.types';

export type UserRoleType = 'owner' | 'admin' | 'agent' | 'viewer';

export interface User extends BaseTenantEntity {
  email: string;
  full_name: string;
  avatar_url?: string;
  role: UserRoleType;
  is_active: boolean;
  last_seen_at?: Date;
  metadata: Record<string, unknown>;
}

export interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  avatar_url?: string;
  role: UserRoleType;
  organization_id: string;
}

/** Raw Supabase HS256 JWT payload */
export interface SupabaseJwtPayload {
  aud: string;                                  // "authenticated"
  sub: string;                                  // Supabase user UUID
  email: string;
  role: string;                                 // "authenticated" (postgres role, not app role)
  app_metadata: Record<string, unknown>;
  user_metadata: Record<string, unknown>;
  iat: number;
  exp: number;
}

/** App-level auth context attached to req.user after middleware enrichment */
export interface AuthPayload {
  id: string;                   // internal core.users.id (or 'api-key' for API key auth)
  auth_user_id: string | null;  // Supabase sub (null for API key auth)
  email: string | null;
  organization_id: string;
  role: UserRoleType | 'api_key';
  is_platform_admin?: boolean;
}
