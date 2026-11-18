import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { RunDetail, RunStatus, RunSummary } from '@crm/shared';
import { AutomationRunEntity } from './entities/automation-run.entity';
import { AutomationRunStepEntity } from './entities/automation-run-step.entity';
import { RunStoreService } from './runtime/run-store.service';

function rowsOf<T>(result: unknown): T[] {
  if (Array.isArray(result) && Array.isArray(result[0])) return result[0] as T[];
  return Array.isArray(result) ? (result as T[]) : [];
}

interface RunRow extends AutomationRunEntity {
  version: number;
  automation_name: string;
  contact_first_name: string | null;
  contact_last_name: string | null;
}

const RUN_COLUMNS = `r.*, v.version, a.name AS automation_name, c.first_name AS contact_first_name, c.last_name AS contact_last_name`;
const RUN_JOINS = `FROM automation.automation_runs r
  JOIN automation.automation_versions v ON v.id = r.version_id
  JOIN automation.automations a ON a.id = r.automation_id
  LEFT JOIN clients.contacts c ON c.id = r.contact_id`;

/** What automations did: runs, their steps and deliveries (history screens). */
@Injectable()
export class RunsService {
  constructor(
    @InjectRepository(AutomationRunStepEntity)
    private readonly steps: Repository<AutomationRunStepEntity>,
    private readonly store: RunStoreService,
  ) {}

  async listForAutomation(
    organizationId: string,
    automationId: string,
    filters: { status?: RunStatus; limit?: number; offset?: number } = {},
  ): Promise<{ items: RunSummary[]; total: number }> {
    const params: unknown[] = [organizationId, automationId];
    let where = `WHERE r.organization_id = $1 AND r.automation_id = $2`;
    if (filters.status) {
      params.push(filters.status);
      where += ` AND r.status = $${params.length}`;
    }
    const limit = Math.min(Math.max(Number(filters.limit) || 50, 1), 200);
    const offset = Math.max(Number(filters.offset) || 0, 0);
    const [{ total }] = rowsOf<{ total: number }>(
      await this.steps.manager.query(`SELECT COUNT(*)::int AS total FROM automation.automation_runs r ${where}`, params),
    );
    const rows = rowsOf<RunRow>(
      await this.steps.manager.query(
        `SELECT ${RUN_COLUMNS} ${RUN_JOINS} ${where} ORDER BY r.created_at DESC LIMIT ${limit} OFFSET ${offset}`,
        params,
      ),
    );
    return { items: rows.map((r) => this.summary(r)), total };
  }

  async listForContact(organizationId: string, contactId: string, limit = 50): Promise<RunSummary[]> {
    const rows = rowsOf<RunRow>(
      await this.steps.manager.query(
        `SELECT ${RUN_COLUMNS} ${RUN_JOINS}
          WHERE r.organization_id = $1 AND r.contact_id = $2
          ORDER BY (r.status IN ('waiting', 'running')) DESC, r.created_at DESC
          LIMIT $3`,
        [organizationId, contactId, Math.min(Math.max(limit, 1), 200)],
      ),
    );
    return rows.map((r) => this.summary(r));
  }

  async detail(organizationId: string, runId: string): Promise<RunDetail> {
    const [row] = rowsOf<RunRow>(
      await this.steps.manager.query(`SELECT ${RUN_COLUMNS} ${RUN_JOINS} WHERE r.organization_id = $1 AND r.id = $2`, [organizationId, runId]),
    );
    if (!row) throw new NotFoundException(`Run ${runId} not found`);
    const steps = await this.steps.find({ where: { run_id: runId }, order: { step_no: 'ASC' } });
    const counts = await this.store.deliveryCounts(steps.map((s) => s.id));
    return {
      ...this.summary(row),
      steps: steps.map((s) => ({
        step_no: s.step_no,
        node_key: s.node_key,
        node_type: s.node_type,
        status: s.status,
        branch: s.branch,
        output: s.output,
        error: s.error,
        started_at: s.started_at.toISOString(),
        finished_at: s.finished_at ? s.finished_at.toISOString() : null,
        deliveries: counts.get(s.id) ?? { sent: 0, failed: 0, skipped: 0 },
      })),
    };
  }

  /** Stops a run by hand. False when it was not running anymore. */
  async cancel(organizationId: string, runId: string): Promise<boolean> {
    await this.detail(organizationId, runId);
    const stopped = await this.store.stop({ ids: [runId], organizationId }, 'cancelled', 'Stopped by a team member');
    return stopped.length > 0;
  }

  private summary(r: RunRow): RunSummary {
    const iso = (d: Date | string | null) => (d ? new Date(d).toISOString() : null);
    const name = [r.contact_first_name, r.contact_last_name].filter(Boolean).join(' ');
    return {
      id: r.id,
      automation_id: r.automation_id,
      automation_name: r.automation_name,
      version: Number(r.version),
      scope: r.scope,
      status: r.status,
      contact: r.contact_id ? { id: r.contact_id, name: name || 'Unnamed contact' } : null,
      current_node_key: r.current_node_key,
      trigger_key: r.trigger_key,
      exit_reason: r.exit_reason,
      last_error: r.last_error,
      resume_at: iso(r.resume_at),
      started_at: iso(r.started_at)!,
      finished_at: iso(r.finished_at),
    };
  }
}
