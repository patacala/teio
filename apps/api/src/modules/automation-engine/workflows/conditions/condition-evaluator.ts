import type { ConditionGroup, ConditionRule, ConditionValue } from '@crm/shared';
import { isEmptyCondition } from '@crm/shared';
import { lookupTemplateValue } from '../../../../infrastructure/messaging/template';

/**
 * Evaluates conditions against a run's data: `{ contact, conversation,
 * trigger, organization, … }` (see variable-context.builder.ts).
 *
 * Semantics (mirrored by audience-sql.compiler.ts for contact filters):
 *  - Text compares case-insensitively.
 *  - A list field (tags, channels) "equals" a value when it contains it.
 *  - Booleans match loosely: true / "true" / "yes" (as the funnel rules do).
 *  - A missing value never satisfies a comparison; use is_empty for that.
 */
export type EvaluationScope = Record<string, unknown>;

const DAY_MS = 86_400_000;

export function resolveField(scope: EvaluationScope, path: string): unknown {
  return lookupTemplateValue(scope, path);
}

export function evaluateCondition(group: ConditionGroup | null | undefined, scope: EvaluationScope, now = new Date()): boolean {
  if (isEmptyCondition(group)) return true;
  return group!.any.some((block) => (block.all ?? []).every((rule) => evaluateRule(rule, scope, now)));
}

export function evaluateRule(rule: ConditionRule, scope: EvaluationScope, now = new Date()): boolean {
  const actual = resolveField(scope, rule.field);
  const expected = rule.value;

  switch (rule.operator) {
    case 'is_empty':
      return isEmptyValue(actual);
    case 'is_not_empty':
      return !isEmptyValue(actual);
    case 'is_true':
      return isTruthy(actual);
    case 'is_false':
      return !isTruthy(actual);
    case 'equals':
      return matchesValue(actual, expected);
    case 'not_equals':
      return !matchesValue(actual, expected);
    case 'contains':
      return containsText(actual, expected);
    case 'not_contains':
      return !containsText(actual, expected);
    case 'starts_with':
      return typeof actual === 'string' && typeof expected === 'string' && norm(actual).startsWith(norm(expected));
    case 'gt':
    case 'gte':
    case 'lt':
    case 'lte':
      return compareOrdered(actual, expected, rule.operator);
    case 'in':
      return toList(expected).some((v) => matchesValue(actual, v));
    case 'not_in':
      return !toList(expected).some((v) => matchesValue(actual, v));
    case 'has_tag':
      return Array.isArray(actual) && actual.some((t) => norm(String(t)) === norm(String(expected ?? '')));
    case 'not_has_tag':
      return !(Array.isArray(actual) && actual.some((t) => norm(String(t)) === norm(String(expected ?? ''))));
    case 'matches_keywords':
      return typeof actual === 'string' && matchesKeywords(actual, toList(expected));
    case 'older_than_days':
    case 'newer_than_days': {
      const date = toDate(actual);
      const days = Number(expected);
      if (!date || !Number.isFinite(days)) return false;
      const age = now.getTime() - date.getTime();
      return rule.operator === 'older_than_days' ? age > days * DAY_MS : age <= days * DAY_MS;
    }
    default:
      return false;
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function norm(value: string): string {
  return value.trim().toLowerCase();
}

/** Lowercase, no accents, single spaces: "No MÁS  gracias" → "no mas gracias". */
export function foldText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function isEmptyValue(value: unknown): boolean {
  return value === null || value === undefined || value === '' || (Array.isArray(value) && value.length === 0);
}

export function isTruthy(value: unknown): boolean {
  if (value === true) return true;
  if (typeof value === 'string') return ['true', 'yes'].includes(norm(value));
  return false;
}

function toList(value: ConditionValue | undefined): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (value === null || value === undefined || value === '') return [];
  return String(value)
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function matchesValue(actual: unknown, expected: ConditionValue | undefined): boolean {
  if (expected === null || expected === undefined) return isEmptyValue(actual);
  if (Array.isArray(actual)) return actual.some((item) => matchesValue(item, expected));
  // A missing value never equals anything (is_false/is_empty cover "not set").
  if (actual === null || actual === undefined) return false;
  if (expected === true || expected === false) return isTruthy(actual) === expected;
  if (typeof expected === 'number' || typeof actual === 'number') {
    const a = Number(actual);
    const e = Number(expected);
    if (Number.isFinite(a) && Number.isFinite(e)) return a === e;
  }
  if (typeof actual === 'boolean') {
    // A stored yes/no compared with text: only true/yes or false/no match.
    const text = norm(String(expected));
    if (['true', 'yes'].includes(text)) return actual;
    if (['false', 'no'].includes(text)) return !actual;
    return false;
  }
  return norm(String(actual)) === norm(String(expected));
}

function containsText(actual: unknown, expected: ConditionValue | undefined): boolean {
  if (expected === null || expected === undefined || expected === '') return false;
  if (Array.isArray(actual)) return actual.some((item) => norm(String(item)) === norm(String(expected)));
  if (typeof actual !== 'string' && typeof actual !== 'number') return false;
  return norm(String(actual)).includes(norm(String(expected)));
}

function toDate(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === 'string' && value) {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function compareOrdered(actual: unknown, expected: ConditionValue | undefined, op: 'gt' | 'gte' | 'lt' | 'lte'): boolean {
  if (actual === null || actual === undefined || actual === '' || expected === null || expected === undefined || expected === '') {
    return false;
  }
  let a = Number(actual);
  let e = Number(expected);
  if (!Number.isFinite(a) || !Number.isFinite(e)) {
    const da = toDate(actual);
    const de = toDate(expected);
    if (!da || !de) return false;
    a = da.getTime();
    e = de.getTime();
  }
  switch (op) {
    case 'gt':
      return a > e;
    case 'gte':
      return a >= e;
    case 'lt':
      return a < e;
    case 'lte':
      return a <= e;
  }
}

/**
 * True when the text contains any keyword as whole words, ignoring case,
 * accents and repeated spaces. A trailing `*` matches word beginnings:
 * "deja de escribir*" matches "deja de escribirme".
 */
export function matchesKeywords(text: string, keywords: string[]): boolean {
  const folded = foldText(text);
  return keywords.some((raw) => {
    const prefix = raw.trim().endsWith('*');
    const keyword = foldText(raw.replace(/\*+\s*$/, ''));
    if (!keyword) return false;
    const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+');
    const pattern = new RegExp(`(?<![\\p{L}\\p{N}])${escaped}${prefix ? '' : '(?![\\p{L}\\p{N}])'}`, 'u');
    return pattern.test(folded);
  });
}
