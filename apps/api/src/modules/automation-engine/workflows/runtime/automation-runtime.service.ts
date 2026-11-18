import { Inject, Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { Queue } from 'bullmq';
import type { AutomationGraph, AutomationNode, NodeType } from '@crm/shared';
import { ACTION_EXECUTION_QUEUE } from '../../automation-engine.constants';
import { ContactEntity } from '../../../client-management/contact.entity';
import { ConversationEntity } from '../../../conversation-management/conversation.entity';
import { OrganizationEntity } from '../../../organizations/organization.entity';
import { AutomationVersionEntity } from '../entities/automation-version.entity';
import type { AutomationRunEntity, RunContext } from '../entities/automation-run.entity';
import type { AutomationRunStepEntity } from '../entities/automation-run-step.entity';
import { buildRunVars, type RunVars } from '../variables/run-vars';
import { NODE_EXECUTORS, StepError, type NodeExecutor, type NodeOutcome, type RunData } from '../nodes/node-executor';
import { RunStoreService, type NewRun } from './run-store.service';
import { TaskHooksService } from '../../core/task-hooks.service';
import { AutomationEntity } from '../entities/automation.entity';
import { OutboxService } from '../../../../infrastructure/outbox/outbox.service';
import { RABBITMQ_QUEUES } from '../../../../infrastructure/rabbitmq/rabbitmq.constants';

/** BullMQ job that executes a run (shares the follow-up execution queue and worker). */
export const AUTOMATION_RUN_JOB = 'automation-run';
export interface AutomationRunJobData {
  runId: string;
}

/** Steps executed in one go before the run yields (a guard; graphs are trees and always end). */
const MAX_STEPS_PER_EXECUTION = 100;
/** A retryable failure is tried this many times in total. */
export const MAX_STEP_ATTEMPTS = 3;
const RETRY_DELAYS_MS = [60_000, 5 * 60_000];
/** Steps that change the contact or conversation: later steps must see the change. */
const MUTATING: NodeType[] = ['add_tag', 'remove_tag', 'update_contact', 'move_stage', 'set_ai'];

interface IndexedGraph {
  root: string | null;
  nodes: Map<string, AutomationNode>;
  next: Map<string, string>;
}

function indexGraph(graph: AutomationGraph): IndexedGraph {
  const nodes = new Map(graph.nodes.map((n) => [n.key, n]));
  const incoming = new Set(graph.edges.map((e) => e.target));
  const next = new Map(graph.edges.map((e) => [`${e.source}:${e.sourceHandle ?? 'next'}`, e.target]));
  return { root: graph.nodes.find((n) => !incoming.has(n.key))?.key ?? null, nodes, next };
}

/**
 * Executes automation runs: walks a run's published version step by step
 * until it has to wait, is deferred, ends or fails, persisting where it is so
 * any worker can continue it.
 */
@Injectable()
export class AutomationRuntimeService implements OnModuleInit {
  private readonly logger = new Logger(AutomationRuntimeService.name);
  private readonly executors = new Map<string, NodeExecutor>();
  /** Versions are immutable: cached by id. */
  private readonly versionCache = new Map<string, { version: AutomationVersionEntity; graph: IndexedGraph }>();

  constructor(
    private readonly store: RunStoreService,
    @InjectRepository(AutomationVersionEntity)
    private readonly versions: Repository<AutomationVersionEntity>,
    @InjectRepository(ContactEntity)
    private readonly contacts: Repository<ContactEntity>,
    @InjectRepository(OrganizationEntity)
    private readonly organizations: Repository<OrganizationEntity>,
    @InjectRepository(ConversationEntity)
    private readonly conversations: Repository<ConversationEntity>,
    @Inject(NODE_EXECUTORS) executors: NodeExecutor[],
    @Optional() @Inject(ACTION_EXECUTION_QUEUE) private readonly queue?: Queue | null,
    @Optional() private readonly taskHooks?: TaskHooksService,
    @Optional() @InjectRepository(AutomationEntity) private readonly automationRepo?: Repository<AutomationEntity>,
    @Optional() private readonly outbox?: OutboxService,
  ) {
    for (const executor of executors) this.executors.set(executor.type, executor);
  }

  onModuleInit(): void {
    // A task created by a "Create task" step resumes its run when it is closed.
    this.taskHooks?.onTaskClosed(async (task) => {
      if (task.run_id) await this.resumeOnTask(task.run_id, task.id);
    });
  }

  // ── Starting and dispatching ────────────────────────────────────────────

  /** Starts a run; null when refused (already active for the contact, or event already handled). */
  async start(input: NewRun): Promise<AutomationRunEntity | null> {
    const run = await this.store.create(input);
    if (run) await this.dispatch(run);
    return run;
  }

  /** Hands a due run to a worker; without Redis it runs right away in this process. */
  async dispatch(run: Pick<AutomationRunEntity, 'id' | 'seq'>): Promise<void> {
    if (this.queue) {
      try {
        await this.queue.add(AUTOMATION_RUN_JOB, { runId: run.id } satisfies AutomationRunJobData, {
          jobId: `run-${run.id}-${run.seq}`,
          attempts: 1,
          removeOnComplete: true,
          removeOnFail: 100,
        });
        return;
      } catch (err) {
        // The scheduler picks due runs up every minute: nothing is lost.
        this.logger.warn(`Could not queue run ${run.id}: ${(err as Error).message}`);
        return;
      }
    }
    void this.execute(run.id).catch((err: Error) => this.logger.error(`Run ${run.id} failed: ${err.message}`, err.stack));
  }

  // ── Executing ───────────────────────────────────────────────────────────

  /** Executes a run if it is due and nobody else is executing it. */
  async execute(runId: string, now = new Date()): Promise<void> {
    const run = await this.store.claim(runId, now);
    if (!run) return;

    const loaded = await this.loadVersion(run.version_id);
    if (!loaded) {
      await this.store.finish(run, 'failed', { context: run.context, last_error: 'The automation version no longer exists' });
      return;
    }
    const { version, graph } = loaded;
    let data = await this.loadData(run);
    let vars = this.varsFor(run, data);
    const context: RunContext = { ...run.context };

    let nodeKey: string | null;
    if (context.resume) {
      // Continuing after a wait: that step is done; leave it through the chosen path.
      const { node_key, handle } = context.resume;
      if (context.current_step?.node_key === node_key) {
        await this.store.endStep(context.current_step.id, {
          status: 'completed',
          branch: handle,
          output: { ...(context.current_step_output ?? {}), ...(context.last_event ? { resumed_by: context.last_event.key } : {}) },
        });
      }
      context.resume = null;
      context.current_step = null;
      context.current_step_output = null;
      nodeKey = graph.next.get(`${node_key}:${handle}`) ?? null;
      if (!(await this.store.saveProgress(run, { current_node_key: nodeKey, context, attempts: 0 }))) return;
    } else {
      nodeKey = run.current_node_key ?? graph.root;
    }

    for (let i = 0; i < MAX_STEPS_PER_EXECUTION; i++) {
      if (!nodeKey) {
        if (await this.store.finish(run, 'completed', { context })) await this.onCompleted(run);
        return;
      }
      const node = graph.nodes.get(nodeKey);
      const executor = node && this.executors.get(node.type);
      if (!node || !executor) {
        await this.store.finish(run, 'failed', { context, last_error: `Step "${nodeKey}" cannot run` });
        return;
      }

      // The step row, reused across retries and deferrals of the same step.
      if (context.current_step?.node_key !== node.key) {
        const no = (context.steps_count ?? 0) + 1;
        const row = await this.store.startStep(run, no, node.key, node.type);
        context.steps_count = no;
        context.current_step = { no, id: row.id, node_key: node.key };
        context.current_step_output = null;
      }
      if (!(await this.store.saveProgress(run, { current_node_key: node.key, context }))) return; // exited or cancelled meanwhile

      const step = { id: context.current_step!.id, step_no: context.current_step!.no } as AutomationRunStepEntity;
      let outcome: NodeOutcome;
      try {
        outcome = await executor.execute({
          run,
          version,
          node,
          step,
          data,
          vars,
          now: new Date(),
          previousOutput: (context.current_step_output as Record<string, unknown>) ?? {},
        });
      } catch (err) {
        const retryable = err instanceof StepError ? err.retryable : true;
        outcome = { kind: 'fail', error: (err as Error).message, retryable };
      }

      const stepId = context.current_step!.id;
      switch (outcome.kind) {
        case 'next': {
          await this.store.endStep(stepId, { status: 'completed', branch: outcome.handle ?? 'next', output: outcome.output ?? {} });
          context.current_step = null;
          context.current_step_output = null;
          nodeKey = graph.next.get(`${node.key}:${outcome.handle ?? 'next'}`) ?? null;
          if (MUTATING.includes(node.type)) {
            data = await this.loadData(run);
            vars = this.varsFor(run, data);
          }
          if (!(await this.store.saveProgress(run, { current_node_key: nodeKey, context, attempts: 0 }))) return;
          continue;
        }
        case 'end': {
          await this.store.endStep(stepId, { status: 'completed', output: outcome.output ?? {} });
          context.current_step = null;
          if (await this.store.finish(run, 'completed', { context, exit_reason: outcome.reason ?? null })) await this.onCompleted(run);
          return;
        }
        case 'wait_until': {
          context.resume = { node_key: node.key, handle: outcome.handle ?? 'next' };
          context.current_step_output = outcome.output ?? null;
          await this.store.endStep(stepId, { status: 'running', output: outcome.output ?? {} });
          await this.store.park(run, { current_node_key: node.key, context, resume_at: outcome.at, attempts: 0 });
          return;
        }
        case 'wait_for': {
          context.resume = { node_key: node.key, handle: outcome.onTimeout };
          context.current_step_output = outcome.output ?? null;
          await this.store.endStep(stepId, { status: 'running', output: outcome.output ?? {} });
          await this.store.park(run, {
            current_node_key: node.key,
            context,
            resume_at: outcome.timeoutAt,
            attempts: 0,
            waiting_for: {
              node_key: node.key,
              events: outcome.events,
              filters: outcome.filters,
              timeout_at: outcome.timeoutAt.toISOString(),
              on_match: outcome.onMatch,
              on_timeout: outcome.onTimeout,
            },
          });
          return;
        }
        case 'wait_for_task': {
          context.resume = { node_key: node.key, handle: 'next' };
          context.current_step_output = outcome.output ?? null;
          await this.store.endStep(stepId, { status: 'running', output: outcome.output ?? {} });
          await this.store.park(run, {
            current_node_key: node.key,
            context,
            resume_at: null,
            attempts: 0,
            waiting_for: { node_key: node.key, events: [], timeout_at: null, on_match: 'next', on_timeout: null, task_id: outcome.taskId },
          });
          return;
        }
        case 'defer': {
          context.current_step_output = outcome.output ?? null;
          await this.store.endStep(stepId, { status: 'running', output: outcome.output ?? {} });
          await this.store.park(run, { current_node_key: node.key, context, resume_at: outcome.at });
          if (outcome.at.getTime() <= Date.now()) {
            const parked = await this.store.findById(run.id);
            if (parked) await this.dispatch(parked);
          }
          return;
        }
        case 'fail': {
          const attempts = run.attempts + 1;
          if (outcome.retryable && attempts < MAX_STEP_ATTEMPTS) {
            context.current_step_output = outcome.output ?? (context.current_step_output as Record<string, unknown>) ?? null;
            await this.store.endStep(stepId, { status: 'running', error: outcome.error, output: outcome.output ?? {} });
            const delay = RETRY_DELAYS_MS[Math.min(attempts - 1, RETRY_DELAYS_MS.length - 1)];
            await this.store.park(run, {
              current_node_key: node.key,
              context,
              resume_at: new Date(Date.now() + delay),
              attempts,
              last_error: outcome.error,
            });
            return;
          }
          await this.store.endStep(stepId, { status: 'failed', error: outcome.error, output: outcome.output ?? {} });
          context.current_step = null;
          context.current_step_output = null;
          const onFailure = graph.next.get(`${node.key}:failed`);
          if (onFailure) {
            nodeKey = onFailure;
            if (!(await this.store.saveProgress(run, { current_node_key: nodeKey, context, attempts: 0 }))) return;
            continue;
          }
          await this.store.finish(run, 'failed', { context, last_error: outcome.error });
          return;
        }
      }
    }

    // Very long chains yield so other runs get a turn; the run continues right away.
    await this.store.park(run, { current_node_key: nodeKey, context, resume_at: new Date() });
    const parked = await this.store.findById(run.id);
    if (parked) await this.dispatch(parked);
  }

  /**
   * The no-response follow-up reached its last touch without a reply: tell
   * the funnel ("Lead lost" listens to `sequence.exhausted`; the name is kept
   * because organizations' funnel rules are stored with it).
   */
  private async onCompleted(run: AutomationRunEntity): Promise<void> {
    if (!run.contact_id || !this.automationRepo || !this.outbox) return;
    try {
      const automation = await this.automationRepo.findOne({ where: { id: run.automation_id }, select: ['id', 'template_key'] });
      if (automation?.template_key !== 'no_response_follow_up') return;
      await this.outbox.publish(RABBITMQ_QUEUES.SEQUENCE_EXHAUSTED, {
        organization_id: run.organization_id,
        contact_id: run.contact_id,
        automation_run_id: run.id,
        sequence_type: 'no_response',
      });
    } catch (err) {
      this.logger.warn(`Could not report the end of follow-up run ${run.id}: ${(err as Error).message}`);
    }
  }

  // ── Waking waiting runs ─────────────────────────────────────────────────

  /** A "wait for event" matched: continue on its match path. */
  async resumeOnEvent(run: AutomationRunEntity, event: { key: string; data: Record<string, unknown> }): Promise<boolean> {
    const waiting = run.waiting_for;
    if (!waiting) return false;
    const context: RunContext = {
      ...run.context,
      resume: { node_key: waiting.node_key, handle: waiting.on_match },
      last_event: event,
    };
    const woke = await this.store.wake(run.id, context, { nodeKey: waiting.node_key });
    if (woke) await this.dispatch(run);
    return woke;
  }

  /** A task created by a "Create task" step was finished: continue the run waiting for it. */
  async resumeOnTask(runId: string, taskId: string): Promise<boolean> {
    const run = await this.store.findById(runId);
    if (!run || run.status !== 'waiting' || run.waiting_for?.task_id !== taskId) return false;
    const context: RunContext = { ...run.context, resume: { node_key: run.waiting_for.node_key, handle: 'next' } };
    const woke = await this.store.wake(run.id, context, { nodeKey: run.waiting_for.node_key });
    if (woke) await this.dispatch(run);
    return woke;
  }

  // ── Loading ─────────────────────────────────────────────────────────────

  private async loadVersion(id: string): Promise<{ version: AutomationVersionEntity; graph: IndexedGraph } | null> {
    const cached = this.versionCache.get(id);
    if (cached) return cached;
    const version = await this.versions.findOne({ where: { id } });
    if (!version) return null;
    const entry = { version, graph: indexGraph(version.graph) };
    if (this.versionCache.size > 500) this.versionCache.clear();
    this.versionCache.set(id, entry);
    return entry;
  }

  async loadData(run: Pick<AutomationRunEntity, 'organization_id' | 'contact_id' | 'conversation_id'>): Promise<RunData> {
    const [organization, contact, conversation] = await Promise.all([
      this.organizations.findOne({ where: { id: run.organization_id } }),
      run.contact_id ? this.contacts.findOne({ where: { id: run.contact_id, organization_id: run.organization_id } }) : null,
      run.conversation_id
        ? this.conversations.findOne({ where: { id: run.conversation_id, organization_id: run.organization_id } })
        : null,
    ]);
    return { organization, contact, conversation };
  }

  varsFor(run: Pick<AutomationRunEntity, 'context' | 'trigger_key'>, data: RunData): RunVars {
    return buildRunVars({
      organization: data.organization ? { id: data.organization.id, name: data.organization.name } : null,
      contact: data.contact,
      conversation: data.conversation,
      triggerKey: run.context.trigger?.key ?? run.trigger_key,
      triggerData: run.context.trigger?.data ?? {},
    });
  }
}
