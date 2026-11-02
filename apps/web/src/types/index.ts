// Re-export shared types for convenience in web app
export type {
  Organization,
  User,
  Conversation,
  Message,
  TenantContext,
  PaginatedResponse,
  PaginationMeta,
} from '@crm/shared';

// Web-only types
export interface NavItem {
  name: string;
  href: string;
}

export interface DashboardStats {
  open_conversations: number;
  total_contacts: number;
  ai_handled_today: number;
  avg_response_time_sec: number;
}
