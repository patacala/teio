import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import type { NodeType, RunScope, RunStatus } from '@crm/shared';
import { AutomationRunEntity, type RunContext, type RunWaitingFor } from '../entities/automation-run.entity';
import { AutomationRunStepEntity } from '../entities/automation-run-step.entity';
import { AutomationDeliveryEntity, type DeliveryStatus } from '../entities/automation-delivery.entity';

/** How long a claimed run is reserved for its worker before the reaper may take it back. */
export const RUN_LEASE_MS = 5 * 60_000;

function rowsOf<T>(result: unknown): T[] {
  if (Array.isArray(result) && Array.isArray(result[0])) return result[0] as T[];
  return Array.isArray(result) ? (result as T[]) : [];
}

export interface NewRun {
  organizationId: string;
  automationId: string;
  versionId: string;
  scope: RunScope;
  contactId: string | null;
  conversationId: string | null;
  triggerKey: string;
  triggerEventId: string | null;
  context: RunContext;
  resumeAt?: Date;
  /** Default true: at most one active exclusive run per contact and automation. */
  exclusive?: boolean;
}

/**
 * Persistence of runs, steps and deliveries. Every state change is a
 * conditional UPDATE on the state it expects, so workers, timers, exit rules
 * and people cancelling can never undo each other.
 */
@Injectable()
export class RunStoreService {
  constructor(
    @InjectRepository(AutomationRunEntity)
    private readonly runs: Repository<AutomationRunEntity>,
    @InjectRepository(AutomationRunStepEntity)
    private readonly steps: Repository<AutomationRunStepEntity>,
    @InjectRepository(AutomationDeliveryEntity)
    private readonly deliveries: Repository<AutomationDeliveryEntity>,
  ) {}

  /**
   * Creates a waiting run. Returns null when the database refuses it: the
   * contact already has an active run of this automation, or this event
   * already started it (redelivery).
   */
  async create(run: NewRun, manager: EntityManager = this.runs.manager): Promise<AutomationRunEntity | null> {
    const result: unknown = await manager.query(
      `INSERT INTO automation.automation_runs
         (organization_id, automation_id, version_id, scope, contact_id, conversation_id, status,
          resume_at, context, trigger_key, trigger_event_id, exclusive)
       VALUES ($1, $2, $3, $4, $5, $6, 'waiting', $7, $8, $9, $10, $11)
       ON CONFLICT DO NOTHING
       RETURNING id`,
      [
        run.organizationId,
        run.automationId,
        run.versionId,
        run.scope,
        run.contactId,
        run.conversationId,
        run.resumeAt ?? new Date(),
        JSON.stringify(run.context),
        run.triggerKey,
        run.triggerEventId,
        run.exclusive ?? true,
      ],
    );
    const id = rowsOf<{ id: string }>(result)[0]?.id;
    return id ? manager.getRepository(AutomationRunEntity).findOneByOrFail({ id }) : null;
  }

  async findById(id: string): Promise<AutomationRunEntity | null> {
    return this.runs.findOne({ where: { id } });
  }

  /** Takes a waiting run for execution. Null if someone else took it or it changed. */
  async claim(id: string, now = new Date()): Promise<AutomationRunEntity | null> {
    const result: unknown = await this.runs.manager.query(
      `UPDATE automation.automation_runs
          SET status = 'running', seq = seq + 1, locked_until = $2
        WHERE id = $1 AND status = 'waiting' AND (resume_at IS NULL OR resume_at <= $3)
        RETURNING id`,
      [id, new Date(now.getTime() + RUN_LEASE_MS), now],
    );
    return rowsOf<{ id: string }>(result).length ? this.findById(id) : null;
  }

  /** Saves progress of a running run; false when it was exited or cancelled meanwhile. */
  async saveProgress(run: AutomationRunEntity, patch: Partial<Pick<AutomationRunEntity, 'current_node_key' | 'context' | 'attempts'>>): Promise<boolean> {
    const result = await this.runs
      .createQueryBuilder()
      .update(AutomationRunEntity)
      .set({ ...patch, locked_until: new Date(Date.now() + RUN_LEASE_MS) } as never)
      .where('id = :id AND seq = :seq AND status = :status', { id: run.id, seq: run.seq, status: 'running' })
      .execute();
    if (patch.current_node_key !== undefined) run.current_node_key = patch.current_node_key;
    if (patch.context !== undefined) run.context = patch.context;
    if (patch.attempts !== undefined) run.attempts = patch.attempts;
    return (result.affected ?? 0) > 0;
  }

  /** Parks a running run until `resumeAt` (null = until an event or a person resumes it). */
  async park(
    run: AutomationRunEntity,
    patch: { current_node_key: string | null; context: RunContext; resume_at: Date | null; waiting_for?: RunWaitingFor | null; attempts?: number; last_error?: string | null },
  ): Promise<boolean> {
    const result = await this.runs
      .createQueryBuilder()
      .update(AutomationRunEntity)
      .set({
        status: 'waiting',
        current_node_key: patch.current_node_key,
        context: patch.context as never,
        resume_at: patch.resume_at,
        waiting_for: (patch.waiting_for ?? null) as never,
        locked_until: null,
        ...(patch.attempts !== undefined ? { attempts: patch.attempts } : {}),
        ...(patch.last_error !== undefined ? { last_error: patch.last_error } : {}),
      })
      .where('id = :id AND seq = :seq AND status = :status', { id: run.id, seq: run.seq, status: 'running' })
      .execute();
    return (result.affected ?? 0) > 0;
  }

  /** Ends a running run. */
  async finish(run: AutomationRunEntity, status: Extract<RunStatus, 'completed' | 'failed'>, patch: { context: RunContext; exit_reason?: string | null; last_error?: string | null }): Promise<boolean> {
    const result = await this.runs
      .createQueryBuilder()
      .update(AutomationRunEntity)
      .set({
        status,
        context: patch.context as never,
        exit_reason: patch.exit_reason ?? null,
        last_error: patch.last_error ?? null,
        finished_at: new Date(),
        locked_until: null,
        resume_at: null,
        waiting_for: null as never,
      })
      .where('id = :id AND seq = :seq AND status = :status', { id: run.id, seq: run.seq, status: 'running' })
      .execute();
    return (result.affected ?? 0) > 0;
  }

  /** Stops active runs from outside (exit rule, person, automation paused). Returns the runs stopped. */
  async stop(where: { ids?: string[]; automationId?: string; organizationId?: string; contactId?: string }, status: Extract<RunStatus, 'exited' | 'cancelled'>, reason: string): Promise<string[]> {
    const conditions: string[] = [`status IN ('waiting', 'running')`];
    const params: unknown[] = [status, reason];
    const add = (sql: string, value: unknown) => {
      params.push(value);
      conditions.push(sql.replace('?', `$${params.length}`));
    };
    if (where.ids) add('id = ANY(?::uuid[])', where.ids);
    if (where.automationId) add('automation_id = ?', where.automationId);
    if (where.organizationId) add('organization_id = ?', where.organizationId);
    if (where.contactId) add('contact_id = ?', where.contactId);
    if (conditions.length === 1) throw new Error('stop() needs a filter');
    const result: unknown = await this.runs.manager.query(
      `UPDATE automation.automation_runs
          SET status = $1, exit_reason = $2, finished_at = NOW(), locked_until = NULL, resume_at = NULL, waiting_for = NULL
        WHERE ${conditions.join(' AND ')}
        RETURNING id`,
      params,
    );
    return rowsOf<{ id: string }>(result).map((r) => r.id);
  }

  /** Wakes a run waiting for an event or a person, to continue on `handle`. */
  async wake(id: string, context: RunContext, expected?: { nodeKey: string }): Promise<boolean> {
    const result: unknown = await this.runs.manager.query(
      `UPDATE automation.automation_runs
          SET resume_at = NOW(), waiting_for = NULL, context = $2
        WHERE id = $1 AND status = 'waiting' ${expected ? 'AND current_node_key = $3' : ''}
        RETURNING id`,
      expected ? [id, JSON.stringify(context), expected.nodeKey] : [id, JSON.stringify(context)],
    );
    return rowsOf(result).length > 0;
  }

  async findDue(limit: number, now = new Date()): Promise<Array<{ id: string; seq: number }>> {
    return this.runs.manager
      .query(
        `SELECT id, seq FROM automation.automation_runs
          WHERE status = 'waiting' AND resume_at <= $1
          ORDER BY resume_at
          LIMIT $2`,
        [now, limit],
      )
      .then((r: unknown) => rowsOf<{ id: string; seq: number }>(r));
  }

  /** Runs whose worker died: back to waiting (the attempt counts). */
  async reapStuck(now = new Date(), maxAttempts = 3): Promise<number> {
    const result: unknown = await this.runs.manager.query(
      `UPDATE automation.automation_runs
          SET status = CASE WHEN attempts + 1 >= $2 THEN 'failed' ELSE 'waiting' END,
              attempts = attempts + 1,
              resume_at = CASE WHEN attempts + 1 >= $2 THEN NULL ELSE $1::timestamptz END,
              finished_at = CASE WHEN attempts + 1 >= $2 THEN $1::timestamptz ELSE NULL END,
              last_error = 'The worker stopped while running this step',
              locked_until = NULL
        WHERE status = 'running' AND locked_until < $1
        RETURNING id`,
      [now, maxAttempts],
    );
    return rowsOf(result).length;
  }

  /** Active runs of a contact (for exit rules and "wait for event"). */
  async findActiveForContact(organizationId: string, contactId: string): Promise<AutomationRunEntity[]> {
    return this.runs
      .createQueryBuilder('r')
      .where('r.organization_id = :organizationId AND r.contact_id = :contactId', { organizationId, contactId })
      .andWhere(`r.status IN ('waiting', 'running')`)
      .getMany();
  }

  // ── Steps ───────────────────────────────────────────────────────────────

  async startStep(run: AutomationRunEntity, stepNo: number, nodeKey: string, nodeType: NodeType): Promise<AutomationRunStepEntity> {
    const existing = await this.steps.findOne({ where: { run_id: run.id, step_no: stepNo } });
    if (existing) return existing;
    return this.steps.save(
      this.steps.create({
        run_id: run.id,
        organization_id: run.organization_id,
        step_no: stepNo,
        node_key: nodeKey,
        node_type: nodeType,
        status: 'running',
      }),
    );
  }

  async endStep(
    stepId: string,
    patch: { status: 'completed' | 'failed' | 'skipped' | 'running'; branch?: string | null; output?: Record<string, unknown>; error?: string | null },
  ): Promise<void> {
    await this.steps.update(
      { id: stepId },
      {
        status: patch.status,
        ...(patch.branch !== undefined ? { branch: patch.branch } : {}),
        ...(patch.output !== undefined ? { output: patch.output as never } : {}),
        ...(patch.error !== undefined ? { error: patch.error } : {}),
        ...(patch.status === 'running' ? {} : { finished_at: new Date() }),
      },
    );
  }

  // ── Deliveries ──────────────────────────────────────────────────────────

  /**
   * Reserves (step, recipient) before sending. False when it was reserved
   * before — by an earlier attempt of the same step — so it is not sent again.
   */
  async claimDelivery(organizationId: string, stepId: string, recipientKey: string, channel: string): Promise<string | null> {
    const result: unknown = await this.deliveries.manager.query(
      `INSERT INTO automation.automation_deliveries (organization_id, run_step_id, recipient_key, channel)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (run_step_id, recipient_key) DO NOTHING
       RETURNING id`,
      [organizationId, stepId, recipientKey.slice(0, 320), channel],
    );
    return rowsOf<{ id: string }>(result)[0]?.id ?? null;
  }

  async settleDelivery(id: string, status: Exclude<DeliveryStatus, 'sending'>, patch: { reference_id?: string | null; error?: string | null; channel?: string } = {}): Promise<void> {
    await this.deliveries.update({ id }, { status, ...patch });
  }

  /** Forgets a claim whose send failed before anything went out, so a retry can send it. */
  async releaseDelivery(id: string): Promise<void> {
    await this.deliveries.delete({ id });
  }

  async deliveryCounts(stepIds: string[]): Promise<Map<string, { sent: number; failed: number; skipped: number }>> {
    const counts = new Map<string, { sent: number; failed: number; skipped: number }>();
    if (!stepIds.length) return counts;
    const rows = (await this.deliveries.manager.query(
      `SELECT run_step_id, status, COUNT(*)::int AS n FROM automation.automation_deliveries
        WHERE run_step_id = ANY($1::uuid[]) GROUP BY run_step_id, status`,
      [stepIds],
    )) as Array<{ run_step_id: string; status: DeliveryStatus; n: number }>;
    for (const row of rowsOf<{ run_step_id: string; status: DeliveryStatus; n: number }>(rows)) {
      const c = counts.get(row.run_step_id) ?? { sent: 0, failed: 0, skipped: 0 };
      if (row.status === 'sent' || row.status === 'failed' || row.status === 'skipped') c[row.status] += row.n;
      counts.set(row.run_step_id, c);
    }
    return counts;
  }
}
