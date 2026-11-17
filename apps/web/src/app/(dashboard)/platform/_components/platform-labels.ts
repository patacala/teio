import type {
  DemoRequestStatus,
  PlanLimitMetric,
  PlatformAttentionKind,
  PlatformLeadFunnelStepKey,
  PlatformOrganizationFilter,
  PlatformOrganizationSort,
  PlatformOrganizationState,
} from '@crm/shared';
import type { BadgeProps } from '@/components/ui/badge';

type BadgeVariant = NonNullable<BadgeProps['variant']>;

export const ORGANIZATION_STATE_META: Record<PlatformOrganizationState, { label: string; variant: BadgeVariant }> = {
  paying: { label: 'Paying', variant: 'success' },
  payment_failed: { label: 'Payment failed', variant: 'destructive' },
  churned: { label: 'Churned', variant: 'default' },
  demo: { label: 'Demo', variant: 'info' },
  demo_expired: { label: 'Demo ended', variant: 'warning' },
  suspended: { label: 'Suspended', variant: 'destructive' },
};

export const ORGANIZATION_FILTER_LABELS: Record<PlatformOrganizationFilter, string> = {
  all: 'All',
  paying: 'Paying',
  payment_failed: 'Payment failed',
  ending_soon: 'Demo ending soon',
  demo: 'Demo',
  demo_expired: 'Demo ended',
  churned: 'Churned',
  suspended: 'Suspended',
  internal: 'Internal',
};

/** Filter order in the organizations table: money first, then the demo pipeline, then the rest. */
export const ORGANIZATION_FILTER_ORDER: PlatformOrganizationFilter[] = [
  'all', 'paying', 'payment_failed', 'demo', 'ending_soon', 'demo_expired', 'churned', 'suspended', 'internal',
];

export const ORGANIZATION_SORT_LABELS: Record<PlatformOrganizationSort, string> = {
  mrr: 'Highest MRR',
  created: 'Newest',
  activity: 'Last activity',
  demo_end: 'Demo ends soonest',
};

export const LEAD_FUNNEL_LABELS: Record<PlatformLeadFunnelStepKey, string> = {
  form_started: 'Form started',
  submitted: 'Submitted',
  ready: 'Demo ready',
  opened: 'Demo opened',
  signed_up: 'Signed up',
  paid: 'Paid',
};

export const DEMO_TYPE_LABELS: Record<string, string> = {
  live_chat: 'Live chat',
  ai_voice: 'AI voice',
  crm: 'CRM',
};

export const DEMO_STATUS_META: Record<DemoRequestStatus, { label: string; variant: BadgeVariant }> = {
  processing: { label: 'Generating', variant: 'warning' },
  ready: { label: 'Ready', variant: 'success' },
  failed: { label: 'Failed', variant: 'destructive' },
};

export const METRIC_LABELS: Record<PlanLimitMetric, string> = {
  conversations: 'conversations',
  messages: 'messages',
  ai_calls: 'AI calls',
  voice_minutes: 'voice minutes',
  agents: 'team members',
};

/** Payment and plan problems are fixed from the organization's billing page. */
const BILLING_KINDS = new Set<PlatformAttentionKind>([
  'payment_failed', 'grace_ending', 'cancel_scheduled', 'payment_method_issue', 'at_limit',
]);
/** Demo problems are handled from the platform's demo accounts page. */
const DEMO_KINDS = new Set<PlatformAttentionKind>(['hot_demo', 'not_activated']);

export const attentionOpensBilling = (kind: PlatformAttentionKind) => BILLING_KINDS.has(kind);
export const attentionIsDemo = (kind: PlatformAttentionKind) => DEMO_KINDS.has(kind);

export function planLabel(name: string): string {
  return name ? name.charAt(0).toUpperCase() + name.slice(1) : '—';
}

export function pluralize(count: number, one: string, many = `${one}s`): string {
  return `${count.toLocaleString('en-US')} ${count === 1 ? one : many}`;
}

export function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

/** "3h ago", "5d ago"; null past a week (show the date instead). */
export function relativeAge(iso: string, now: Date = new Date()): string | null {
  const minutes = Math.floor((now.getTime() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return null;
}

/** "3h ago", "5d ago", or the date past a week. */
export function timeAgo(iso: string, now: Date = new Date()): string {
  return relativeAge(iso, now) ?? formatDay(iso);
}

/** Link to the demo accounts page with one organization searched. */
export const demoAccountsHref = (slug: string) => `/platform/demo-accounts?search=${encodeURIComponent(slug)}`;
