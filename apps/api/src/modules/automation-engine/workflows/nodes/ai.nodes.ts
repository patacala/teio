import { Inject, Injectable, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { Queue } from 'bullmq';
import type { AgentTriggerJobData } from '@crm/shared';
import { AutomationAgentEntity } from '../../../ai-automation/entities/automation-agent.entity';
import { AGENT_TRIGGER_QUEUE } from '../../../ai-automation/ai-automation.constants';
import { RunStoreService } from '../runtime/run-store.service';
import { StepError, type NodeContext, type NodeExecutor, type NodeOutcome } from './node-executor';

/** The event name the AI agent knows each trigger by (unchanged from before automations). */
const AI_EVENT_TYPE: Record<string, string> = {
  'payment.completed': 'payment.received',
};

/**
 * What the AI receives for a trigger — byte-for-byte what the code paths that
 * used to call it directly sent (golden files ai-agent-jobs / ai-agent-requests).
 * Other triggers forward their event payload.
 */
export function aiJobPayload(triggerKey: string, data: Record<string, unknown>, raw: Record<string, unknown>): Record<string, unknown> {
  switch (triggerKey) {
    case 'message.received':
      return { message: data.content, channel: data.channel };
    case 'call.completed':
      return { call_id: data.call_id, duration_seconds: data.duration_seconds, summary: data.summary ?? undefined };
    default:
      return raw;
  }
}

/**
 * The organization's AI connections (rows of ai_agents.agents): the endpoint
 * and key of the external agent. Which events reach it is decided by
 * automations, not by the row.
 */
@Injectable()
export class AiConnectionsService {
  constructor(
    @InjectRepository(AutomationAgentEntity)
    private readonly agents: Repository<AutomationAgentEntity>,
  ) {}

  /** The connection used when a step does not pick one: ProSales, else the latest active one. */
  async defaultConnection(organizationId: string): Promise<AutomationAgentEntity | null> {
    const rows = await this.agents.find({ where: { organization_id: organizationId }, order: { updated_at: 'DESC' } });
    return (
      rows.find((r) => r.name === 'ProSales' && r.trigger_event === 'message.received') ??
      rows.find((r) => r.is_active) ??
      null
    );
  }

  async find(organizationId: string, id: string): Promise<AutomationAgentEntity | null> {
    return this.agents.findOne({ where: { id, organization_id: organizationId } });
  }

  async list(organizationId: string): Promise<AutomationAgentEntity[]> {
    return this.agents.find({ where: { organization_id: organizationId }, order: { name: 'ASC' } });
  }
}

@Injectable()
export class SendToAiNode implements NodeExecutor<'send_to_ai'> {
  readonly type = 'send_to_ai' as const;

  constructor(
    private readonly store: RunStoreService,
    private readonly connections: AiConnectionsService,
    @Optional() @Inject(AGENT_TRIGGER_QUEUE) private readonly agentQueue?: Queue,
  ) {}

  async execute(ctx: NodeContext<'send_to_ai'>): Promise<NodeOutcome> {
    if (!this.agentQueue) throw new StepError('The AI queue is not available', true);
    const org = ctx.run.organization_id;
    const agent = ctx.node.config.agent_id
      ? await this.connections.find(org, ctx.node.config.agent_id)
      : await this.connections.defaultConnection(org);
    if (!agent) return { kind: 'fail', error: 'No AI agent is connected', retryable: false };

    const claim = await this.store.claimDelivery(org, ctx.step.id, `ai:${agent.id}`, 'ai');
    if (!claim) return { kind: 'next', output: { agent_id: agent.id, already_sent: true } };

    const trigger = ctx.run.context.trigger;
    const key = trigger?.key ?? ctx.run.trigger_key;
    const eventType = AI_EVENT_TYPE[key] ?? key;
    const job: AgentTriggerJobData = {
      event_type: eventType,
      organization_id: org,
      conversation_id: ctx.run.conversation_id ?? undefined,
      contact_id: ctx.run.contact_id ?? undefined,
      payload: aiJobPayload(key, trigger?.data ?? {}, trigger?.raw ?? {}),
      agent_id: agent.id,
      automation_run_id: ctx.run.id,
    };
    try {
      await this.agentQueue.add('trigger', job, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        jobId: `ai-${ctx.run.id}-${ctx.step.step_no}`,
      });
    } catch (err) {
      await this.store.releaseDelivery(claim);
      throw new StepError(`Could not reach the AI queue: ${(err as Error).message}`, true);
    }
    await this.store.settleDelivery(claim, 'sent', { reference_id: agent.id });
    return { kind: 'next', output: { agent_id: agent.id, agent_name: agent.name, event_type: eventType } };
  }
}
