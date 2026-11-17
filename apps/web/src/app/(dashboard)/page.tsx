'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useDashboardStats } from '@/hooks/useDashboardStats';
import { useBillingViewer } from '@/components/billing/use-billing-viewer';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import {
  Users,
  Phone,
  Bot,
  TrendingUp,
  ArrowRight,
  Clock,
  DollarSign,
  CalendarClock,
  Flame,
  CheckCircle2,
  AlertTriangle,
  CalendarCheck,
  MessageCircle,
  MessageSquare,
  Radio,
} from 'lucide-react';
import {
  AreaChart, Area, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts';
import type { DashboardRange, CustomDateRange, FunnelStageCount } from '@/services/analytics.service';
import { AttentionRow } from '@/components/dashboard/attention-row';
import { formatDateShort, fromISODate } from '@/components/dashboard/dates';
import { formatMoney } from '@/components/dashboard/format';
import { FunnelPipeline } from '@/components/dashboard/funnel-pipeline';
import { CustomRangePicker, RangeSelector } from '@/components/dashboard/range-picker';
import { EmptyChart, HeaderLink, SectionHeader } from '@/components/dashboard/section-header';
import { StatCard } from '@/components/dashboard/stat-card';
import {
  CHART_COLORS,
  CHART_MUTED,
  CHART_SEGMENT_STROKE,
  CHART_SERIES,
  chartAxisProps,
  chartGridProps,
  chartTooltipCursor,
  chartTooltipItemStyle,
  chartTooltipLabelStyle,
  chartTooltipStyle,
} from '@/lib/chart-theme';

// ── Shared chart style ───────────────────────────────────────────────────────
const TOOLTIP_PROPS = {
  contentStyle: chartTooltipStyle,
  labelStyle: chartTooltipLabelStyle,
  itemStyle: chartTooltipItemStyle,
};

const AI_COLORS: Record<string, string> = {
  Resolved: CHART_COLORS.lime,
  Escalated: CHART_COLORS.yellow,
  Active: CHART_COLORS.cyan,
};

const MESSAGING_SERIES = [
  { key: 'messages', name: 'Messages', color: CHART_COLORS.lime },
  { key: 'ai_handled', name: 'AI Handled', color: CHART_COLORS.purple },
  { key: 'calls', name: 'Calls', color: CHART_COLORS.cyan },
] as const;


// ── Funnel: open stages vs closed outcomes ───────────────────────────────────
function outcomeKind(stage: FunnelStageCount): 'won' | 'lost' | null {
  const type = stage.stage_type?.toLowerCase();
  if (type === 'won' || type === 'lost') return type;
  const name = stage.stage.trim().toLowerCase();
  if (name === 'won' || name === 'lost') return name;
  return null;
}


function toFunnel(stages: FunnelStageCount[]) {
  return {
    steps: stages
      .filter((stage) => outcomeKind(stage) === null)
      .map((stage) => ({ key: stage.stage, label: stage.stage, count: stage.count })),
    outcomes: {
      won: stages.filter((stage) => outcomeKind(stage) === 'won').reduce((sum, stage) => sum + stage.count, 0),
      lost: stages.filter((stage) => outcomeKind(stage) === 'lost').reduce((sum, stage) => sum + stage.count, 0),
    },
  };
}

// ── Format seconds to human readable ─────────────────────────────────────────
function formatResponseTime(seconds: number | null): string {
  if (seconds === null) return '—';
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m < 60) return s > 0 ? `${m}m ${s}s` : `${m}m`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return rm > 0 ? `${h}h ${rm}m` : `${h}h`;
}

function formatResponseTimeMinutes(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  return `${(seconds / 60).toFixed(1)}m`;
}

// ── Main page ────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const [range, setRange] = useState<DashboardRange>('30d');
  const [customRange, setCustomRange] = useState<CustomDateRange | null>(null);
  // A platform admin who is not inside an organization has the platform overview
  // as home. Nothing is loaded until we know who is looking (the current user
  // arrives a moment after the first render).
  const { platformMode, currentUser } = useBillingViewer();
  const router = useRouter();
  const { data: stats, isPending: statsLoading } = useDashboardStats(
    range,
    customRange ?? undefined,
    !!currentUser && !platformMode,
  );

  useEffect(() => {
    if (platformMode) router.replace('/platform');
  }, [platformMode, router]);

  if (platformMode) return null;

  const trends = stats?.trends;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-primary">Dashboard</h1>
          <p className="text-muted text-xs mt-0.5">Overview of your CRM activity</p>
        </div>
        <div className="flex items-center gap-2">
          <RangeSelector
            value={range}
            isCustom={!!customRange}
            onChange={(r) => { setRange(r); setCustomRange(null); }}
          />
          <CustomRangePicker
            active={customRange}
            onApply={setCustomRange}
            onClear={() => setCustomRange(null)}
          />
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          variant="metric"
          label="Revenue Collected"
          value={formatMoney(stats?.revenue.paid_amount, stats?.revenue.currency)}
          icon={<DollarSign className="h-4 w-4 text-accent" />}
          trend={stats?.revenue.trend.percentage}
          loading={statsLoading}
          footer={
            <p className="truncate">
              {formatMoney(stats?.revenue.pending_amount, stats?.revenue.currency)} pending
              {' · '}
              {formatMoney(stats?.revenue.ai_assisted_amount, stats?.revenue.currency)} AI assisted
            </p>
          }
        />
        <StatCard
          variant="metric"
          label="Revenue at Risk"
          value={formatMoney(stats?.revenue.at_risk_amount, stats?.revenue.currency)}
          icon={<AlertTriangle className="h-4 w-4 text-danger" />}
          loading={statsLoading}
          footer={
            <p className="truncate">
              {stats?.revenue.at_risk_count ?? 0} stale checkouts
              {(stats?.revenue.lost_count ?? 0) > 0 && (
                <span className="text-danger"> · {formatMoney(stats?.revenue.lost_amount, stats?.revenue.currency)} lost</span>
              )}
            </p>
          }
        />
        <StatCard
          variant="metric"
          label="Booking Conversion"
          value={stats ? `${stats.booking_conversion_rate}%` : undefined}
          icon={<CalendarCheck className="h-4 w-4" />}
          loading={statsLoading}
          footer={
            <p className="truncate">
              {stats?.appointments_upcoming.count ?? 0} upcoming · {stats?.show_rate ?? 0}% show rate
            </p>
          }
        />
        <StatCard
          variant="metric"
          label="Response Health"
          value={formatResponseTime(stats?.avg_response_time_seconds ?? null)}
          icon={<MessageCircle className="h-4 w-4" />}
          loading={statsLoading}
          footer={
            <p className="truncate">
              {stats?.unanswered_leads ?? 0} unanswered leads
            </p>
          }
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Contacts"
          value={stats?.total_contacts?.toLocaleString()}
          icon={<Users className="h-4 w-4" />}
          trend={trends?.contacts.percentage}
          loading={statsLoading}
          footer={
            <p className="truncate">
              {stats?.new_contacts_period ?? 0} new this period
            </p>
          }
        />
        <StatCard
          label="Calls"
          value={stats?.calls_period?.toLocaleString()}
          icon={<Phone className="h-4 w-4" />}
          trend={trends?.calls.percentage}
          loading={statsLoading}
          footer={
            <p className="truncate">
              {stats?.open_conversations ?? 0} open conversations
            </p>
          }
        />
        <StatCard
          label="AI Assisted Revenue"
          value={formatMoney(stats?.revenue.ai_assisted_amount, stats?.revenue.currency)}
          icon={<Bot className="h-4 w-4" />}
          loading={statsLoading}
          footer={
            <p className="truncate">
              {stats?.revenue.ai_assisted_count ?? 0} paid AI-assisted checkouts
            </p>
          }
        />
        <StatCard
          label="Show Rate"
          value={stats ? `${stats.show_rate}%` : undefined}
          icon={<CalendarClock className="h-4 w-4" />}
          loading={statsLoading}
          footer={
            <p className="truncate">
              {stats?.appointment_cancellation_rate ?? 0}% cancelled · {stats?.appointments_with_deposit_rate ?? 0}% with deposit
            </p>
          }
        />
      </div>

      {/* Needs Attention Today + Upcoming Appointments — paired so neither
          card sits alone stretched across the full row. */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] gap-4">
        <Card className="h-full overflow-hidden">
          <SectionHeader
            icon={<Flame className="h-4 w-4" />}
            title="Needs Attention Today"
            badge={!statsLoading && !!stats?.needs_attention.length && (
              <span className="rounded-full border border-warning/20 bg-warning/10 px-2 py-0.5 text-[11px] font-semibold leading-4 text-warning">
                {stats.needs_attention.length}
              </span>
            )}
          />
          <CardContent className="pt-0">
            {statsLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-14 w-full rounded-row" />
                ))}
              </div>
            ) : stats?.needs_attention.length === 0 ? (
              <div className="py-8 text-center">
                <CheckCircle2 className="h-8 w-8 text-success/60 mx-auto mb-2" />
                <p className="text-sm text-muted">Nothing needs attention right now</p>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {stats?.needs_attention.map((item) => (
                  <AttentionRow
                    key={item.contact_id}
                    href={`/inbox?lead=${item.contact_id}`}
                    urgency={item.urgency}
                    title={item.contact_name}
                    chip={item.interested_service}
                    subtitle={Array.from(new Set(item.reasons.map((r) => r.subtitle))).join(' · ')}
                    badges={item.reasons.map((r) => r.badge)}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="h-full overflow-hidden">
          <SectionHeader
            icon={<CalendarClock className="h-4 w-4" />}
            title="Upcoming Appointments"
            subtitle="Next 7 days"
            action={<HeaderLink href="/schedule">View <ArrowRight className="h-3 w-3" /></HeaderLink>}
          />
          <CardContent className="pt-0">
            {statsLoading ? (
              <Skeleton className="h-16 w-24" />
            ) : (
              <>
                <p className="text-[26px] font-semibold leading-8 tracking-tight text-primary">{stats?.appointments_upcoming.count ?? 0}</p>

                <div className="mt-3 pt-3 border-t border-subtle grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-[11px] text-muted mb-0.5">Cancelled</p>
                    <p className={cn(
                      'text-sm font-semibold',
                      (stats?.appointment_cancellation_rate ?? 0) >= 25 ? 'text-danger' : 'text-primary',
                    )}>
                      {stats ? `${stats.appointment_cancellation_rate}%` : '—'}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] text-muted mb-0.5">With deposit</p>
                    <p className="text-sm font-semibold text-primary">
                      {stats ? `${stats.appointments_with_deposit_rate}%` : '—'}
                    </p>
                  </div>
                </div>

                <div className="mt-3 pt-3 border-t border-subtle">
                  {stats?.appointments_upcoming.next ? (
                    <div className="rounded-row border border-white/6 bg-surface-raised p-3">
                      <p className="text-[11px] font-medium text-muted uppercase tracking-wide mb-1">Next up</p>
                      <p className="text-sm font-medium text-primary truncate">
                        {stats.appointments_upcoming.next.contact_name}
                      </p>
                      <p className="text-xs text-secondary">
                        {/* Explicit timeZone — without it this falls back to
                            whatever timezone the viewing browser is in, which
                            silently shows the wrong time for anyone not in
                            the same timezone as the appointment/calendar. */}
                        {new Date(stats.appointments_upcoming.next.starts_at).toLocaleString('en-US', {
                          month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
                          timeZone: stats.appointments_upcoming.next.timezone ?? undefined,
                        })}
                      </p>
                    </div>
                  ) : (
                    <p className="text-sm text-muted">Nothing scheduled</p>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <SectionHeader
          icon={<Users className="h-4 w-4" />}
          title="Funnel Conversion"
          subtitle="Conversion rate between stages"
        />
        <CardContent className="pt-0">
          {statsLoading ? (
            <Skeleton className="h-[180px] w-full rounded-row" />
          ) : stats?.funnel_conversion?.length ? (
            <FunnelPipeline {...toFunnel(stats.funnel_conversion)} />
          ) : (
            <EmptyChart height={180}>No funnel data yet</EmptyChart>
          )}
        </CardContent>
      </Card>

      {/* Breakdowns of similar density sit side by side so neither card leaves a hole. */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="h-full overflow-hidden">
          <SectionHeader
            icon={<MessageSquare className="h-4 w-4" />}
            title="Service Needed"
            subtitle="What contacts are looking for"
          />
          <CardContent className="pt-0">
            {statsLoading ? (
              <Skeleton className="h-[180px] w-full rounded-row" />
            ) : !stats?.contact_reasons.length ? (
              <EmptyChart height={180}>No data yet</EmptyChart>
            ) : (
              <div className="space-y-3 py-1">
                {(() => {
                  const total = stats.contact_reasons.reduce((s, r) => s + r.count, 0) || 1;
                  const maxCount = Math.max(...stats.contact_reasons.map((r) => r.count));
                  return stats.contact_reasons.map((r) => {
                    const isUncaptured = r.reason === 'Not captured';
                    return (
                      <div key={r.reason}>
                        <div className="flex items-center justify-between text-xs mb-1.5">
                          <span className={isUncaptured ? 'text-muted italic' : 'text-primary font-medium'}>
                            {r.reason}
                          </span>
                          <span className="text-muted">{r.count} · {Math.round((r.count / total) * 100)}%</span>
                        </div>
                        <div className="h-2 w-full bg-surface-hover rounded-full overflow-hidden">
                          <div
                            className={cn('h-full rounded-full', isUncaptured ? 'bg-surface-pressed' : 'bg-chart-lime')}
                            style={{ width: `${(r.count / maxCount) * 100}%` }}
                          />
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="h-full overflow-hidden">
          <SectionHeader
            icon={<DollarSign className="h-4 w-4" />}
            title="Channel ROI"
            subtitle="Revenue tied to the conversation channel"
            action={<HeaderLink href="/inbox">Open inbox <ArrowRight className="h-3 w-3" /></HeaderLink>}
          />
          <CardContent className="pt-0">
            {statsLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full rounded-sm" />
                ))}
              </div>
            ) : !stats?.channel_roi.length ? (
              <EmptyChart height={120}>No channel revenue yet</EmptyChart>
            ) : (
              <div className="overflow-hidden rounded-row border border-subtle">
                <div className="grid grid-cols-4 gap-3 px-3 py-2 text-[11px] font-medium text-muted">
                  <span>Channel</span>
                  <span className="text-right">Conversations</span>
                  <span className="text-right">Revenue</span>
                  <span className="text-right">Avg Payment</span>
                </div>
                {stats.channel_roi.map((item) => (
                  <div key={item.channel} className="grid grid-cols-4 gap-3 border-t border-subtle px-3 py-2.5 text-xs transition-colors hover:bg-surface-raised">
                    <span className="font-medium text-primary capitalize">{item.channel}</span>
                    <span className="text-right text-secondary">{item.conversations.toLocaleString()}</span>
                    <span className="text-right font-semibold text-primary">
                      {formatMoney(item.paid_amount, stats.revenue.currency)}
                    </span>
                    <span className="text-right text-secondary">
                      {formatMoney(item.avg_payment_amount, stats.revenue.currency)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Charts row 1: Messaging Volume + Channel Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] gap-4">
        <Card className="h-full overflow-hidden">
          <SectionHeader
            icon={<TrendingUp className="h-4 w-4" />}
            title="Messaging Volume"
            action={
              <div className="hidden items-center gap-3 pt-1.5 sm:flex">
                {MESSAGING_SERIES.map((series) => (
                  <span key={series.key} className="flex items-center gap-1.5 text-[11px] text-secondary">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: series.color }} />
                    {series.name}
                  </span>
                ))}
              </div>
            }
          />
          <CardContent className="pt-0">
            {statsLoading ? (
              <Skeleton className="h-[240px] w-full rounded-row" />
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={stats?.messaging_volume ?? []} margin={{ top: 8, right: 4, left: -12, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gMessages" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={CHART_COLORS.lime} stopOpacity={0.22} />
                      <stop offset="95%" stopColor={CHART_COLORS.lime} stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gAI" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={CHART_COLORS.purple} stopOpacity={0.18} />
                      <stop offset="95%" stopColor={CHART_COLORS.purple} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid {...chartGridProps} />
                  <XAxis
                    dataKey="date"
                    {...chartAxisProps}
                    minTickGap={16}
                    tickFormatter={(d: string) => {
                      // fromISODate, not new Date(d) — d is a date-only
                      // "YYYY-MM-DD" string, which Date parses as UTC
                      // midnight; reading it back with local getters shifts
                      // the label a day earlier in any timezone behind UTC
                      // (all of the US). fromISODate constructs the date from
                      // its parts directly in local time, so there's no UTC
                      // conversion to shift against.
                      const dt = fromISODate(d);
                      return `${dt.getDate()}/${dt.getMonth() + 1}`;
                    }}
                  />
                  <YAxis {...chartAxisProps} />
                  <Tooltip
                    {...TOOLTIP_PROPS}
                    cursor={chartTooltipCursor}
                    labelFormatter={(d: string) => formatDateShort(d)}
                  />
                  <Area type="monotone" dataKey="messages" stroke={CHART_COLORS.lime} strokeWidth={2.5} fill="url(#gMessages)" name="Messages" dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
                  <Area type="monotone" dataKey="ai_handled" stroke={CHART_COLORS.purple} strokeWidth={2.5} fill="url(#gAI)" name="AI Handled" dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
                  <Area type="monotone" dataKey="calls" stroke={CHART_COLORS.cyan} strokeWidth={1.5} fill="none" name="Calls" dot={false} activeDot={{ r: 3, strokeWidth: 0 }} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="h-full overflow-hidden">
          <SectionHeader
            icon={<Radio className="h-4 w-4" />}
            title="Channel Distribution"
            action={<HeaderLink href="/inbox">{stats?.open_conversations ?? 0} open <ArrowRight className="h-3 w-3" /></HeaderLink>}
          />
          <CardContent className="pt-0">
            {statsLoading ? (
              <Skeleton className="h-[240px] w-full rounded-row" />
            ) : stats?.channel_distribution?.length ? (
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie
                    data={stats.channel_distribution}
                    cx="40%"
                    cy="50%"
                    innerRadius={58}
                    outerRadius={86}
                    paddingAngle={2}
                    dataKey="count"
                    nameKey="channel"
                    stroke={CHART_SEGMENT_STROKE}
                    strokeWidth={2}
                  >
                    {stats.channel_distribution.map((_, i) => (
                      <Cell key={i} fill={CHART_SERIES[i % CHART_SERIES.length]} />
                    ))}
                  </Pie>
                  <Legend
                    layout="vertical"
                    align="right"
                    verticalAlign="middle"
                    iconType="circle"
                    iconSize={8}
                    formatter={(v: string) => <span className="text-xs text-secondary">{v}</span>}
                  />
                  <Tooltip {...TOOLTIP_PROPS} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <EmptyChart height={240}>No channel data yet</EmptyChart>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Charts row 2: AI Performance + Response Time */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="h-full overflow-hidden">
          <SectionHeader icon={<Bot className="h-4 w-4" />} title="AI Performance" />
          <CardContent className="pt-0">
            {statsLoading ? (
              <Skeleton className="h-[200px] w-full rounded-row" />
            ) : (
              <div className="flex flex-col items-center gap-4 sm:flex-row">
                <div className="h-[180px] w-full sm:w-1/2">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={stats?.ai_performance ?? []}
                        cx="50%"
                        cy="50%"
                        innerRadius={48}
                        outerRadius={74}
                        paddingAngle={2}
                        dataKey="value"
                        nameKey="metric"
                        stroke={CHART_SEGMENT_STROKE}
                        strokeWidth={2}
                      >
                        {(stats?.ai_performance ?? []).map((entry) => (
                          <Cell key={entry.metric} fill={AI_COLORS[entry.metric] ?? CHART_MUTED} />
                        ))}
                      </Pie>
                      <Tooltip {...TOOLTIP_PROPS} formatter={(v: number) => `${v}%`} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="w-full space-y-2 sm:w-1/2">
                  {(stats?.ai_performance ?? []).map((item) => (
                    <div key={item.metric} className="flex items-center justify-between rounded-lg border border-white/6 bg-surface-raised px-3 py-2 text-xs">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-2.5 h-2.5 rounded-full"
                          style={{ backgroundColor: AI_COLORS[item.metric] ?? CHART_MUTED }}
                        />
                        <span className="text-secondary">{item.metric}</span>
                      </div>
                      <span className="font-medium text-primary">{item.value}%</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="h-full overflow-hidden">
          <SectionHeader icon={<Clock className="h-4 w-4" />} title="Response Time by Hour" />
          <CardContent className="pt-0">
            {statsLoading ? (
              <Skeleton className="h-[200px] w-full rounded-row" />
            ) : stats?.response_time_by_hour?.length ? (
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={stats.response_time_by_hour} margin={{ top: 8, right: 4, left: -12, bottom: 0 }}>
                  <CartesianGrid {...chartGridProps} />
                  <XAxis dataKey="hour" {...chartAxisProps} />
                  <YAxis {...chartAxisProps} />
                  <Tooltip
                    {...TOOLTIP_PROPS}
                    cursor={chartTooltipCursor}
                    formatter={(v: number) => [formatResponseTimeMinutes(v), 'Avg response']}
                  />
                  <Line type="monotone" dataKey="avg" stroke={CHART_COLORS.purple} strokeWidth={2.5} dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <EmptyChart height={220}>No response data yet</EmptyChart>
            )}
          </CardContent>
        </Card>
      </div>

    </div>
  );
}
