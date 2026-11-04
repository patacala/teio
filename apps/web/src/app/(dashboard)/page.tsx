'use client';

import { useState, useEffect } from 'react';
import { useDashboardStats } from '@/hooks/useDashboardStats';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Calendar, type DateRange } from '@/components/ui/calendar';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import {
  Users,
  Phone,
  Bot,
  TrendingUp,
  TrendingDown,
  ArrowRight,
  Clock,
  DollarSign,
  CalendarClock,
  Flame,
  CheckCircle2,
  CalendarRange,
  AlertTriangle,
  CalendarCheck,
  MessageCircle,
  MessageSquare,
  Radio,
  X,
} from 'lucide-react';
import Link from 'next/link';
import {
  AreaChart, Area, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts';
import type { DashboardRange, CustomDateRange, FunnelStageCount } from '@/services/analytics.service';
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

// ── Section header ───────────────────────────────────────────────────────────
function SectionHeader({
  icon, title, subtitle, badge, action,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  badge?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 px-5 pb-3 pt-5">
      <div className="flex min-w-0 items-center gap-3">
        <span className="icon-tile">{icon}</span>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-[15px] font-semibold leading-6 text-primary">{title}</h2>
            {badge}
          </div>
          {subtitle && <p className="truncate text-[11px] text-muted">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

function HeaderLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-secondary transition-colors hover:bg-surface-hover hover:text-accent"
    >
      {children}
    </Link>
  );
}

function EmptyChart({ height, children }: { height: number; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-center" style={{ height }}>
      <p className="text-sm text-muted">{children}</p>
    </div>
  );
}

// ── Stat card ────────────────────────────────────────────────────────────────
interface StatCardProps {
  label: string;
  value: string | number | undefined;
  icon: React.ReactNode;
  variant?: 'metric' | 'panel';
  trend?: number;
  suffix?: string;
  loading?: boolean;
  footer?: React.ReactNode;
}

function StatCard({ label, value, icon, variant = 'panel', trend, suffix, loading, footer }: StatCardProps) {
  return (
    <Card variant={variant} className="flex h-full flex-col p-5">
      <span className="icon-tile">{icon}</span>
      <p className="mt-4 text-xs font-medium text-secondary">{label}</p>
      {loading ? (
        <Skeleton className="mt-2 h-8 w-28" />
      ) : (
        <div className="mt-1 flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
          <p className="text-[26px] font-semibold leading-8 tracking-tight text-primary">
            {value ?? '—'}
            {suffix && <span className="ml-1.5 text-base font-medium text-muted">{suffix}</span>}
          </p>
          {trend !== undefined && (
            <span
              className={cn(
                'inline-flex items-center gap-1 text-xs font-medium',
                trend > 0 ? 'text-success' : trend < 0 ? 'text-danger' : 'text-muted',
              )}
            >
              {trend > 0 ? <TrendingUp className="h-3.5 w-3.5" /> : trend < 0 ? <TrendingDown className="h-3.5 w-3.5" /> : null}
              {trend === 0 ? 'No change' : `${Math.abs(trend)}% vs prev period`}
            </span>
          )}
        </div>
      )}
      <div className="mt-auto pt-4">
        <div className="border-t border-subtle pt-3 text-xs text-muted">{!loading && footer}</div>
      </div>
    </Card>
  );
}

function outcomeKind(stage: FunnelStageCount): 'won' | 'lost' | null {
  const type = stage.stage_type?.toLowerCase();
  if (type === 'won' || type === 'lost') return type;
  const name = stage.stage.trim().toLowerCase();
  if (name === 'won' || name === 'lost') return name;
  return null;
}

function FunnelPipeline({ stages }: { stages: FunnelStageCount[] }) {
  const pipeline = stages.filter((stage) => outcomeKind(stage) === null);
  const wonCount = stages.filter((stage) => outcomeKind(stage) === 'won').reduce((sum, stage) => sum + stage.count, 0);
  const lostCount = stages.filter((stage) => outcomeKind(stage) === 'lost').reduce((sum, stage) => sum + stage.count, 0);
  const max = Math.max(...pipeline.map((stage) => stage.count), 1);
  
  if (pipeline.length === 0) {
    return <p className="py-12 text-center text-sm text-muted">No funnel data yet</p>;
  }

  const stageHeight = 56;
  const stageGap = 4;
  const totalHeight = pipeline.length * stageHeight + (pipeline.length - 1) * stageGap;

  return (
    <div className="relative">
      <div className="flex items-center gap-6">
        <svg
          viewBox={`0 0 100 ${totalHeight}`}
          preserveAspectRatio="none"
          className="h-auto w-full max-w-md"
          style={{ height: totalHeight }}
        >
          <defs>
            <linearGradient id="funnelGradient" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" style={{ stopColor: CHART_COLORS.lime, stopOpacity: 0.7 }} />
              <stop offset="100%" style={{ stopColor: 'var(--color-olive)', stopOpacity: 0.4 }} />
            </linearGradient>
          </defs>
          {pipeline.map((stage, index) => {
            const y = index * (stageHeight + stageGap);
            const widthTop = Math.max((stage.count / max) * 100, 8);
            const nextStage = pipeline[index + 1];
            const widthBottom = nextStage ? Math.max((nextStage.count / max) * 100, 8) : widthTop;
            const leftTop = (100 - widthTop) / 2;
            const leftBottom = (100 - widthBottom) / 2;

            return (
              <path
                key={stage.stage}
                d={`M ${leftTop} ${y} 
                    L ${leftTop + widthTop} ${y} 
                    L ${leftBottom + widthBottom} ${y + stageHeight} 
                    L ${leftBottom} ${y + stageHeight} 
                    Z`}
                fill="url(#funnelGradient)"
                stroke={CHART_SEGMENT_STROKE}
                strokeWidth="0.5"
                className="transition-all duration-300"
              />
            );
          })}
        </svg>

        <div className="flex-1 space-y-1">
          {pipeline.map((stage, index) => {
            const previous = index > 0 ? pipeline[index - 1].count : null;
            const conversion = previous && previous > 0 ? Math.round((stage.count / previous) * 100) : null;
            
            return (
              <div
                key={stage.stage}
                className="flex h-14 items-center justify-between rounded-row border border-white/6 bg-surface-raised px-4"
              >
                <div>
                  <p className="text-sm font-medium text-primary">{stage.stage}</p>
                  <p className="text-xs text-muted">
                    {stage.count} leads
                    {conversion != null && (
                      <span className="ml-2 font-medium text-accent">{conversion}% conversion</span>
                    )}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[22px] font-semibold text-primary">{stage.count}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {(wonCount > 0 || lostCount > 0) && (
        <div className="mt-4 flex items-center justify-center gap-8 rounded-row border border-white/6 bg-surface-raised py-4">
          <div className="text-center">
            <p className="text-xs font-medium uppercase tracking-wider text-success">Won</p>
            <p className="mt-1 text-[22px] font-semibold text-primary">{wonCount}</p>
          </div>
          <div className="h-8 w-px bg-divider" />
          <div className="text-center">
            <p className="text-xs font-medium uppercase tracking-wider text-danger">Lost</p>
            <p className="mt-1 text-[22px] font-semibold text-primary">{lostCount}</p>
          </div>
        </div>
      )}
    </div>
  );
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

// ── Format cents to currency ─────────────────────────────────────────────────
function formatMoney(cents: number | undefined, currency: string = 'usd'): string {
  if (cents === undefined) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

// ── Needs Attention urgency → icon/color ─────────────────────────────────────
const ATTENTION_STYLE: Record<'critical' | 'warning', { icon: React.ReactNode; ring: string; bg: string }> = {
  critical: { icon: <Flame className="h-4 w-4" />, ring: 'text-danger', bg: 'bg-danger/12' },
  warning: { icon: <CalendarClock className="h-4 w-4" />, ring: 'text-warning', bg: 'bg-warning/12' },
};

// ── Range selector ───────────────────────────────────────────────────────────
const RANGES: DashboardRange[] = ['7d', '30d', '90d'];

function RangeSelector({
  value, onChange, isCustom,
}: { value: DashboardRange; onChange: (r: DashboardRange) => void; isCustom: boolean }) {
  return (
    <div className="flex h-9 items-center gap-0.5 rounded-control border border-subtle bg-surface p-1">
      {RANGES.map((r) => (
        <button
          key={r}
          onClick={() => onChange(r)}
          aria-pressed={!isCustom && value === r}
          className={cn(
            'h-full rounded-lg border px-3 text-xs font-medium transition-colors',
            !isCustom && value === r
              ? 'border-accent/12 bg-olive-dark text-primary'
              : 'border-transparent text-secondary hover:text-primary',
          )}
        >
          {r}
        </button>
      ))}
    </div>
  );
}

// ── Custom date range picker ─────────────────────────────────────────────────
function formatDateShort(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function fromISODate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function CustomRangePicker({
  active, onApply, onClear,
}: { active: CustomDateRange | null; onApply: (r: CustomDateRange) => void; onClear: () => void }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DateRange>({
    from: active ? fromISODate(active.from) : undefined,
    to: active ? fromISODate(active.to) : undefined,
  });

  // Keep the draft in sync whenever the applied range changes (incl. being cleared elsewhere)
  useEffect(() => {
    setDraft({
      from: active ? fromISODate(active.from) : undefined,
      to: active ? fromISODate(active.to) : undefined,
    });
  }, [active]);

  const canApply = !!draft.from && !!draft.to;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      {active ? (
        <div className="flex h-9 items-center gap-0.5 rounded-control border border-accent/15 bg-olive-dark p-1">
          <PopoverTrigger asChild>
            <button className="flex h-full items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-accent transition-colors hover:bg-white/5">
              <CalendarRange className="h-3.5 w-3.5" />
              {formatDateShort(active.from)} → {formatDateShort(active.to)}
            </button>
          </PopoverTrigger>
          <button
            onClick={() => { onClear(); setOpen(false); }}
            className="rounded-lg p-1 text-accent transition-colors hover:bg-white/5"
            aria-label="Clear custom range"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <PopoverTrigger asChild>
          <button className="flex h-9 items-center gap-1.5 rounded-control border border-subtle bg-surface px-3 text-xs font-medium text-secondary transition-colors hover:bg-surface-hover hover:text-primary">
            <CalendarRange className="h-3.5 w-3.5" />
            Custom
          </button>
        </PopoverTrigger>
      )}

      <PopoverContent align="end" className="w-[280px] p-3">
        <Calendar selected={draft} onSelect={setDraft} maxDate={new Date()} />
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-subtle">
          <span className="text-xs text-muted">
            {draft.from ? formatDateShort(toISODate(draft.from)) : 'From'}
            {' → '}
            {draft.to ? formatDateShort(toISODate(draft.to)) : 'To'}
          </span>
          <Button
            size="sm"
            onClick={() => {
              if (draft.from && draft.to) {
                onApply({ from: toISODate(draft.from), to: toISODate(draft.to) });
                setOpen(false);
              }
            }}
            disabled={!canApply}
          >
            Apply
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const [range, setRange] = useState<DashboardRange>('30d');
  const [customRange, setCustomRange] = useState<CustomDateRange | null>(null);
  const { data: stats, isLoading: statsLoading } = useDashboardStats(range, customRange ?? undefined);

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
                {stats?.needs_attention.map((item) => {
                  const style = item.urgency === 'critical' ? ATTENTION_STYLE.critical : ATTENTION_STYLE.warning;
                  const subtitle = Array.from(new Set(item.reasons.map((r) => r.subtitle))).join(' · ');
                  return (
                    <Link
                      key={item.contact_id}
                      href={`/contacts/${item.contact_id}`}
                      className="flex items-center gap-3 rounded-row border border-white/6 bg-surface-raised p-2.5 transition-colors hover:border-strong hover:bg-surface-hover"
                    >
                      <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-full', style.bg, style.ring)}>
                        {style.icon}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 min-w-0">
                          <p className="text-sm font-medium text-primary truncate">{item.contact_name}</p>
                          {item.interested_service && (
                            <span className="shrink-0 rounded-full border border-subtle bg-white/5 px-2 py-0.5 text-[11px] font-medium leading-4 text-secondary">
                              {item.interested_service}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted truncate">{subtitle}</p>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        {item.reasons.map((r, i) => (
                          <span
                            key={i}
                            className={cn(
                              'rounded-full border px-2 py-0.5 text-[11px] font-medium leading-4',
                              item.urgency === 'critical'
                                ? 'border-danger/20 bg-danger/10 text-danger'
                                : 'border-warning/20 bg-warning/10 text-warning',
                            )}
                          >
                            {r.badge}
                          </span>
                        ))}
                      </div>
                    </Link>
                  );
                })}
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
            <FunnelPipeline stages={stats.funnel_conversion} />
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
