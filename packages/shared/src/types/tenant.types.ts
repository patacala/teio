export interface BaseEntity {
  id: string;
  created_at: Date;
  updated_at: Date;
}

export interface BaseTenantEntity extends BaseEntity {
  organization_id: string;
}

export interface Organization extends BaseEntity {
  name: string;
  slug: string;
  plan: OrganizationPlan;
  settings: OrganizationSettings;
  is_active: boolean;
}

export type OrganizationPlan = 'free' | 'starter' | 'professional' | 'enterprise';

export interface OrganizationBranding {
  logo_url?: string;
  primary_color?: string;
  accent_color?: string;
  from_name?: string;
  from_email?: string;
  support_email?: string;
  website_url?: string;
}

export interface NotificationPreferences {
  [eventType: string]: { enabled: boolean };
}

export interface OrganizationSettings {
  timezone: string;
  locale: string;
  ai_enabled: boolean;
  max_agents: number;
  max_conversations_per_month: number;
  channels_enabled: string[];
  custom_branding: boolean;
  webhook_url?: string;
  branding?: OrganizationBranding;
  notification_preferences?: NotificationPreferences;
}

export interface TenantContext {
  organization_id: string;
  user_id: string;
  role: string;
}
