/**
 * Conditions shared by trigger filters, if/else steps, "wait for event"
 * filters, exit rules and recipient filters.
 *
 * A group matches when ANY of its blocks matches; a block matches when ALL
 * its rules match. An empty group always matches.
 */

export type ConditionOperator =
  | 'equals'
  | 'not_equals'
  | 'contains'
  | 'not_contains'
  | 'starts_with'
  | 'is_empty'
  | 'is_not_empty'
  | 'is_true'
  | 'is_false'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'in'
  | 'not_in'
  | 'has_tag'
  | 'not_has_tag'
  | 'matches_keywords'
  | 'older_than_days'
  | 'newer_than_days';

export type ConditionValue = string | number | boolean | string[] | null;

export interface ConditionRule {
  /** Dotted path: `contact.tags`, `trigger.channel`, `contact.custom.budget`, … */
  field: string;
  operator: ConditionOperator;
  value?: ConditionValue;
}

export interface ConditionBlock {
  all: ConditionRule[];
}

export interface ConditionGroup {
  any: ConditionBlock[];
}

export const EMPTY_CONDITION: ConditionGroup = { any: [] };

/** Operators that take no value. */
export const UNARY_OPERATORS: ConditionOperator[] = ['is_empty', 'is_not_empty', 'is_true', 'is_false'];

export const OPERATOR_LABELS: Record<ConditionOperator, string> = {
  equals: 'is',
  not_equals: 'is not',
  contains: 'contains',
  not_contains: 'does not contain',
  starts_with: 'starts with',
  is_empty: 'is empty',
  is_not_empty: 'is not empty',
  is_true: 'is yes',
  is_false: 'is no',
  gt: 'is greater than',
  gte: 'is at least',
  lt: 'is less than',
  lte: 'is at most',
  in: 'is any of',
  not_in: 'is none of',
  has_tag: 'has tag',
  not_has_tag: 'does not have tag',
  matches_keywords: 'contains any of the words',
  older_than_days: 'is more than N days ago',
  newer_than_days: 'is within the last N days',
};

export function isEmptyCondition(group: ConditionGroup | null | undefined): boolean {
  return !group || !group.any?.length || group.any.every((b) => !b.all?.length);
}
