import type { ConditionGroup } from './conditions';
import type { TriggerKey } from './triggers';

/**
 * An automation's steps: a tree. Every step has one parent (the trigger for
 * the first step), so a run always ends and the builder can lay it out
 * without crossing lines.
 */

export type NodeType =
  // Messaging
  | 'send_message'
  | 'send_email'
  | 'send_sms'
  // AI
  | 'send_to_ai'
  | 'set_ai'
  // Team
  | 'notify_team'
  | 'create_task'
  | 'call'
  // Contact
  | 'add_tag'
  | 'remove_tag'
  | 'update_contact'
  | 'move_stage'
  // Logic
  | 'wait'
  | 'wait_for_event'
  | 'condition'
  | 'end';

/** Where a step continues: `next`, the two sides of a branch, or after a failure. */
export type NodeHandle = 'next' | 'yes' | 'no' | 'matched' | 'timeout' | 'failed';

export type ChannelStrategyKey = 'auto' | 'same_channel' | 'whatsapp_only' | 'sms_only' | 'email_only' | 'voice_only';

export type DurationUnit = 'minutes' | 'hours' | 'days';

export interface Duration {
  amount: number;
  unit: DurationUnit;
}

// ── Recipients ─────────────────────────────────────────────────────────────

/**
 * Who a messaging step sends to.
 *  - `run_contact`: the contact the run is about (event and manual triggers).
 *  - `filter`: every contact matching a condition (one message each).
 *  - `contacts`: contacts picked in the builder.
 *  - `team`: team members (by role or by user).
 *  - `custom`: an address typed in the builder (a phone number or an email).
 */
export type RecipientMode = 'run_contact' | 'filter' | 'contacts' | 'team' | 'custom';

export interface RecipientConfig {
  mode: RecipientMode;
  filter?: ConditionGroup;
  contact_ids?: string[];
  team?: { roles?: string[]; user_ids?: string[] };
  /** `custom` mode: a phone number or an email; may contain `{{variables}}`. */
  address?: string;
}

// ── Step configurations ────────────────────────────────────────────────────

export interface EmailLink {
  label: string;
  url: string;
}

/**
 * An email as data (same shape the platform email layout renders). Every
 * string may contain `{{variables}}`; parts that render empty are dropped.
 */
export interface EmailContent {
  subject: string;
  heading: string;
  /** Defaults to "Hi {{user_name}},"; null for no greeting. */
  greeting?: string | null;
  paragraphs: string[];
  details?: Array<{ label: string; value: string }>;
  button?: EmailLink;
  links?: EmailLink[];
  notes?: string[];
  footer?: string;
}

export interface SendMessageConfig {
  recipients: RecipientConfig;
  channel_strategy: ChannelStrategyKey;
  text: string;
}

export interface SendEmailConfig {
  recipients: RecipientConfig;
  email: EmailContent;
  /** Appointment triggers only: attach an invite that adds/updates or cancels the calendar event. */
  calendar_invite?: 'none' | 'request' | 'cancel';
}

export interface SendSmsConfig {
  recipients: RecipientConfig;
  text: string;
}

export interface SendToAiConfig {
  /** The AI connection; empty = the organization's AI agent. */
  agent_id?: string | null;
}

export interface SetAiConfig {
  /** Turn the AI on or off for the run's conversation. */
  active: boolean;
}

export interface NotifyTeamConfig {
  title: string;
  description?: string;
  /** In-app alert to everyone in the organization. */
  in_app: boolean;
  /** Email to these team members (none = no email). */
  email_to?: { roles?: string[]; user_ids?: string[] };
}

export interface CreateTaskConfig {
  title: string;
  description?: string;
  /** When the task is due, after the step runs. */
  due_in?: Duration;
  /** Pause the run until someone marks the task done. */
  wait_until_done: boolean;
}

export interface CallConfig {
  /** Sent instead when the contact cannot be called (no phone, no voice channel). */
  fallback_text?: string;
}

export interface TagConfig {
  tag: string;
}

export interface UpdateContactConfig {
  /** `first_name`, `last_name`, `email`, `phone`, or `custom.<key>`; values may use `{{variables}}`. */
  fields: Array<{ field: string; value: string }>;
}

export interface MoveStageConfig {
  stage_id: string;
}

export interface WaitConfig {
  mode: 'duration' | 'until_time';
  duration?: Duration;
  /** `until_time`: the next time it is HH:MM on one of these days (0 = Sunday). */
  until?: { time: string; days_of_week?: number[] };
  /** Then move to the next business hour (follow-up calendar hours). */
  business_hours?: boolean;
}

export interface WaitForEventConfig {
  events: TriggerKey[];
  filters?: ConditionGroup;
  timeout: Duration;
}

export interface ConditionConfig {
  condition: ConditionGroup;
}

export interface EndConfig {
  reason?: string;
}

export interface NodeConfigMap {
  send_message: SendMessageConfig;
  send_email: SendEmailConfig;
  send_sms: SendSmsConfig;
  send_to_ai: SendToAiConfig;
  set_ai: SetAiConfig;
  notify_team: NotifyTeamConfig;
  create_task: CreateTaskConfig;
  call: CallConfig;
  add_tag: TagConfig;
  remove_tag: TagConfig;
  update_contact: UpdateContactConfig;
  move_stage: MoveStageConfig;
  wait: WaitConfig;
  wait_for_event: WaitForEventConfig;
  condition: ConditionConfig;
  end: EndConfig;
}

export interface AutomationNode<T extends NodeType = NodeType> {
  key: string;
  type: T;
  /** Optional name shown on the canvas instead of the step type. */
  label?: string;
  config: NodeConfigMap[T];
  position?: { x: number; y: number };
}

export interface AutomationEdge {
  source: string;
  sourceHandle?: NodeHandle;
  target: string;
}

export interface AutomationGraph {
  nodes: AutomationNode[];
  edges: AutomationEdge[];
}

// ── Triggers and settings ──────────────────────────────────────────────────

export interface ScheduleSpec {
  frequency: 'once' | 'daily' | 'weekly' | 'monthly';
  /** 24h wall-clock time in the schedule's time zone. */
  time: string;
  /** `weekly`: 0 = Sunday … 6 = Saturday. */
  days_of_week?: number[];
  /** `monthly`: 1–31; short months run on their last day. */
  day_of_month?: number;
  /** `once`: YYYY-MM-DD. */
  date?: string;
  /** Defaults to the organization's time zone. */
  timezone?: string;
}

export type EventTriggerKey = Exclude<TriggerKey, 'schedule' | 'manual'>;

export type AutomationTrigger =
  | { key: EventTriggerKey; filters?: ConditionGroup }
  | { key: 'schedule'; schedule: ScheduleSpec }
  | { key: 'manual' };

export interface ExitRule {
  trigger: EventTriggerKey;
  filters?: ConditionGroup;
}

export interface AutomationSettings {
  /** Whether a contact can go through the automation again after finishing it. */
  reentry: 'never' | 'after_finish';
  /** Events that end a contact's run early (e.g. the contact replied). */
  exit_on: ExitRule[];
  /** Skip contacts tagged `opt-out` (booking messages turn this off). */
  respect_opt_out: boolean;
  /** Hold messages until business hours (follow-up calendar). */
  send_window: 'anytime' | 'business_hours';
  /**
   * Let a contact be in the automation several times at once (each incoming
   * message, each booking). Off: one run at a time per contact.
   */
  allow_parallel_runs?: boolean;
}

export const DEFAULT_AUTOMATION_SETTINGS: AutomationSettings = {
  reentry: 'after_finish',
  exit_on: [],
  respect_opt_out: true,
  send_window: 'anytime',
  allow_parallel_runs: false,
};

export interface AutomationDefinition {
  triggers: AutomationTrigger[];
  graph: AutomationGraph;
  settings: AutomationSettings;
}

export const EMPTY_AUTOMATION_DEFINITION: AutomationDefinition = {
  triggers: [],
  graph: { nodes: [], edges: [] },
  settings: DEFAULT_AUTOMATION_SETTINGS,
};
