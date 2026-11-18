import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import {
  DEFAULT_AUTOMATION_SETTINGS,
  EMPTY_AUTOMATION_DEFINITION,
  type AutomationCategory,
  type AutomationDefinition,
  type AutomationDetail,
  type AutomationSummary,
  type TriggerKey,
  type ValidationResult,
} from '@crm/shared';
import { AutomationEntity } from './entities/automation.entity';
import { AutomationVersionEntity } from './entities/automation-version.entity';
import { AutomationTriggerEntity } from './entities/automation-trigger.entity';
import { AutomationScheduleEntity } from './entities/automation-schedule.entity';
import { validateAutomation, type ValidationContext } from './graph/graph-validator';
import { nextOccurrence } from './time/automation-time';
import { OrgTimeService } from './time/org-time.service';
import { RunStoreService } from './runtime/run-store.service';
import { AiConnectionsService } from './nodes/ai.nodes';
import { FunnelStageEntity } from '../../funnels/funnel-stage.entity';
import { UserEntity } from '../../users/user.entity';

export interface CreateAutomationInput {
  name: string;
  description?: string | null;
  category?: AutomationCategory;
  draft?: AutomationDefinition;
}

export interface InstallAutomationInput extends CreateAutomationInput {
  template_key: string;
  is_system: boolean;
  /** Publish right away and make it active (true) or keep it paused (false). */
  active: boolean;
}

function rowsOf<T>(result: unknown): T[] {
  if (Array.isArray(result) && Array.isArray(result[0])) return result[0] as T[];
  return Array.isArray(result) ? (result as T[]) : [];
}

/** A definition with every part present, so the builder and the engine never meet a half-empty draft. */
export function normalizeDefinition(def: Partial<AutomationDefinition> | null | undefined): AutomationDefinition {
  return {
    triggers: Array.isArray(def?.triggers) ? def!.triggers : [],
    graph: {
      nodes: Array.isArray(def?.graph?.nodes) ? def!.graph!.nodes : [],
      edges: Array.isArray(def?.graph?.edges) ? def!.graph!.edges : [],
    },
    settings: { ...DEFAULT_AUTOMATION_SETTINGS, ...(def?.settings ?? {}) },
  };
}

/** Managing automations: drafts, validation, publishing, pausing. */
@Injectable()
export class AutomationsService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(AutomationEntity)
    private readonly automations: Repository<AutomationEntity>,
    @InjectRepository(AutomationVersionEntity)
    private readonly versions: Repository<AutomationVersionEntity>,
    @InjectRepository(FunnelStageEntity)
    private readonly stages: Repository<FunnelStageEntity>,
    @InjectRepository(UserEntity)
    private readonly users: Repository<UserEntity>,
    private readonly time: OrgTimeService,
    private readonly store: RunStoreService,
    private readonly ai: AiConnectionsService,
  ) {}

  // ── Reads ───────────────────────────────────────────────────────────────

  async find(organizationId: string, id: string): Promise<AutomationEntity> {
    const automation = await this.automations.findOne({ where: { id, organization_id: organizationId } });
    if (!automation) throw new NotFoundException(`Automation ${id} not found`);
    return automation;
  }

  async list(organizationId: string): Promise<AutomationSummary[]> {
    const automations = await this.automations.find({
      where: { organization_id: organizationId },
      order: { is_system: 'DESC', created_at: 'ASC' },
    });
    if (!automations.length) return [];
    const ids = automations.map((a) => a.id);
    const published = await this.versions.find({
      where: { id: In(automations.map((a) => a.published_version_id).filter((v): v is string => !!v)) },
    });
    const byVersion = new Map(published.map((v) => [v.id, v]));
    const stats = await this.stats(ids);
    return automations.map((a) => this.summary(a, a.published_version_id ? byVersion.get(a.published_version_id) ?? null : null, stats.get(a.id)));
  }

  async detail(organizationId: string, id: string): Promise<AutomationDetail> {
    const automation = await this.find(organizationId, id);
    const version = automation.published_version_id ? await this.versions.findOne({ where: { id: automation.published_version_id } }) : null;
    const stats = (await this.stats([automation.id])).get(automation.id);
    const summary = this.summary(automation, version, stats);
    return {
      ...summary,
      locale: automation.locale,
      draft: normalizeDefinition(automation.draft),
      published: version
        ? {
            triggers: version.triggers,
            graph: version.graph,
            settings: version.settings,
            version: version.version,
            published_at: version.published_at.toISOString(),
          }
        : null,
      created_at: automation.created_at.toISOString(),
    };
  }

  // ── Writes ──────────────────────────────────────────────────────────────

  async create(organizationId: string, input: CreateAutomationInput, userId: string | null): Promise<AutomationEntity> {
    const name = input.name?.trim();
    if (!name) throw new BadRequestException('Give the automation a name');
    return this.automations.save(
      this.automations.create({
        organization_id: organizationId,
        name: name.slice(0, 200),
        description: input.description ?? null,
        category: input.category ?? 'custom',
        status: 'draft',
        draft: normalizeDefinition(input.draft ?? EMPTY_AUTOMATION_DEFINITION),
        has_unpublished_changes: true,
        created_by: userId,
        updated_by: userId,
      }),
    );
  }

  async rename(organizationId: string, id: string, patch: { name?: string; description?: string | null }, userId: string | null): Promise<AutomationEntity> {
    const automation = await this.find(organizationId, id);
    if (patch.name !== undefined) {
      if (!patch.name.trim()) throw new BadRequestException('Give the automation a name');
      automation.name = patch.name.trim().slice(0, 200);
    }
    if (patch.description !== undefined) automation.description = patch.description;
    automation.updated_by = userId;
    return this.automations.save(automation);
  }

  async saveDraft(organizationId: string, id: string, draft: AutomationDefinition, userId: string | null): Promise<AutomationEntity> {
    const automation = await this.find(organizationId, id);
    automation.draft = normalizeDefinition(draft);
    automation.has_unpublished_changes = true;
    automation.updated_by = userId;
    return this.automations.save(automation);
  }

  async validate(organizationId: string, draft: AutomationDefinition): Promise<ValidationResult> {
    return validateAutomation(normalizeDefinition(draft), await this.validationContext(organizationId));
  }

  /** Publishes the draft as a new version and makes the automation active. */
  async publish(organizationId: string, id: string, userId: string | null): Promise<AutomationEntity> {
    const automation = await this.find(organizationId, id);
    const draft = normalizeDefinition(automation.draft);
    const result = await this.validate(organizationId, draft);
    if (!result.valid) throw new BadRequestException({ message: 'Fix the problems before publishing', errors: result.issues });
    const timezone = await this.time.timezone(organizationId);

    await this.dataSource.transaction(async (manager) => {
      const [{ next }] = rowsOf<{ next: number }>(
        await manager.query(`SELECT COALESCE(MAX(version), 0) + 1 AS next FROM automation.automation_versions WHERE automation_id = $1`, [id]),
      );
      const version = await manager.getRepository(AutomationVersionEntity).save(
        manager.getRepository(AutomationVersionEntity).create({
          automation_id: id,
          organization_id: organizationId,
          version: Number(next),
          triggers: draft.triggers,
          graph: draft.graph,
          settings: draft.settings,
          published_by: userId,
        }),
      );
      await manager.getRepository(AutomationEntity).update(
        { id },
        { published_version_id: version.id, status: 'active', has_unpublished_changes: false, updated_by: userId },
      );
      await this.rebuildLookups(manager, automation, version, true, timezone);
    });
    return this.find(organizationId, id);
  }

  /** Stops new runs. Runs in progress continue unless `stopRuns`. */
  async pause(organizationId: string, id: string, opts: { stopRuns?: boolean } = {}, userId: string | null = null): Promise<AutomationEntity> {
    const automation = await this.find(organizationId, id);
    await this.dataSource.transaction(async (manager) => {
      await manager.getRepository(AutomationEntity).update({ id }, { status: 'paused', updated_by: userId });
      await manager.getRepository(AutomationTriggerEntity).update({ automation_id: id }, { is_active: false });
      await manager.getRepository(AutomationScheduleEntity).update({ automation_id: id }, { is_active: false });
    });
    if (opts.stopRuns) await this.store.stop({ automationId: automation.id }, 'cancelled', 'The automation was paused');
    return this.find(organizationId, id);
  }

  /** Active again with the published version (publishing first if it never was). */
  async resume(organizationId: string, id: string, userId: string | null): Promise<AutomationEntity> {
    const automation = await this.find(organizationId, id);
    if (!automation.published_version_id) return this.publish(organizationId, id, userId);
    const version = await this.versions.findOneOrFail({ where: { id: automation.published_version_id } });
    const timezone = await this.time.timezone(organizationId);
    await this.dataSource.transaction(async (manager) => {
      await manager.getRepository(AutomationEntity).update({ id }, { status: 'active', updated_by: userId });
      await this.rebuildLookups(manager, automation, version, true, timezone);
    });
    return this.find(organizationId, id);
  }

  async duplicate(organizationId: string, id: string, userId: string | null): Promise<AutomationEntity> {
    const source = await this.find(organizationId, id);
    return this.create(
      organizationId,
      { name: `${source.name} (copy)`, description: source.description, category: source.category === 'custom' ? 'custom' : source.category, draft: source.draft },
      userId,
    );
  }

  async remove(organizationId: string, id: string): Promise<void> {
    const automation = await this.find(organizationId, id);
    if (automation.is_system) throw new BadRequestException('Platform automations cannot be deleted — pause them instead');
    await this.automations.delete({ id: automation.id, organization_id: organizationId });
  }

  /**
   * Creates (or leaves alone) an automation installed by the platform. Keyed by
   * `template_key`, so installing twice never duplicates it.
   */
  async install(organizationId: string, input: InstallAutomationInput): Promise<{ automation: AutomationEntity; created: boolean }> {
    const existing = await this.automations.findOne({ where: { organization_id: organizationId, template_key: input.template_key } });
    if (existing) return { automation: existing, created: false };
    const draft = normalizeDefinition(input.draft);
    const inserted = rowsOf<{ id: string }>(
      await this.automations.manager.query(
        `INSERT INTO automation.automations (organization_id, name, description, category, template_key, is_system, draft, status, has_unpublished_changes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'draft', true)
         ON CONFLICT (organization_id, template_key) WHERE template_key IS NOT NULL DO NOTHING
         RETURNING id`,
        [organizationId, input.name, input.description ?? null, input.category ?? 'custom', input.template_key, input.is_system, JSON.stringify(draft)],
      ),
    );
    if (!inserted.length) {
      return { automation: await this.automations.findOneOrFail({ where: { organization_id: organizationId, template_key: input.template_key } }), created: false };
    }
    const id = inserted[0].id;
    await this.publishWithoutOrgChecks(organizationId, id, draft, input.active);
    return { automation: await this.find(organizationId, id), created: true };
  }

  /**
   * Publishing for the installer: the structure is still validated, but org
   * data (e.g. "connect an AI agent first") is not required — a system
   * automation may be installed paused before the organization sets it up.
   */
  private async publishWithoutOrgChecks(organizationId: string, id: string, draft: AutomationDefinition, active: boolean): Promise<void> {
    const result = validateAutomation(draft, { timezone: await this.time.timezone(organizationId) });
    if (!result.valid) throw new Error(`System automation is invalid: ${result.issues.map((i) => i.message).join('; ')}`);
    const automation = await this.find(organizationId, id);
    const timezone = await this.time.timezone(organizationId);
    await this.dataSource.transaction(async (manager) => {
      const version = await manager.getRepository(AutomationVersionEntity).save(
        manager.getRepository(AutomationVersionEntity).create({
          automation_id: id,
          organization_id: organizationId,
          version: 1,
          triggers: draft.triggers,
          graph: draft.graph,
          settings: draft.settings,
          published_by: null,
        }),
      );
      await manager
        .getRepository(AutomationEntity)
        .update({ id }, { published_version_id: version.id, status: active ? 'active' : 'paused', has_unpublished_changes: false });
      await this.rebuildLookups(manager, automation, version, active, timezone);
    });
  }

  // ── Internals ───────────────────────────────────────────────────────────

  /** Replaces the trigger and schedule rows of an automation with those of `version`. */
  private async rebuildLookups(
    manager: EntityManager,
    automation: AutomationEntity,
    version: AutomationVersionEntity,
    active: boolean,
    timezone: string,
  ): Promise<void> {
    const triggerRepo = manager.getRepository(AutomationTriggerEntity);
    const scheduleRepo = manager.getRepository(AutomationScheduleEntity);
    await triggerRepo.delete({ automation_id: automation.id });
    await scheduleRepo.delete({ automation_id: automation.id });
    const now = new Date();
    for (const trigger of version.triggers) {
      if (trigger.key === 'manual') continue;
      if (trigger.key === 'schedule') {
        const tz = trigger.schedule.timezone || timezone;
        const next = nextOccurrence(trigger.schedule, tz, now);
        await scheduleRepo.save(
          scheduleRepo.create({
            organization_id: automation.organization_id,
            automation_id: automation.id,
            version_id: version.id,
            spec: trigger.schedule,
            timezone: tz,
            next_run_at: next,
            is_active: active && !!next,
          }),
        );
        continue;
      }
      await triggerRepo.save(
        triggerRepo.create({
          organization_id: automation.organization_id,
          automation_id: automation.id,
          version_id: version.id,
          trigger_key: trigger.key,
          filters: trigger.filters ?? { any: [] },
          is_active: active,
        }),
      );
    }
  }

  async validationContext(organizationId: string): Promise<ValidationContext> {
    const [stages, users, connections, timezone] = await Promise.all([
      this.stages.find({ where: { organization_id: organizationId }, select: ['id'] }),
      this.users.find({ where: { organization_id: organizationId }, select: ['id'] }),
      this.ai.list(organizationId),
      this.time.timezone(organizationId),
    ]);
    return {
      stageIds: new Set(stages.map((s) => s.id)),
      userIds: new Set(users.map((u) => u.id)),
      aiConnectionIds: new Set(connections.map((c) => c.id)),
      hasAiConnection: connections.length > 0,
      timezone,
    };
  }

  private async stats(ids: string[]): Promise<Map<string, AutomationSummary['stats']>> {
    const rows = rowsOf<{ automation_id: string; active_runs: number; completed_7d: number; failed_7d: number }>(
      await this.automations.manager.query(
        `SELECT automation_id,
                COUNT(*) FILTER (WHERE status IN ('waiting', 'running'))::int AS active_runs,
                COUNT(*) FILTER (WHERE status IN ('completed', 'exited') AND finished_at > NOW() - INTERVAL '7 days')::int AS completed_7d,
                COUNT(*) FILTER (WHERE status = 'failed' AND finished_at > NOW() - INTERVAL '7 days')::int AS failed_7d
           FROM automation.automation_runs
          WHERE automation_id = ANY($1::uuid[])
          GROUP BY automation_id`,
        [ids],
      ),
    );
    return new Map(rows.map((r) => [r.automation_id, { active_runs: r.active_runs, completed_7d: r.completed_7d, failed_7d: r.failed_7d }]));
  }

  private summary(a: AutomationEntity, version: AutomationVersionEntity | null, stats?: AutomationSummary['stats']): AutomationSummary {
    const definition = version ?? normalizeDefinition(a.draft);
    const triggers = definition.triggers;
    return {
      id: a.id,
      name: a.name,
      description: a.description,
      status: a.status,
      category: a.category,
      template_key: a.template_key,
      is_system: a.is_system,
      trigger_keys: triggers.map((t) => t.key as TriggerKey),
      sends_to_ai: (definition.graph?.nodes ?? []).some((n) => n.type === 'send_to_ai'),
      published_version: version?.version ?? null,
      has_unpublished_changes: a.has_unpublished_changes,
      stats: stats ?? { active_runs: 0, completed_7d: 0, failed_7d: 0 },
      updated_at: a.updated_at.toISOString(),
    };
  }
}
