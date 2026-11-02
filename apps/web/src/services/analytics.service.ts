import { authClient } from '@/lib/auth-client';

export type DashboardRange = '7d' | '30d' | '90d';

export interface TrendData {
  current: number;
  previous: number;
  percentage: number;
}

export interface MessagingVolumePoint {
  date: string;
  messages: number;
  calls: number;
  ai_handled: number;
}

export interface AiPerformanceEntry {
  metric: string;
  value: number;
}

export interface ResponseTimePoint {
  hour: string;
  avg: number;
}

export interface FunnelStageCount {
  stage: string;
  count: number;
  position: number;
  stage_type?: string;
  is_terminal?: boolean;
}

export interface ChannelRoiEntry {
  channel: string;
  conversations: number;
  paid_amount: number;
  paid_count: number;
  avg_payment_amount: number;
}

export interface RevenueStats {
  paid_amount: number; // cents
  paid_count: number;
  pending_amount: number; // cents
  pending_count: number;
  at_risk_amount: number; // cents
  at_risk_count: number;
  lost_amount: number; // cents
  lost_count: number;
  ai_assisted_amount: number; // cents
  ai_assisted_count: number;
  currency: string;
  trend: TrendData;
}

export interface UpcomingAppointments {
  count: number;
  range_days: number;
  next: { contact_name: string; starts_at: string; timezone: string | null } | null;
}

export interface AttentionReason {
  kind: 'hot_lead' | 'stale_payment' | 'unconfirmed_appt';
  subtitle: string;
  badge: string;
}

export interface AttentionItem {
  contact_id: string;
  contact_name: string;
  interested_service: string | null;
  reasons: AttentionReason[];
  urgency: 'critical' | 'warning';
}

export interface ContactReasonCount {
  reason: string;
  count: number;
}

export interface DashboardStats {
  open_conversations: number;
  total_contacts: number;
  calls_period: number;
  ai_resolution_rate: number;
  new_contacts_today: number;
  messages_today: number;
  messages_period: number;
  ai_handled_today: number;
  new_contacts_period: number;
  ai_handled_period: number;
  avg_response_time_seconds: number | null;
  trends: {
    conversations: TrendData;
    contacts: TrendData;
    calls: TrendData;
    ai_rate: TrendData;
  };
  messaging_volume: MessagingVolumePoint[];
  channel_distribution: Array<{ channel: string; count: number }>;
  ai_performance: AiPerformanceEntry[];
  response_time_by_hour: ResponseTimePoint[];
  funnel_conversion: FunnelStageCount[];
  channel_roi: ChannelRoiEntry[];
  revenue: RevenueStats;
  booking_conversion_rate: number;
  show_rate: number;
  unanswered_leads: number;
  appointment_cancellation_rate: number;
  appointments_with_deposit_rate: number;
  appointments_upcoming: UpcomingAppointments;
  needs_attention: AttentionItem[];
  contact_reasons: ContactReasonCount[];
}

export interface CustomDateRange {
  from: string; // yyyy-mm-dd
  to: string; // yyyy-mm-dd
}

export const analyticsService = {
  getDashboardStats: (range: DashboardRange = '30d', custom?: CustomDateRange) => {
    const params = new URLSearchParams({ range });
    if (custom) {
      params.set('from', custom.from);
      params.set('to', custom.to);
    }
    return authClient.get<DashboardStats>(`/analytics/dashboard?${params.toString()}`);
  },
};
