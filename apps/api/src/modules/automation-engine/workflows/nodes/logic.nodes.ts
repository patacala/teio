import { Injectable } from '@nestjs/common';
import { evaluateCondition } from '../conditions/condition-evaluator';
import { durationMs, nextBusinessTime, nextWallTime } from '../time/automation-time';
import { OrgTimeService } from '../time/org-time.service';
import type { NodeContext, NodeExecutor, NodeOutcome } from './node-executor';

@Injectable()
export class WaitNode implements NodeExecutor<'wait'> {
  readonly type = 'wait' as const;

  constructor(private readonly time: OrgTimeService) {}

  async execute({ node, run, now }: NodeContext<'wait'>): Promise<NodeOutcome> {
    const cfg = node.config;
    let at: Date | null;
    if (cfg.mode === 'until_time' && cfg.until) {
      at = nextWallTime(cfg.until.time, cfg.until.days_of_week, await this.time.timezone(run.organization_id), now);
    } else {
      at = new Date(now.getTime() + durationMs(cfg.duration));
    }
    if (!at) return { kind: 'fail', error: 'The wait has no valid time', retryable: false };
    if (cfg.business_hours) at = nextBusinessTime(at, await this.time.businessHours(run.organization_id));
    return { kind: 'wait_until', at, handle: 'next', output: { until: at.toISOString() } };
  }
}

@Injectable()
export class WaitForEventNode implements NodeExecutor<'wait_for_event'> {
  readonly type = 'wait_for_event' as const;

  async execute({ node, now }: NodeContext<'wait_for_event'>): Promise<NodeOutcome> {
    const timeoutAt = new Date(now.getTime() + durationMs(node.config.timeout));
    return {
      kind: 'wait_for',
      events: node.config.events,
      filters: node.config.filters,
      timeoutAt,
      onMatch: 'matched',
      onTimeout: 'timeout',
      output: { events: node.config.events, timeout_at: timeoutAt.toISOString() },
    };
  }
}

@Injectable()
export class ConditionNode implements NodeExecutor<'condition'> {
  readonly type = 'condition' as const;

  async execute({ node, vars, now }: NodeContext<'condition'>): Promise<NodeOutcome> {
    const matched = evaluateCondition(node.config.condition, vars, now);
    return { kind: 'next', handle: matched ? 'yes' : 'no', output: { matched } };
  }
}

@Injectable()
export class EndNode implements NodeExecutor<'end'> {
  readonly type = 'end' as const;

  async execute({ node }: NodeContext<'end'>): Promise<NodeOutcome> {
    return { kind: 'end', reason: node.config.reason || 'Reached the end step' };
  }
}
