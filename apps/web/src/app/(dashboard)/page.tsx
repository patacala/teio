'use client';

import { useState, useEffect } from 'react';
import { useDashboardStats } from '@/hooks/useDashboardStats';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
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

// ── Shared chart style ───────────────────────────────────────────────────────
const TOOLTIP_STYLE = {
  backgroundColor: 'white',
  border: '1px solid #E6E8EB',
  borderRadius: '8px',
  fontSize: '12px',
  boxShadow: '0 4px 6px -1px rgba(0,0,0,0.06)',
};

const CHANNEL_COLORS = ['#2563eb', '#3b82f6', '#60a5fa', '#93c5fd', '#bfdbfe'];
const FUNNEL_BAR = ['bg-blue-700', 'bg-blue-600', 'bg-blue-500', 'bg-blue-400', 'bg-blue-300'];
const AI_COLORS: Record<string, string> = { Resolved: '#2563eb', Escalated: '#60a5fa', Active: '#34d399' };
const ICON_WELL = {
  emerald: 'bg-emerald-50',
  rose: 'bg-rose-50',
  blue: 'bg-blue-50',
  neutral: 'bg-gray-50',
} as const;

// ── Stat card ────────────────────────────────────────────────────────────────
interface StatCardProps {
  label: string;
  value: string | number | undefined;
  icon: React.ReactNode;
  tone?: keyof typeof ICON_WELL;
  trend?: number;
  suffix?: string;
  loading?: boolean;
  footer?: React.ReactNode;
}

function StatCard({ label, value, icon, tone = 'neutral', trend, suffix, loading, footer }: StatCardProps) {
  return (
    <div className={cn(
      'group relative h-full overflow-hidden rounded-3xl border border-gray-200/60 bg-white/80 backdrop-blur-sm transition-all duration-300',
      'hover:shadow-xl hover:shadow-gray-900/5 hover:-translate-y-1 hover:border-gray-300/60',
    )}>
      <div className="absolute inset-0 bg-gradient-to-br from-gray-50/50 via-white to-blue-50/30" />
      <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-gradient-to-br from-blue-500/5 to-transparent blur-3xl" />
      
      <div className="relative flex h-full flex-col p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">{label}</p>
            {loading ? (
              <Skeleton className="mt-3 h-9 w-24" />
            ) : (
              <p className="mt-3 text-[32px] font-bold leading-none tracking-tight text-gray-900">
                {value ?? '—'}
                {suffix && <span className="text-lg font-medium text-gray-400 ml-2">{suffix}</span>}
              </p>
            )}
            <div className={cn(
              'mt-3 flex min-h-5 items-center gap-1.5 text-xs font-semibold',
              !loading && trend !== undefined
                ? trend > 0 ? 'text-blue-600' : trend < 0 ? 'text-gray-600' : 'text-gray-400'
                : 'text-transparent',
            )}>
              {trend !== undefined && trend > 0 ? <TrendingUp className="h-3.5 w-3.5" /> : trend !== undefined && trend < 0 ? <TrendingDown className="h-3.5 w-3.5" /> : null}
              <span>{trend === undefined ? '—' : trend === 0 ? 'No change' : `${Math.abs(trend)}% vs prev period`}</span>
            </div>
          </div>
          <div className={cn(
            'rounded-2xl p-3.5 shadow-sm ring-1 ring-gray-900/5 transition-transform group-hover:scale-105',
            ICON_WELL[tone]
          )}>
            {icon}
          </div>
        </div>
        <div className="mt-auto border-t border-gray-900/5 pt-3.5 text-xs font-semibold text-gray-500">
          {!loading && footer}
        </div>
      </div>
    </div>
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
    return <p className="py-12 text-center text-sm text-gray-400">No funnel data yet</p>;
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
              <stop offset="0%" style={{ stopColor: '#2563eb', stopOpacity: 1 }} />
              <stop offset="100%" style={{ stopColor: '#3b82f6', stopOpacity: 0.85 }} />
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
                stroke="#1e40af"
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
                className="flex h-14 items-center justify-between rounded-lg bg-gradient-to-r from-blue-50 to-transparent px-4"
              >
                <div>
                  <p className="text-sm font-semibold text-gray-900">{stage.stage}</p>
                  <p className="text-xs text-gray-500">
                    {stage.count} leads
                    {conversion != null && (
                      <span className="ml-2 font-medium text-blue-600">{conversion}% conversion</span>
                    )}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-blue-600">{stage.count}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {(wonCount > 0 || lostCount > 0) && (
        <div className="mt-6 flex items-center justify-center gap-8 rounded-lg bg-gradient-to-r from-emerald-50 via-blue-50 to-rose-50 py-4">
          <div className="text-center">
            <p className="text-xs font-medium uppercase tracking-wider text-emerald-700">Won</p>
            <p className="mt-1 text-2xl font-bold text-gray-900">{wonCount}</p>
          </div>
          <div className="h-8 w-px bg-gray-200" />
          <div className="text-center">
            <p className="text-xs font-medium uppercase tracking-wider text-rose-700">Lost</p>
            <p className="mt-1 text-2xl font-bold text-gray-900">{lostCount}</p>
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
  critical: { icon: <Flame className="h-4 w-4" />, ring: 'text-rose-600', bg: 'bg-rose-50' },
  warning: { icon: <CalendarClock className="h-4 w-4" />, ring: 'text-amber-600', bg: 'bg-amber-50' },
};

// ── Range selector ───────────────────────────────────────────────────────────
const RANGES: DashboardRange[] = ['7d', '30d', '90d'];

function RangeSelector({
  value, onChange, isCustom,
}: { value: DashboardRange; onChange: (r: DashboardRange) => void; isCustom: boolean }) {
  return (
    <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
      {RANGES.map((r) => (
        <button
          key={r}
          onClick={() => onChange(r)}
          className={cn(
            'px-3 py-1.5 rounded-md text-xs font-medium transition-all',
            !isCustom && value === r
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700',
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
        <div className="flex items-center gap-1 bg-blue-50 rounded-lg pl-1 pr-1 py-1">
          <PopoverTrigger asChild>
            <button className="flex items-center gap-1.5 pl-2 pr-2 py-0.5 rounded-md text-xs font-medium text-blue-700 hover:bg-blue-100 transition-colors">
              <CalendarRange className="h-3.5 w-3.5" />
              {formatDateShort(active.from)} → {formatDateShort(active.to)}
            </button>
          </PopoverTrigger>
          <button
            onClick={() => { onClear(); setOpen(false); }}
            className="p-1 rounded-md text-blue-700 hover:bg-blue-100"
            aria-label="Clear custom range"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <PopoverTrigger asChild>
          <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-100 text-xs font-medium text-gray-500 hover:text-gray-700 transition-all">
            <CalendarRange className="h-3.5 w-3.5" />
            Custom
          </button>
        </PopoverTrigger>
      )}

      <PopoverContent align="end" className="w-[280px] p-3">
        <Calendar selected={draft} onSelect={setDraft} maxDate={new Date()} />
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-50">
          <span className="text-xs text-gray-500">
            {draft.from ? formatDateShort(toISODate(draft.from)) : 'From'}
            {' → '}
            {draft.to ? formatDateShort(toISODate(draft.to)) : 'To'}
          </span>
          <button
            onClick={() => {
              if (draft.from && draft.to) {
                onApply({ from: toISODate(draft.from), to: toISODate(draft.to) });
                setOpen(false);
              }
            }}
            disabled={!canApply}
            className="h-8 px-3 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Apply
          </button>
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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-500 text-sm mt-0.5">Overview of your CRM activity</p>
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
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Revenue Collected"
          value={formatMoney(stats?.revenue.paid_amount, stats?.revenue.currency)}
          icon={<DollarSign className="h-4 w-4 text-emerald-600" />}
          tone="emerald"
          trend={stats?.revenue.trend.percentage}
          loading={statsLoading}
          footer={
            <p className="truncate border-t border-gray-50 pt-2">
              {formatMoney(stats?.revenue.pending_amount, stats?.revenue.currency)} pending
              {' · '}
              {formatMoney(stats?.revenue.ai_assisted_amount, stats?.revenue.currency)} AI assisted
            </p>
          }
        />
        <StatCard
          label="Revenue at Risk"
          value={formatMoney(stats?.revenue.at_risk_amount, stats?.revenue.currency)}
          icon={<AlertTriangle className="h-4 w-4 text-rose-500" />}
          tone="rose"
          loading={statsLoading}
          footer={
            <p className="truncate border-t border-gray-50 pt-2">
              {stats?.revenue.at_risk_count ?? 0} stale checkouts
              {(stats?.revenue.lost_count ?? 0) > 0 && (
                <span className="text-rose-600"> · {formatMoney(stats?.revenue.lost_amount, stats?.revenue.currency)} lost</span>
              )}
            </p>
          }
        />
        <StatCard
          label="Booking Conversion"
          value={stats ? `${stats.booking_conversion_rate}%` : undefined}
          icon={<CalendarCheck className="h-4 w-4 text-blue-600" />}
          tone="blue"
          loading={statsLoading}
          footer={
            <p className="truncate border-t border-gray-50 pt-2">
              {stats?.appointments_upcoming.count ?? 0} upcoming · {stats?.show_rate ?? 0}% show rate
            </p>
          }
        />
        <StatCard
          label="Response Health"
          value={formatResponseTime(stats?.avg_response_time_seconds ?? null)}
          icon={<MessageCircle className="h-4 w-4 text-blue-600" />}
          tone="blue"
          loading={statsLoading}
          footer={
            <p className="truncate border-t border-gray-50 pt-2">
              {stats?.unanswered_leads ?? 0} unanswered leads
            </p>
          }
        />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Contacts"
          value={stats?.total_contacts?.toLocaleString()}
          icon={<Users className="h-4 w-4 text-gray-400" />}
          trend={trends?.contacts.percentage}
          loading={statsLoading}
          footer={
            <p className="truncate border-t border-gray-50 pt-2">
              {stats?.new_contacts_period ?? 0} new this period
            </p>
          }
        />
        <StatCard
          label="Calls"
          value={stats?.calls_period?.toLocaleString()}
          icon={<Phone className="h-4 w-4 text-gray-400" />}
          trend={trends?.calls.percentage}
          loading={statsLoading}
          footer={
            <p className="truncate border-t border-gray-50 pt-2">
              {stats?.open_conversations ?? 0} open conversations
            </p>
          }
        />
        <StatCard
          label="AI Assisted Revenue"
          value={formatMoney(stats?.revenue.ai_assisted_amount, stats?.revenue.currency)}
          icon={<Bot className="h-4 w-4 text-blue-600" />}
          tone="blue"
          loading={statsLoading}
          footer={
            <p className="truncate border-t border-gray-50 pt-2">
              {stats?.revenue.ai_assisted_count ?? 0} paid AI-assisted checkouts
            </p>
          }
        />
        <StatCard
          label="Show Rate"
          value={stats ? `${stats.show_rate}%` : undefined}
          icon={<CalendarClock className="h-4 w-4 text-gray-400" />}
          loading={statsLoading}
          footer={
            <p className="truncate border-t border-gray-50 pt-2">
              {stats?.appointment_cancellation_rate ?? 0}% cancelled · {stats?.appointments_with_deposit_rate ?? 0}% with deposit
            </p>
          }
        />
      </div>

      {/* Needs Attention Today + Upcoming Appointments — paired so neither
          card sits alone stretched across the full row. */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="relative h-full overflow-hidden rounded-3xl border border-gray-200/60 bg-white/80 backdrop-blur-sm shadow-sm hover:shadow-xl hover:shadow-gray-900/5 transition-all duration-300">
          <div className="absolute inset-0 bg-gradient-to-br from-orange-50/30 via-white to-white" />
          <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full bg-gradient-to-br from-orange-500/5 to-transparent blur-3xl" />
          <div className="relative">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-gradient-to-br from-orange-500/10 to-orange-500/5 p-3 shadow-sm ring-1 ring-orange-900/5">
                  <Flame className="h-4 w-4 text-orange-600" />
                </div>
                <h2 className="text-sm font-bold tracking-tight text-gray-900">Needs Attention Today</h2>
                {!statsLoading && !!stats?.needs_attention.length && (
                  <span className="rounded-full bg-gradient-to-br from-orange-500 to-orange-600 px-3 py-1 text-xs font-bold text-white shadow-sm">
                    {stats.needs_attention.length}
                  </span>
                )}
              </div>
            </CardHeader>
            <CardContent className="pt-0">
            {statsLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-14 w-full rounded-lg" />
                ))}
              </div>
            ) : stats?.needs_attention.length === 0 ? (
              <div className="py-8 text-center">
                <CheckCircle2 className="h-8 w-8 text-emerald-300 mx-auto mb-2" />
                <p className="text-sm text-gray-500">Nothing needs attention right now</p>
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
                      className="flex items-center gap-3 p-2.5 rounded-lg border border-gray-100 hover:border-gray-200 hover:bg-gray-50/60 transition-colors"
                    >
                      <div className={cn('p-2 rounded-lg shrink-0', style.bg, style.ring)}>
                        {style.icon}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{item.contact_name}</p>
                          {item.interested_service && (
                            <span className="text-[11px] font-medium text-blue-700 bg-blue-50 rounded px-1.5 py-0.5 shrink-0">
                              {item.interested_service}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 truncate">{subtitle}</p>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        {item.reasons.map((r, i) => (
                          <span
                            key={i}
                            className={cn(
                              'text-xs font-semibold px-2 py-0.5 rounded-md',
                              item.urgency === 'critical' ? 'text-rose-700 bg-rose-50' : 'text-amber-700 bg-amber-50',
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
          </div>
        </div>

        <div className="relative h-full overflow-hidden rounded-3xl border border-gray-200/60 bg-white/80 backdrop-blur-sm shadow-sm hover:shadow-xl hover:shadow-gray-900/5 transition-all duration-300">
          <div className="absolute inset-0 bg-gradient-to-br from-blue-50/30 via-white to-white" />
          <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full bg-gradient-to-br from-blue-500/5 to-transparent blur-3xl" />
          <div className="relative">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="rounded-2xl bg-gradient-to-br from-blue-500/10 to-blue-500/5 p-3 shadow-sm ring-1 ring-blue-900/5">
                    <CalendarClock className="h-4 w-4 text-blue-600" />
                  </div>
                  <h2 className="text-sm font-bold tracking-tight text-gray-900">Upcoming Appointments</h2>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Next 7 days</span>
                </div>
              <Link
                href="/schedule"
                className="text-xs text-blue-600 hover:underline flex items-center gap-1"
              >
                View <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </CardHeader>
            <CardContent className="pt-0">
            {statsLoading ? (
              <Skeleton className="h-16 w-24" />
            ) : (
              <>
                <p className="text-3xl font-bold text-gray-900">{stats?.appointments_upcoming.count ?? 0}</p>

                <div className="mt-3 pt-3 border-t border-gray-50 grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-[11px] text-gray-400 mb-0.5">Cancelled</p>
                    <p className={cn(
                      'text-sm font-semibold',
                      (stats?.appointment_cancellation_rate ?? 0) >= 25 ? 'text-rose-600' : 'text-gray-900',
                    )}>
                      {stats ? `${stats.appointment_cancellation_rate}%` : '—'}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] text-gray-400 mb-0.5">With deposit</p>
                    <p className="text-sm font-semibold text-gray-900">
                      {stats ? `${stats.appointments_with_deposit_rate}%` : '—'}
                    </p>
                  </div>
                </div>

                <div className="mt-3 pt-3 border-t border-gray-50">
                  {stats?.appointments_upcoming.next ? (
                    <>
                      <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wide mb-1">Next up</p>
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {stats.appointments_upcoming.next.contact_name}
                      </p>
                      <p className="text-xs text-gray-500">
                        {/* Explicit timeZone — without it this falls back to
                            whatever timezone the viewing browser is in, which
                            silently shows the wrong time for anyone not in
                            the same timezone as the appointment/calendar. */}
                        {new Date(stats.appointments_upcoming.next.starts_at).toLocaleString('en-US', {
                          month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
                          timeZone: stats.appointments_upcoming.next.timezone ?? undefined,
                        })}
                      </p>
                    </>
                  ) : (
                    <p className="text-sm text-gray-400">Nothing scheduled</p>
                  )}
                </div>
              </>
            )}
          </CardContent>
          </div>
        </div>
      </div>

      <div className="relative overflow-hidden rounded-3xl border border-gray-200/60 bg-white/80 backdrop-blur-sm shadow-sm hover:shadow-xl hover:shadow-gray-900/5 transition-all duration-300">
        <div className="absolute inset-0 bg-gradient-to-br from-blue-50/20 via-white to-white" />
        <div className="absolute -left-16 -top-16 h-56 w-56 rounded-full bg-gradient-to-br from-blue-500/5 to-transparent blur-3xl" />
        <div className="relative">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-gradient-to-br from-blue-500/10 to-blue-500/5 p-3 shadow-sm ring-1 ring-blue-900/5">
                  <Users className="h-4 w-4 text-blue-600" />
                </div>
                <h2 className="text-sm font-bold tracking-tight text-gray-900">Funnel Conversion</h2>
              </div>
              <p className="hidden text-[10px] font-bold uppercase tracking-wider text-gray-400 sm:block">Conversion rate between stages</p>
            </div>
          </CardHeader>
        <CardContent>
          {statsLoading ? (
            <Skeleton className="h-[180px] w-full rounded" />
          ) : stats?.funnel_conversion?.length ? (
            <FunnelPipeline stages={stats.funnel_conversion} />
          ) : (
            <div className="h-[180px] flex items-center justify-center">
              <p className="text-sm text-gray-400">No funnel data yet</p>
            </div>
          )}
        </CardContent>
        </div>
      </div>

      {/* Breakdowns of similar density sit side by side so neither card leaves a hole. */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="relative h-full overflow-hidden rounded-3xl border border-gray-200/60 bg-white/80 backdrop-blur-sm shadow-sm hover:shadow-xl hover:shadow-gray-900/5 transition-all duration-300">
          <div className="absolute inset-0 bg-gradient-to-br from-purple-50/20 via-white to-white" />
          <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full bg-gradient-to-br from-purple-500/5 to-transparent blur-3xl" />
          <div className="relative">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-gradient-to-br from-purple-500/10 to-purple-500/5 p-3 shadow-sm ring-1 ring-purple-900/5">
                  <MessageSquare className="h-4 w-4 text-purple-600" />
                </div>
                <div>
                  <h2 className="text-sm font-bold tracking-tight text-gray-900">Service Needed</h2>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mt-0.5">What contacts are looking for</p>
                </div>
              </div>
            </CardHeader>
          <CardContent className="pt-0">
            {statsLoading ? (
              <Skeleton className="h-[180px] w-full rounded" />
            ) : !stats?.contact_reasons.length ? (
              <div className="h-[180px] flex items-center justify-center">
                <p className="text-sm text-gray-400">No data yet</p>
              </div>
            ) : (
              <div className="space-y-3 py-1">
                {(() => {
                  const total = stats.contact_reasons.reduce((s, r) => s + r.count, 0) || 1;
                  const maxCount = Math.max(...stats.contact_reasons.map((r) => r.count));
                  return stats.contact_reasons.map((r) => {
                    const isUncaptured = r.reason === 'Not captured';
                    return (
                      <div key={r.reason}>
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className={isUncaptured ? 'text-gray-400 italic' : 'text-gray-700 font-medium'}>
                            {r.reason}
                          </span>
                          <span className="text-gray-500">{r.count} · {Math.round((r.count / total) * 100)}%</span>
                        </div>
                        <div className="h-2 w-full bg-gray-50 rounded-full overflow-hidden">
                          <div
                            className={cn('h-full rounded-full', isUncaptured ? 'bg-gray-300' : 'bg-blue-600')}
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
          </div>
        </div>

        <div className="relative h-full overflow-hidden rounded-3xl border border-gray-200/60 bg-white/80 backdrop-blur-sm shadow-sm hover:shadow-xl hover:shadow-gray-900/5 transition-all duration-300">
          <div className="absolute inset-0 bg-gradient-to-br from-emerald-50/20 via-white to-white" />
          <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full bg-gradient-to-br from-emerald-500/5 to-transparent blur-3xl" />
          <div className="relative">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="rounded-2xl bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 p-3 shadow-sm ring-1 ring-emerald-900/5">
                    <DollarSign className="h-4 w-4 text-emerald-600" />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold tracking-tight text-gray-900">Channel ROI</h2>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mt-0.5">Revenue tied to the conversation channel</p>
                  </div>
                </div>
              <Link
                href="/inbox"
                className="text-xs text-blue-600 hover:underline flex items-center gap-1"
              >
                Open inbox <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full rounded" />
                ))}
              </div>
            ) : !stats?.channel_roi.length ? (
              <div className="h-[120px] flex items-center justify-center">
                <p className="text-sm text-gray-400">No channel revenue yet</p>
              </div>
            ) : (
              <div className="overflow-hidden rounded-lg border border-gray-100">
                <div className="grid grid-cols-4 gap-3 bg-gray-50 px-3 py-2 text-[11px] font-medium text-gray-500">
                  <span>Channel</span>
                  <span className="text-right">Conversations</span>
                  <span className="text-right">Revenue</span>
                  <span className="text-right">Avg Payment</span>
                </div>
                {stats.channel_roi.map((item) => (
                  <div key={item.channel} className="grid grid-cols-4 gap-3 px-3 py-2 text-xs border-t border-gray-50">
                    <span className="font-medium text-gray-900 capitalize">{item.channel}</span>
                    <span className="text-right text-gray-500">{item.conversations.toLocaleString()}</span>
                    <span className="text-right font-semibold text-gray-900">
                      {formatMoney(item.paid_amount, stats.revenue.currency)}
                    </span>
                    <span className="text-right text-gray-500">
                      {formatMoney(item.avg_payment_amount, stats.revenue.currency)}
                    </span>
                  </div>
                ))}
              </div>
            )}
            </CardContent>
          </div>
        </div>
      </div>

      {/* Charts row 1: Messaging Volume + Channel Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="relative h-full overflow-hidden rounded-3xl border border-gray-200/60 bg-white/80 backdrop-blur-sm shadow-sm hover:shadow-xl hover:shadow-gray-900/5 transition-all duration-300 lg:col-span-2">
          <div className="absolute inset-0 bg-gradient-to-br from-blue-50/20 via-white to-white" />
          <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full bg-gradient-to-br from-blue-500/5 to-transparent blur-3xl" />
          <div className="relative">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-gradient-to-br from-blue-500/10 to-blue-500/5 p-3 shadow-sm ring-1 ring-blue-900/5">
                  <TrendingUp className="h-4 w-4 text-blue-600" />
                </div>
                <h2 className="text-sm font-bold tracking-tight text-gray-900">Messaging Volume</h2>
              </div>
            </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-[220px] w-full rounded" />
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={stats?.messaging_volume ?? []}>
                  <defs>
                    <linearGradient id="gMessages" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#2563eb" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gAI" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#60a5fa" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#60a5fa" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E6E8EB" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 10 }}
                    stroke="#94a3b8"
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
                  <YAxis tick={{ fontSize: 10 }} stroke="#94a3b8" />
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    labelFormatter={(d: string) => formatDateShort(d)}
                  />
                  <Area type="monotone" dataKey="messages" stroke="#2563eb" strokeWidth={2} fill="url(#gMessages)" name="Messages" />
                  <Area type="monotone" dataKey="ai_handled" stroke="#60a5fa" strokeWidth={2} fill="url(#gAI)" name="AI Handled" />
                  <Area type="monotone" dataKey="calls" stroke="#93c5fd" strokeWidth={1.5} fill="none" name="Calls" />
                </AreaChart>
              </ResponsiveContainer>
            )}
            </CardContent>
          </div>
        </div>

        <div className="relative h-full overflow-hidden rounded-3xl border border-gray-200/60 bg-white/80 backdrop-blur-sm shadow-sm hover:shadow-xl hover:shadow-gray-900/5 transition-all duration-300">
          <div className="absolute inset-0 bg-gradient-to-br from-indigo-50/20 via-white to-white" />
          <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full bg-gradient-to-br from-indigo-500/5 to-transparent blur-3xl" />
          <div className="relative">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="rounded-2xl bg-gradient-to-br from-indigo-500/10 to-indigo-500/5 p-3 shadow-sm ring-1 ring-indigo-900/5">
                    <Radio className="h-4 w-4 text-indigo-600" />
                  </div>
                  <h2 className="text-sm font-bold tracking-tight text-gray-900">Channel Distribution</h2>
                </div>
              <Link
                href="/inbox"
                className="text-xs text-blue-600 hover:underline flex items-center gap-1"
              >
                {stats?.open_conversations ?? 0} open <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-[220px] w-full rounded" />
            ) : stats?.channel_distribution?.length ? (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={stats.channel_distribution}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={75}
                    dataKey="count"
                    nameKey="channel"
                  >
                    {stats.channel_distribution.map((_, i) => (
                      <Cell key={i} fill={CHANNEL_COLORS[i % CHANNEL_COLORS.length]} />
                    ))}
                  </Pie>
                  <Legend formatter={(v: string) => <span className="text-xs text-gray-600">{v}</span>} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[220px] flex items-center justify-center">
                <p className="text-sm text-gray-400">No channel data yet</p>
              </div>
            )}
            </CardContent>
          </div>
        </div>
      </div>

      {/* Charts row 2: AI Performance + Response Time */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="relative h-full overflow-hidden rounded-3xl border border-gray-200/60 bg-white/80 backdrop-blur-sm shadow-sm hover:shadow-xl hover:shadow-gray-900/5 transition-all duration-300">
          <div className="absolute inset-0 bg-gradient-to-br from-cyan-50/20 via-white to-white" />
          <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full bg-gradient-to-br from-cyan-500/5 to-transparent blur-3xl" />
          <div className="relative">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-gradient-to-br from-cyan-500/10 to-cyan-500/5 p-3 shadow-sm ring-1 ring-cyan-900/5">
                  <Bot className="h-4 w-4 text-cyan-600" />
                </div>
                <h2 className="text-sm font-bold tracking-tight text-gray-900">AI Performance</h2>
              </div>
            </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-[200px] w-full rounded" />
            ) : (
              <>
                <ResponsiveContainer width="100%" height={160}>
                  <PieChart>
                    <Pie
                      data={stats?.ai_performance ?? []}
                      cx="50%"
                      cy="50%"
                      outerRadius={60}
                      dataKey="value"
                      nameKey="metric"
                    >
                      {(stats?.ai_performance ?? []).map((entry) => (
                        <Cell key={entry.metric} fill={AI_COLORS[entry.metric] ?? '#cbd5e1'} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => `${v}%`} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-1.5">
                  {(stats?.ai_performance ?? []).map((item) => (
                    <div key={item.metric} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-2.5 h-2.5 rounded-full"
                          style={{ backgroundColor: AI_COLORS[item.metric] ?? '#cbd5e1' }}
                        />
                        <span className="text-gray-600">{item.metric}</span>
                      </div>
                      <span className="font-medium text-gray-900">{item.value}%</span>
                    </div>
                  ))}
                </div>
              </>
            )}
            </CardContent>
          </div>
        </div>

        <div className="relative h-full overflow-hidden rounded-3xl border border-gray-200/60 bg-white/80 backdrop-blur-sm shadow-sm hover:shadow-xl hover:shadow-gray-900/5 transition-all duration-300">
          <div className="absolute inset-0 bg-gradient-to-br from-amber-50/20 via-white to-white" />
          <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full bg-gradient-to-br from-amber-500/5 to-transparent blur-3xl" />
          <div className="relative">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-gradient-to-br from-amber-500/10 to-amber-500/5 p-3 shadow-sm ring-1 ring-amber-900/5">
                  <Clock className="h-4 w-4 text-amber-600" />
                </div>
                <h2 className="text-sm font-bold tracking-tight text-gray-900">Response Time by Hour</h2>
              </div>
            </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-[200px] w-full rounded" />
            ) : stats?.response_time_by_hour?.length ? (
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={stats.response_time_by_hour}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E6E8EB" />
                  <XAxis dataKey="hour" tick={{ fontSize: 10 }} stroke="#94a3b8" />
                  <YAxis tick={{ fontSize: 10 }} stroke="#94a3b8" />
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    formatter={(v: number) => [formatResponseTimeMinutes(v), 'Avg response']}
                  />
                  <Line type="monotone" dataKey="avg" stroke="#2563eb" strokeWidth={2} dot={{ fill: '#2563eb', r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[240px] flex items-center justify-center">
                <p className="text-sm text-gray-400">No response data yet</p>
              </div>
            )}
            </CardContent>
          </div>
        </div>
      </div>

    </div>
  );
}
