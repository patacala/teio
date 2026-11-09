import type { PlanLimitMetric, PlanLimitOverrides, PlanLimits } from '@crm/shared';

export const LIMIT_METRICS: Array<{ metric: PlanLimitMetric; label: string; monthly: boolean }> = [
  { metric: 'conversations', label: 'Conversations', monthly: true },
  { metric: 'messages', label: 'Messages', monthly: true },
  { metric: 'ai_calls', label: 'AI calls', monthly: true },
  { metric: 'voice_minutes', label: 'Voice minutes', monthly: true },
  { metric: 'agents', label: 'Team members', monthly: false },
];

export type LimitMode = 'default' | 'custom' | 'unlimited';

export interface LimitDraft {
  mode: LimitMode;
  value: string;
}

export type LimitDrafts = Record<PlanLimitMetric, LimitDraft>;

export function formatLimit(value: number): string {
  return value === -1 ? 'Unlimited' : value.toLocaleString('en-US');
}

function draftFor(value: number | undefined, fallback: number): LimitDraft {
  if (value === undefined) return { mode: 'default', value: String(Math.max(fallback, 0)) };
  if (value === -1) return { mode: 'unlimited', value: String(Math.max(fallback, 0)) };
  return { mode: 'custom', value: String(value) };
}

/** Drafts for the defaults form: every metric is either custom or unlimited. */
export function draftsFromLimits(limits: PlanLimits): LimitDrafts {
  return Object.fromEntries(
    LIMIT_METRICS.map(({ metric }) => [metric, draftFor(limits[metric], limits[metric])]),
  ) as LimitDrafts;
}

/** Drafts for one organization: metrics without an override follow the defaults. */
export function draftsFromOverrides(overrides: PlanLimitOverrides, defaults: PlanLimits): LimitDrafts {
  return Object.fromEntries(
    LIMIT_METRICS.map(({ metric }) => [metric, draftFor(overrides[metric], defaults[metric])]),
  ) as LimitDrafts;
}

export type DraftErrors = Partial<Record<PlanLimitMetric, string>>;

/** Converts drafts to limits; metrics left on "default" are omitted. */
export function limitsFromDrafts(drafts: LimitDrafts): { limits: PlanLimitOverrides; errors: DraftErrors } {
  const limits: PlanLimitOverrides = {};
  const errors: DraftErrors = {};
  for (const { metric } of LIMIT_METRICS) {
    const draft = drafts[metric];
    if (draft.mode === 'unlimited') limits[metric] = -1;
    else if (draft.mode === 'custom') {
      if (!/^\d+$/.test(draft.value.trim())) errors[metric] = 'Enter a whole number (0 or more).';
      else limits[metric] = Number(draft.value.trim());
    }
  }
  return { limits, errors };
}
