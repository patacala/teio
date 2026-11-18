import type { AutomationDefinition, NodeType } from './graph';
import type { TriggerKey } from './triggers';

/** Shapes returned by the /automations API. */

export type AutomationStatus = 'draft' | 'active' | 'paused' | 'archived';
export type AutomationCategory = 'ai' | 'messaging' | 'booking' | 'follow_up' | 'custom';
export type RunScope = 'contact' | 'organization';
export type RunStatus = 'waiting' | 'running' | 'completed' | 'exited' | 'failed' | 'cancelled';
export type RunStepStatus = 'running' | 'completed' | 'failed' | 'skipped';

export interface AutomationSummary {
  id: string;
  name: string;
  description: string | null;
  status: AutomationStatus;
  category: AutomationCategory;
  template_key: string | null;
  is_system: boolean;
  /** Trigger keys of the published version (or of the draft, if never published). */
  trigger_keys: TriggerKey[];
  /** Whether the published version (or the draft, if never published) has a "Send to AI agent" step. */
  sends_to_ai: boolean;
  published_version: number | null;
  has_unpublished_changes: boolean;
  stats: { active_runs: number; completed_7d: number; failed_7d: number };
  updated_at: string;
}

export interface AutomationDetail extends Omit<AutomationSummary, 'trigger_keys' | 'stats'> {
  locale: string;
  draft: AutomationDefinition;
  published: (AutomationDefinition & { version: number; published_at: string }) | null;
  trigger_keys: TriggerKey[];
  stats: AutomationSummary['stats'];
  created_at: string;
}

export interface ValidationIssue {
  /** Step the issue is about; absent for trigger/settings issues. */
  node_key?: string;
  /** `triggers[0]`, `settings.exit_on[1]`, `config.text`, … */
  path?: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
}

export interface RunSummary {
  id: string;
  automation_id: string;
  automation_name?: string;
  version: number;
  scope: RunScope;
  status: RunStatus;
  contact: { id: string; name: string } | null;
  current_node_key: string | null;
  trigger_key: string;
  exit_reason: string | null;
  last_error: string | null;
  resume_at: string | null;
  started_at: string;
  finished_at: string | null;
}

export interface RunStep {
  step_no: number;
  node_key: string;
  node_type: NodeType;
  status: RunStepStatus;
  branch: string | null;
  output: Record<string, unknown>;
  error: string | null;
  started_at: string;
  finished_at: string | null;
  deliveries: { sent: number; failed: number; skipped: number };
}

export interface RunDetail extends RunSummary {
  steps: RunStep[];
}
