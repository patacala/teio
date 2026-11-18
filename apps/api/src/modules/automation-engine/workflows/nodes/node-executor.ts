import type { AutomationNode, ConditionGroup, NodeHandle, NodeType, TriggerKey } from '@crm/shared';
import type { AutomationRunEntity } from '../entities/automation-run.entity';
import type { AutomationVersionEntity } from '../entities/automation-version.entity';
import type { AutomationRunStepEntity } from '../entities/automation-run-step.entity';
import type { ContactEntity } from '../../../client-management/contact.entity';
import type { ConversationEntity } from '../../../conversation-management/conversation.entity';
import type { OrganizationEntity } from '../../../organizations/organization.entity';
import type { RunVars } from '../variables/run-vars';

/** What a run is about, loaded once per execution. */
export interface RunData {
  organization: OrganizationEntity | null;
  contact: ContactEntity | null;
  conversation: ConversationEntity | null;
}

export interface NodeContext<T extends NodeType = NodeType> {
  run: AutomationRunEntity;
  version: AutomationVersionEntity;
  node: AutomationNode<T>;
  step: AutomationRunStepEntity;
  data: RunData;
  vars: RunVars;
  now: Date;
  /** Output saved by an earlier attempt of this same step (e.g. a bulk send's progress). */
  previousOutput: Record<string, unknown>;
}

/**
 * What a step decided:
 *  - next: continue on a path (default `next`)
 *  - wait_until: continue on `handle` at a time
 *  - wait_for: wait for an event (or until the timeout)
 *  - wait_for_task: wait until someone finishes a task
 *  - defer: run this same step again later (outside business hours, more recipients to send to)
 *  - end: finish the run here
 *  - fail: the step failed; retryable failures are tried again later
 */
export type NodeOutcome =
  | { kind: 'next'; handle?: NodeHandle; output?: Record<string, unknown> }
  | { kind: 'wait_until'; at: Date; handle?: NodeHandle; output?: Record<string, unknown> }
  | {
      kind: 'wait_for';
      events: TriggerKey[];
      filters?: ConditionGroup;
      timeoutAt: Date;
      onMatch: NodeHandle;
      onTimeout: NodeHandle;
      output?: Record<string, unknown>;
    }
  | { kind: 'wait_for_task'; taskId: string; output?: Record<string, unknown> }
  | { kind: 'defer'; at: Date; output?: Record<string, unknown> }
  | { kind: 'end'; reason?: string; output?: Record<string, unknown> }
  | { kind: 'fail'; error: string; retryable: boolean; output?: Record<string, unknown> };

export interface NodeExecutor<T extends NodeType = NodeType> {
  readonly type: T;
  execute(ctx: NodeContext<T>): Promise<NodeOutcome>;
}

/** A failure a step reports by throwing; `retryable` = worth trying again later. */
export class StepError extends Error {
  constructor(
    message: string,
    readonly retryable = false,
  ) {
    super(message);
  }
}

export const NODE_EXECUTORS = Symbol('AUTOMATION_NODE_EXECUTORS');
