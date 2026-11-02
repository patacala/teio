import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, DataSource } from 'typeorm';
import { AnalyticsEventEntity } from './analytics-event.entity';

export interface TrackEventDto {
  event_type: string;
  actor_id?: string;
  actor_type?: string;
  resource_id?: string;
  resource_type?: string;
  properties?: Record<string, unknown>;
}

export interface DateRangeQuery {
  from: Date;
  to: Date;
}

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
  stage_type: string;
  is_terminal: boolean;
}

export interface ChannelRoiEntry {
  channel: string;
  conversations: number;
  paid_amount: number;
  paid_count: number;
  avg_payment_amount: number;
}

export interface RevenueStats {
  paid_amount: number; // cents, current period, status='paid'
  paid_count: number;
  pending_amount: number; // cents, current period, status='pending'
  pending_count: number;
  at_risk_amount: number; // cents, pending checkouts older than 24h
  at_risk_count: number;
  lost_amount: number; // cents, current period, status in (expired,failed,canceled)
  lost_count: number;
  ai_assisted_amount: number; // cents, paid revenue from bot-active conversations
  ai_assisted_count: number;
  currency: string;
  trend: TrendData; // paid_amount vs previous period
}

export interface UpcomingAppointments {
  count: number; // within the selected range, from now forward
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
  booking_conversion_rate: number; // % of period conversations that led to a customer appointment
  show_rate: number; // % of period appointments completed vs completed/no-show/cancelled
  unanswered_leads: number; // open conversations with inbound messages still awaiting outbound response
  appointment_cancellation_rate: number; // % of period appointments with status='cancelled'
  appointments_with_deposit_rate: number; // % of period appointments linked to a paid payment
  appointments_upcoming: UpcomingAppointments;
  needs_attention: AttentionItem[];
  contact_reasons: ContactReasonCount[];
}

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(
    @InjectRepository(AnalyticsEventEntity)
    private readonly eventRepo: Repository<AnalyticsEventEntity>,
    private readonly dataSource: DataSource,
  ) {}

  async track(organizationId: string, dto: TrackEventDto): Promise<AnalyticsEventEntity> {
    const event = this.eventRepo.create({
      organization_id: organizationId,
      event_type: dto.event_type,
      actor_id: dto.actor_id,
      actor_type: dto.actor_type,
      resource_id: dto.resource_id,
      resource_type: dto.resource_type,
      properties: dto.properties ?? {},
    });
    return this.eventRepo.save(event);
  }

  async getEvents(
    organizationId: string,
    range: DateRangeQuery,
    eventType?: string,
  ): Promise<AnalyticsEventEntity[]> {
    const where: Record<string, unknown> = {
      organization_id: organizationId,
      occurred_at: Between(range.from, range.to),
    };
    if (eventType) where['event_type'] = eventType;

    return this.eventRepo.find({
      where,
      order: { occurred_at: 'DESC' },
      take: 500,
    });
  }

  async getDashboardStats(
    organizationId: string,
    range: DashboardRange = '30d',
    customFrom?: Date,
    customTo?: Date,
  ): Promise<DashboardStats> {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    // Custom date range: end-of-day on `to`, and the previous period is the same
    // number of days immediately before `from` (for the trend comparison).
    let now: Date;
    let rangeStart: Date;
    let days: number;
    if (customFrom && customTo) {
      now = new Date(customTo);
      now.setHours(23, 59, 59, 999);
      rangeStart = new Date(customFrom);
      rangeStart.setHours(0, 0, 0, 0);
      days = Math.max(1, Math.round((now.getTime() - rangeStart.getTime()) / 86_400_000));
    } else {
      now = new Date();
      days = range === '7d' ? 7 : range === '90d' ? 90 : 30;
      rangeStart = new Date();
      rangeStart.setDate(rangeStart.getDate() - days);
    }

    const prevStart = new Date(rangeStart);
    prevStart.setDate(prevStart.getDate() - days);

    // Upcoming Appointments always looks 7 days ahead, independent of the
    // dashboard's history filter.
    const UPCOMING_WINDOW_DAYS = 7;
    const upcomingWindowEnd = new Date();
    upcomingWindowEnd.setDate(upcomingWindowEnd.getDate() + UPCOMING_WINDOW_DAYS);

    // ── Run max 5 parallel queries (pool_size=15, leave headroom) ──
    const [
      countsRow,
      volumeResults,
      channelAndAiRows,
      responseRows,
      funnelRows,
      unansweredRows,
      channelRoiRows,
    ] = await Promise.all([
      this.dataSource.query(
        `SELECT
           -- Snapshots
           COUNT(*) FILTER (WHERE src = 'conv_open') AS open_conversations,
           COUNT(*) FILTER (WHERE src = 'contacts_all') AS total_contacts,
           -- Current period
           COUNT(*) FILTER (WHERE src = 'calls_cur') AS calls_current,
           COUNT(*) FILTER (WHERE src = 'msgs_cur') AS msgs_current,
           COUNT(*) FILTER (WHERE src = 'ai_conv_cur') AS ai_handled_current,
           COUNT(*) FILTER (WHERE src = 'conv_cur') AS total_conv_current,
           COUNT(*) FILTER (WHERE src = 'contacts_cur') AS contacts_current,
           -- Previous period
           COUNT(*) FILTER (WHERE src = 'calls_prev') AS calls_prev,
           COUNT(*) FILTER (WHERE src = 'msgs_prev') AS msgs_prev,
           COUNT(*) FILTER (WHERE src = 'ai_conv_prev') AS ai_handled_prev,
           COUNT(*) FILTER (WHERE src = 'conv_prev') AS total_conv_prev,
           COUNT(*) FILTER (WHERE src = 'contacts_prev') AS contacts_prev,
           -- Today
           COUNT(*) FILTER (WHERE src = 'contacts_today') AS new_contacts_today,
           COUNT(*) FILTER (WHERE src = 'msgs_today') AS messages_today,
           -- Revenue (current period)
           COUNT(*) FILTER (WHERE src = 'pay_paid_cur') AS payments_paid_current,
           COALESCE(SUM(amount) FILTER (WHERE src = 'pay_paid_cur'), 0) AS revenue_paid_current,
           MAX(currency) FILTER (WHERE src = 'pay_paid_cur') AS revenue_currency,
           COUNT(*) FILTER (WHERE src = 'pay_pending_cur') AS payments_pending_current,
           COALESCE(SUM(amount) FILTER (WHERE src = 'pay_pending_cur'), 0) AS revenue_pending_current,
           COUNT(*) FILTER (WHERE src = 'pay_at_risk') AS payments_at_risk,
           COALESCE(SUM(amount) FILTER (WHERE src = 'pay_at_risk'), 0) AS revenue_at_risk,
           COUNT(*) FILTER (WHERE src = 'pay_lost_cur') AS payments_lost_current,
           COALESCE(SUM(amount) FILTER (WHERE src = 'pay_lost_cur'), 0) AS revenue_lost_current,
           COUNT(*) FILTER (WHERE src = 'pay_ai_cur') AS payments_ai_assisted_current,
           COALESCE(SUM(amount) FILTER (WHERE src = 'pay_ai_cur'), 0) AS revenue_ai_assisted_current,
           -- Revenue (previous period, for trend)
           COALESCE(SUM(amount) FILTER (WHERE src = 'pay_paid_prev'), 0) AS revenue_paid_prev,
           -- Appointments (current period)
           COUNT(*) FILTER (WHERE src = 'appt_cur') AS appointments_current,
           COUNT(*) FILTER (WHERE src = 'appt_cancelled_cur') AS appointments_cancelled_current,
           COUNT(*) FILTER (WHERE src = 'appt_completed_cur') AS appointments_completed_current,
           COUNT(*) FILTER (WHERE src = 'appt_no_show_cur') AS appointments_no_show_current,
           COUNT(*) FILTER (WHERE src = 'appt_deposit_cur') AS appointments_with_deposit_current,
           COUNT(*) FILTER (WHERE src = 'appt_upcoming') AS appointments_upcoming_count
         FROM (
           SELECT 'conv_open' AS src, 0::bigint AS amount, NULL::text AS currency FROM conversations.conversations WHERE organization_id = $1 AND status = 'open'
           UNION ALL
           SELECT 'contacts_all', 0, NULL FROM clients.contacts WHERE organization_id = $1
           UNION ALL
           SELECT 'calls_cur', 0, NULL FROM voice.calls WHERE organization_id = $1 AND created_at >= $2 AND created_at <= $6
           UNION ALL
           SELECT 'calls_prev', 0, NULL FROM voice.calls WHERE organization_id = $1 AND created_at >= $3 AND created_at < $2
           UNION ALL
           SELECT 'msgs_cur', 0, NULL FROM conversations.messages WHERE organization_id = $1 AND created_at >= $2 AND created_at <= $6
           UNION ALL
           SELECT 'msgs_prev', 0, NULL FROM conversations.messages WHERE organization_id = $1 AND created_at >= $3 AND created_at < $2
           UNION ALL
           SELECT 'msgs_today', 0, NULL FROM conversations.messages WHERE organization_id = $1 AND created_at >= $4
           UNION ALL
           SELECT 'ai_conv_cur', 0, NULL FROM conversations.conversations WHERE organization_id = $1 AND bot_active = true AND created_at >= $2 AND created_at <= $6
           UNION ALL
           SELECT 'ai_conv_prev', 0, NULL FROM conversations.conversations WHERE organization_id = $1 AND bot_active = true AND created_at >= $3 AND created_at < $2
           UNION ALL
           SELECT 'conv_cur', 0, NULL FROM conversations.conversations WHERE organization_id = $1 AND created_at >= $2 AND created_at <= $6
           UNION ALL
           SELECT 'conv_prev', 0, NULL FROM conversations.conversations WHERE organization_id = $1 AND created_at >= $3 AND created_at < $2
           UNION ALL
           SELECT 'contacts_cur', 0, NULL FROM clients.contacts WHERE organization_id = $1 AND created_at >= $2 AND created_at <= $6
           UNION ALL
           SELECT 'contacts_prev', 0, NULL FROM clients.contacts WHERE organization_id = $1 AND created_at >= $3 AND created_at < $2
           UNION ALL
           SELECT 'contacts_today', 0, NULL FROM clients.contacts WHERE organization_id = $1 AND created_at >= $4
           UNION ALL
           SELECT 'pay_paid_cur', amount, currency FROM payments.payments WHERE organization_id = $1 AND status = 'paid' AND paid_at >= $2 AND paid_at <= $6
           UNION ALL
           SELECT 'pay_pending_cur', amount, currency FROM payments.payments WHERE organization_id = $1 AND status = 'pending' AND created_at >= $2 AND created_at <= $6
           UNION ALL
           SELECT 'pay_at_risk', amount, currency FROM payments.payments WHERE organization_id = $1 AND status = 'pending' AND created_at < NOW() - INTERVAL '24 hours'
           UNION ALL
           SELECT 'pay_lost_cur', amount, NULL FROM payments.payments WHERE organization_id = $1 AND status IN ('expired', 'failed', 'canceled') AND created_at >= $2 AND created_at <= $6
           UNION ALL
           SELECT 'pay_ai_cur', p.amount, p.currency
             FROM payments.payments p
             INNER JOIN conversations.conversations conv ON conv.id = p.conversation_id AND conv.organization_id = $1
            WHERE p.organization_id = $1 AND p.status = 'paid' AND p.paid_at >= $2 AND p.paid_at <= $6 AND conv.bot_active = true
           UNION ALL
           SELECT 'pay_paid_prev', amount, NULL FROM payments.payments WHERE organization_id = $1 AND status = 'paid' AND paid_at >= $3 AND paid_at < $2
           UNION ALL
           -- action IS NULL on all three: same Follow-up Engine bookkeeping
           -- exclusion as appt_upcoming below — without it, an active
           -- contact's dozens of auto-created/auto-cancelled "no_response"
           -- reminders (see appt_upcoming's comment) swamp real customer
           -- appointments in both the total and the cancellation rate.
           SELECT 'appt_cur', 0, NULL FROM scheduling.appointments WHERE organization_id = $1 AND created_at >= $2 AND created_at <= $6 AND action IS NULL
           UNION ALL
           SELECT 'appt_cancelled_cur', 0, NULL FROM scheduling.appointments WHERE organization_id = $1 AND created_at >= $2 AND created_at <= $6 AND status = 'cancelled' AND action IS NULL
           UNION ALL
           SELECT 'appt_completed_cur', 0, NULL FROM scheduling.appointments WHERE organization_id = $1 AND created_at >= $2 AND created_at <= $6 AND status = 'completed' AND action IS NULL
           UNION ALL
           SELECT 'appt_no_show_cur', 0, NULL FROM scheduling.appointments WHERE organization_id = $1 AND created_at >= $2 AND created_at <= $6 AND status = 'no_show' AND action IS NULL
           UNION ALL
           SELECT 'appt_deposit_cur', 0, NULL FROM scheduling.appointments a WHERE a.organization_id = $1 AND a.created_at >= $2 AND a.created_at <= $6 AND a.action IS NULL
             AND EXISTS (SELECT 1 FROM payments.payments p WHERE p.appointment_id = a.id AND p.status = 'paid')
           UNION ALL
           -- action IS NULL excludes the Follow-up Engine's own bookkeeping
           -- rows (e.g. "Sequence: no_response #3") — those are internal
           -- reminders the engine schedules for itself, not customer-facing
           -- appointments, and this card is captioned "Upcoming Appointments".
           SELECT 'appt_upcoming', 0, NULL FROM scheduling.appointments WHERE organization_id = $1
             AND starts_at >= NOW() AND starts_at <= $5 AND status != 'cancelled' AND action IS NULL
         ) sub`,
        [organizationId, rangeStart, prevStart, todayStart, upcomingWindowEnd, now],
      ),

      this.dataSource.query(
        `SELECT d.date,
                COALESCE(m.count, 0)::int AS messages,
                COALESCE(c.count, 0)::int AS calls,
                COALESCE(a.count, 0)::int AS ai_handled
         FROM generate_series($2::date, $3::date, '1 day') AS d(date)
         LEFT JOIN (
           SELECT DATE(created_at) AS date, COUNT(*) AS count
           FROM conversations.messages WHERE organization_id = $1 AND created_at >= $2
           GROUP BY DATE(created_at)
         ) m ON m.date = d.date
         LEFT JOIN (
           SELECT DATE(created_at) AS date, COUNT(*) AS count
           FROM voice.calls WHERE organization_id = $1 AND created_at >= $2
           GROUP BY DATE(created_at)
         ) c ON c.date = d.date
         LEFT JOIN (
           SELECT DATE(msg.created_at) AS date, COUNT(*) AS count
           FROM conversations.messages msg
           INNER JOIN conversations.conversations conv ON conv.id = msg.conversation_id
           WHERE msg.organization_id = $1 AND msg.created_at >= $2
             AND msg.direction = 'outbound' AND conv.bot_active = true
           GROUP BY DATE(msg.created_at)
         ) a ON a.date = d.date
         ORDER BY d.date ASC`,
        [organizationId, rangeStart, now],
      ),

      this.dataSource.query(
        `SELECT 'channel' AS qtype, channel AS label, COUNT(*)::int AS count, 0 AS position
         FROM conversations.conversations
         WHERE organization_id = $1 AND status = 'open'
         GROUP BY channel
         UNION ALL
         SELECT 'ai_resolved', 'Resolved', COUNT(*)::int, 1
         FROM conversations.conversations
         WHERE organization_id = $1 AND created_at >= $2 AND created_at <= $3 AND bot_active = true AND status = 'resolved'
         UNION ALL
         SELECT 'ai_escalated', 'Escalated', COUNT(*)::int, 2
         FROM conversations.conversations
         WHERE organization_id = $1 AND created_at >= $2 AND created_at <= $3 AND bot_active = true AND assigned_agent_id IS NOT NULL AND status != 'resolved'
         UNION ALL
         SELECT 'ai_active', 'Active', COUNT(*)::int, 3
         FROM conversations.conversations
         WHERE organization_id = $1 AND created_at >= $2 AND created_at <= $3 AND bot_active = true
           AND status = 'open' AND assigned_agent_id IS NULL
           AND (last_message_at >= NOW() - INTERVAL '48 hours' OR last_message_at IS NULL)`,
        [organizationId, rangeStart, now],
      ),

      this.dataSource.query(
        `WITH rt AS (
           SELECT EXTRACT(HOUR FROM m.sent_at)::int AS hour_of_day,
                  EXTRACT(EPOCH FROM (
                    (SELECT MIN(r.sent_at) FROM conversations.messages r
                     WHERE r.conversation_id = m.conversation_id
                       AND r.direction = 'outbound'
                       AND r.sent_at > m.sent_at
                       AND r.organization_id = $1)
                    - m.sent_at
                  )) AS response_time
           FROM conversations.messages m
           WHERE m.organization_id = $1
             AND m.direction = 'inbound'
             AND m.sent_at >= $2
             AND m.sent_at <= $3
             AND m.sender_type != 'system'
         )
         SELECT 'avg' AS qtype, NULL::int AS hour_of_day, AVG(response_time)::int AS avg_seconds
         FROM rt WHERE response_time IS NOT NULL AND response_time > 0 AND response_time < 86400
         UNION ALL
         SELECT 'hourly', hour_of_day, AVG(response_time)::int
         FROM rt WHERE response_time IS NOT NULL AND response_time > 0 AND response_time < 86400
         GROUP BY hour_of_day
         ORDER BY hour_of_day ASC NULLS FIRST`,
        [organizationId, rangeStart, now],
      ),

      this.dataSource.query(
        `SELECT fs.name AS stage, fs.stage_type, fs.is_terminal,
                COUNT(DISTINCT c.id)::int AS count, fs.position
         FROM clients.contacts c
         INNER JOIN clients.funnel_stages fs ON c.lead_stage = fs.id::text AND fs.organization_id = $1
         WHERE c.organization_id = $1
         GROUP BY fs.name, fs.stage_type, fs.is_terminal, fs.position
         ORDER BY fs.position ASC`,
        [organizationId],
      ),

      this.dataSource.query(
        `WITH inbound AS (
           SELECT DISTINCT ON (m.conversation_id) m.conversation_id, m.sent_at
             FROM conversations.messages m
             INNER JOIN conversations.conversations conv ON conv.id = m.conversation_id
            WHERE m.organization_id = $1
              AND m.direction = 'inbound'
              AND m.sent_at >= $2
              AND m.sent_at <= $3
              AND conv.status = 'open'
            ORDER BY m.conversation_id, m.sent_at DESC
         )
         SELECT COUNT(*)::int AS unanswered_leads
           FROM inbound i
          WHERE NOT EXISTS (
            SELECT 1
              FROM conversations.messages r
             WHERE r.organization_id = $1
               AND r.conversation_id = i.conversation_id
               AND r.direction = 'outbound'
               AND r.sent_at > i.sent_at
          )`,
        [organizationId, rangeStart, now],
      ),

      this.dataSource.query(
        `WITH conv AS (
           SELECT id, channel
             FROM conversations.conversations
            WHERE organization_id = $1
         ),
         paid AS (
           SELECT conv.channel,
                  COUNT(p.id)::int AS paid_count,
                  COALESCE(SUM(p.amount), 0)::bigint AS paid_amount
             FROM payments.payments p
             INNER JOIN conv ON conv.id = p.conversation_id
            WHERE p.organization_id = $1
              AND p.status = 'paid'
              AND p.paid_at >= $2
              AND p.paid_at <= $3
            GROUP BY conv.channel
         )
         SELECT conv.channel,
                COUNT(conv.id)::int AS conversations,
                COALESCE(paid.paid_amount, 0)::int AS paid_amount,
                COALESCE(paid.paid_count, 0)::int AS paid_count
           FROM conv
           LEFT JOIN paid ON paid.channel = conv.channel
          GROUP BY conv.channel, paid.paid_amount, paid.paid_count
          ORDER BY paid_amount DESC, conversations DESC`,
        [organizationId, rangeStart, now],
      ),
    ]);

    const nextApptRows = await this.dataSource.query(
      `SELECT a.starts_at, a.timezone,
              COALESCE(NULLIF(TRIM(ct.first_name || ' ' || COALESCE(ct.last_name, '')), ''), 'Anonymous') AS contact_name
         FROM scheduling.appointments a
         LEFT JOIN clients.contacts ct ON ct.id = a.contact_id
        WHERE a.organization_id = $1 AND a.starts_at >= NOW() AND a.status != 'cancelled' AND a.action IS NULL
        ORDER BY a.starts_at ASC
        LIMIT 1`,
      [organizationId],
    );

    const attentionRows = await this.dataSource.query(
      `SELECT g.contact_id,
              (array_agg(g.contact_name ORDER BY g.sort_time))[1] AS contact_name,
              array_agg(g.kind ORDER BY g.sort_time) AS kinds,
              array_agg(g.subtitle ORDER BY g.sort_time) AS subtitles,
              array_agg(g.badge ORDER BY g.sort_time) AS badges,
              (CASE WHEN bool_or(g.urgency = 'critical') THEN 'critical' ELSE 'warning' END) AS urgency,
              MIN(g.sort_time) AS sort_time,
              MAX(c.custom_fields->>'service_needed') AS interested_service
         FROM (
           SELECT 'hot_lead' AS kind, c.id AS contact_id,
                  COALESCE(NULLIF(TRIM(c.first_name || ' ' || COALESCE(c.last_name, '')), ''), 'Anonymous') AS contact_name,
                  'High-intent, gone quiet' AS subtitle,
                  ('Score ' || c.lead_score) AS badge,
                  'critical' AS urgency,
                  COALESCE(c.last_contacted_at, c.created_at) AS sort_time
             FROM clients.contacts c
            WHERE c.organization_id = $1 AND c.lead_score >= 70
              AND (c.last_contacted_at IS NULL OR c.last_contacted_at < NOW() - INTERVAL '24 hours')

           UNION ALL

           SELECT 'stale_payment', p.contact_id,
                  COALESCE(NULLIF(TRIM(ct.first_name || ' ' || COALESCE(ct.last_name, '')), ''), 'Anonymous'),
                  'Checkout sent, not paid',
                  ('$' || ROUND(p.amount / 100.0)::text),
                  'warning',
                  p.created_at
             FROM payments.payments p
             LEFT JOIN clients.contacts ct ON ct.id = p.contact_id
            WHERE p.organization_id = $1 AND p.status = 'pending' AND p.created_at < NOW() - INTERVAL '24 hours'

           UNION ALL

           SELECT 'unconfirmed_appt', a.contact_id,
                  COALESCE(NULLIF(TRIM(ct2.first_name || ' ' || COALESCE(ct2.last_name, '')), ''), 'Anonymous'),
                  'Appointment needs confirmation',
                  TO_CHAR(a.starts_at, 'Mon DD, HH12:MI AM'),
                  'warning',
                  a.starts_at
             FROM scheduling.appointments a
             LEFT JOIN clients.contacts ct2 ON ct2.id = a.contact_id
            WHERE a.organization_id = $1 AND a.status = 'pending' AND a.action IS NULL
              AND a.starts_at BETWEEN NOW() AND NOW() + INTERVAL '48 hours'
         ) g
         LEFT JOIN clients.contacts c ON c.id = g.contact_id
        GROUP BY g.contact_id
        ORDER BY urgency ASC, sort_time ASC
        LIMIT 8`,
      [organizationId],
    );

    const reasonRows = await this.dataSource.query(
      `SELECT COALESCE(NULLIF(custom_fields->>'service_needed', ''), 'Not specified') AS reason,
              COUNT(*)::int AS count
         FROM clients.contacts
        WHERE organization_id = $1
          AND custom_fields->>'service_needed' IS NOT NULL
        GROUP BY custom_fields->>'service_needed'
        ORDER BY count DESC
        LIMIT 10`,
      [organizationId],
    );

    const c = countsRow[0] ?? {};
    const pi = (v: unknown) => parseInt(String(v ?? '0'), 10);

    const openConversations = pi(c.open_conversations);
    const totalContacts = pi(c.total_contacts);
    const callsCurrent = pi(c.calls_current);
    const callsPrev = pi(c.calls_prev);
    const msgsCurrent = pi(c.msgs_current);
    const msgsPrev = pi(c.msgs_prev);
    const aiCurrent = pi(c.ai_handled_current);
    const aiPrev = pi(c.ai_handled_prev);
    const totalConvCurrent = pi(c.total_conv_current);
    const totalConvPrev = pi(c.total_conv_prev);
    const contactsCurrent = pi(c.contacts_current);
    const contactsPrev = pi(c.contacts_prev);
    const newContactsToday = pi(c.new_contacts_today);
    const messagesToday = pi(c.messages_today);

    const paymentsPaidCurrent = pi(c.payments_paid_current);
    const revenuePaidCurrent = pi(c.revenue_paid_current);
    const revenueCurrency = (c.revenue_currency as string | null) ?? 'usd';
    const paymentsPendingCurrent = pi(c.payments_pending_current);
    const revenuePendingCurrent = pi(c.revenue_pending_current);
    const paymentsAtRisk = pi(c.payments_at_risk);
    const revenueAtRisk = pi(c.revenue_at_risk);
    const paymentsLostCurrent = pi(c.payments_lost_current);
    const revenueLostCurrent = pi(c.revenue_lost_current);
    const paymentsAiAssistedCurrent = pi(c.payments_ai_assisted_current);
    const revenueAiAssistedCurrent = pi(c.revenue_ai_assisted_current);
    const revenuePaidPrev = pi(c.revenue_paid_prev);

    const appointmentsCurrent = pi(c.appointments_current);
    const appointmentsCancelledCurrent = pi(c.appointments_cancelled_current);
    const appointmentsCompletedCurrent = pi(c.appointments_completed_current);
    const appointmentsNoShowCurrent = pi(c.appointments_no_show_current);
    const appointmentsWithDepositCurrent = pi(c.appointments_with_deposit_current);
    const appointmentsUpcomingCount = pi(c.appointments_upcoming_count);

    const aiRateCurrent = totalConvCurrent > 0 ? Math.round((aiCurrent / totalConvCurrent) * 100) : 0;
    const aiRatePrev = totalConvPrev > 0 ? Math.round((aiPrev / totalConvPrev) * 100) : 0;

    const messagingVolume: MessagingVolumePoint[] = (volumeResults as Array<{ date: Date; messages: number; calls: number; ai_handled: number }>)
      .map((r) => ({
        date: r.date instanceof Date ? r.date.toISOString().slice(0, 10) : String(r.date),
        messages: Number(r.messages),
        calls: Number(r.calls),
        ai_handled: Number(r.ai_handled),
      }));

    // ── Channel distribution + AI performance ──
    const channelDistribution: Array<{ channel: string; count: number }> = [];
    let resolvedByAi = 0;
    let escalated = 0;
    let aiActive = 0;

    for (const row of channelAndAiRows as Array<{ qtype: string; label: string; count: number }>) {
      if (row.qtype === 'channel') {
        channelDistribution.push({ channel: row.label, count: Number(row.count) });
      } else if (row.qtype === 'ai_resolved') {
        resolvedByAi = Number(row.count);
      } else if (row.qtype === 'ai_escalated') {
        escalated = Number(row.count);
      } else if (row.qtype === 'ai_active') {
        aiActive = Number(row.count);
      }
    }
    channelDistribution.sort((a, b) => b.count - a.count);

    const aiTotal = resolvedByAi + escalated + aiActive;
    const aiPerformance: AiPerformanceEntry[] = aiTotal > 0
      ? [
          { metric: 'Resolved', value: Math.round((resolvedByAi / aiTotal) * 100) },
          { metric: 'Escalated', value: Math.round((escalated / aiTotal) * 100) },
          { metric: 'Active', value: Math.round((aiActive / aiTotal) * 100) },
        ]
      : [
          { metric: 'Resolved', value: 0 },
          { metric: 'Escalated', value: 0 },
          { metric: 'Active', value: 0 },
        ];

    let avgResponseSeconds: number | null = null;
    const hourLabels = ['12am','1am','2am','3am','4am','5am','6am','7am','8am','9am','10am','11am',
                        '12pm','1pm','2pm','3pm','4pm','5pm','6pm','7pm','8pm','9pm','10pm','11pm'];
    const responseTimeByHour: ResponseTimePoint[] = [];

    for (const row of responseRows as Array<{ qtype: string; hour_of_day: number | null; avg_seconds: number | null }>) {
      if (row.qtype === 'avg' && row.avg_seconds != null) {
        avgResponseSeconds = Math.round(Number(row.avg_seconds));
      } else if (row.qtype === 'hourly' && row.hour_of_day != null && row.avg_seconds != null) {
        responseTimeByHour.push({
          hour: hourLabels[row.hour_of_day] ?? `${row.hour_of_day}h`,
          avg: Math.round(Number(row.avg_seconds)),
        });
      }
    }

    const funnelConversion: FunnelStageCount[] = (funnelRows as Array<{
      stage: string; count: number; position: number; stage_type: string; is_terminal: boolean;
    }>).map((r) => ({
      stage: r.stage,
      count: Number(r.count),
      position: r.position,
      stage_type: r.stage_type,
      is_terminal: Boolean(r.is_terminal),
    }));

    const unansweredLeads = pi((unansweredRows as Array<{ unanswered_leads: number }>)[0]?.unanswered_leads);
    const channelRoi: ChannelRoiEntry[] = (channelRoiRows as Array<{
      channel: string; conversations: number; paid_amount: number; paid_count: number;
    }>).map((r) => {
      const paidAmount = Number(r.paid_amount);
      const paidCount = Number(r.paid_count);
      return {
        channel: r.channel,
        conversations: Number(r.conversations),
        paid_amount: paidAmount,
        paid_count: paidCount,
        avg_payment_amount: paidCount > 0 ? Math.round(paidAmount / paidCount) : 0,
      };
    });

    const nextAppt = (nextApptRows as Array<{ starts_at: Date; contact_name: string; timezone: string | null }>)[0];
    const appointmentsUpcoming: UpcomingAppointments = {
      count: appointmentsUpcomingCount,
      range_days: UPCOMING_WINDOW_DAYS,
      next: nextAppt
        ? {
            contact_name: nextAppt.contact_name,
            starts_at: nextAppt.starts_at instanceof Date ? nextAppt.starts_at.toISOString() : String(nextAppt.starts_at),
            timezone: nextAppt.timezone,
          }
        : null,
    };

    const needsAttention: AttentionItem[] = (attentionRows as Array<{
      contact_id: string; contact_name: string; kinds: AttentionReason['kind'][]; subtitles: string[]; badges: string[];
      urgency: AttentionItem['urgency']; interested_service: string | null;
    }>).map((r) => ({
      contact_id: r.contact_id,
      contact_name: r.contact_name,
      interested_service: r.interested_service || null,
      urgency: r.urgency,
      reasons: r.kinds.map((kind, i) => ({ kind, subtitle: r.subtitles[i], badge: r.badges[i] })),
    }));

    const contactReasons: ContactReasonCount[] = (reasonRows as Array<{ reason: string; count: number }>)
      .map((r) => ({ reason: r.reason, count: Number(r.count) }));

    return {
      open_conversations: openConversations,
      total_contacts: totalContacts,
      calls_period: callsCurrent,
      ai_resolution_rate: aiRateCurrent,
      new_contacts_today: newContactsToday,
      messages_today: messagesToday,
      messages_period: msgsCurrent,
      ai_handled_today: aiCurrent,
      new_contacts_period: contactsCurrent,
      ai_handled_period: aiCurrent,
      avg_response_time_seconds: avgResponseSeconds,
      trends: {
        conversations: this.computeTrend(msgsCurrent, msgsPrev),
        contacts: this.computeTrend(contactsCurrent, contactsPrev),
        calls: this.computeTrend(callsCurrent, callsPrev),
        ai_rate: this.computeTrend(aiRateCurrent, aiRatePrev),
      },
      messaging_volume: messagingVolume,
      channel_distribution: channelDistribution,
      ai_performance: aiPerformance,
      response_time_by_hour: responseTimeByHour,
      funnel_conversion: funnelConversion,
      channel_roi: channelRoi,
      revenue: {
        paid_amount: revenuePaidCurrent,
        paid_count: paymentsPaidCurrent,
        pending_amount: revenuePendingCurrent,
        pending_count: paymentsPendingCurrent,
        at_risk_amount: revenueAtRisk,
        at_risk_count: paymentsAtRisk,
        lost_amount: revenueLostCurrent,
        lost_count: paymentsLostCurrent,
        ai_assisted_amount: revenueAiAssistedCurrent,
        ai_assisted_count: paymentsAiAssistedCurrent,
        currency: revenueCurrency,
        trend: this.computeTrend(revenuePaidCurrent, revenuePaidPrev),
      },
      booking_conversion_rate: totalConvCurrent > 0
        ? Math.round((appointmentsCurrent / totalConvCurrent) * 100)
        : 0,
      show_rate: (appointmentsCompletedCurrent + appointmentsNoShowCurrent + appointmentsCancelledCurrent) > 0
        ? Math.round((appointmentsCompletedCurrent / (appointmentsCompletedCurrent + appointmentsNoShowCurrent + appointmentsCancelledCurrent)) * 100)
        : 0,
      unanswered_leads: unansweredLeads,
      appointment_cancellation_rate: appointmentsCurrent > 0
        ? Math.round((appointmentsCancelledCurrent / appointmentsCurrent) * 100)
        : 0,
      appointments_with_deposit_rate: appointmentsCurrent > 0
        ? Math.round((appointmentsWithDepositCurrent / appointmentsCurrent) * 100)
        : 0,
      appointments_upcoming: appointmentsUpcoming,
      needs_attention: needsAttention,
      contact_reasons: contactReasons,
    };
  }

  private computeTrend(current: number, previous: number): TrendData {
    let percentage = 0;
    if (previous > 0) {
      percentage = Math.round(((current - previous) / previous) * 100);
    } else if (current > 0) {
      percentage = 100;
    }
    return { current, previous, percentage };
  }

  async getEventCounts(
    organizationId: string,
    range: DateRangeQuery,
  ): Promise<{ event_type: string; count: string }[]> {
    return this.eventRepo
      .createQueryBuilder('e')
      .select('e.event_type', 'event_type')
      .addSelect('COUNT(*)', 'count')
      .where('e.organization_id = :orgId', { orgId: organizationId })
      .andWhere('e.occurred_at BETWEEN :from AND :to', { from: range.from, to: range.to })
      .groupBy('e.event_type')
      .orderBy('count', 'DESC')
      .getRawMany();
  }
}
