import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import type { ConditionGroup } from '@crm/shared';
import { AutomationEntity } from '../entities/automation.entity';
import { AutomationTriggerEntity } from '../entities/automation-trigger.entity';
import { AutomationVersionEntity } from '../entities/automation-version.entity';
import { AutomationRunEntity, type RunContext } from '../entities/automation-run.entity';
import { AutomationRuntimeService } from '../runtime/automation-runtime.service';
import { RunStoreService } from '../runtime/run-store.service';
import { evaluateCondition } from '../conditions/condition-evaluator';
import type { RunVars } from '../variables/run-vars';
import type { TriggerEvent } from './trigger-events';
import { stopRunsForOptOut } from '../runtime/opt-out';

/** Runs before an organization's first event is handled (installs its system automations). */
export interface BeforeEventHook {
  beforeEvent(organizationId: string): Promise<void>;
}
export const BEFORE_EVENT_HOOK = Symbol('AUTOMATION_BEFORE_EVENT_HOOK');

function mentionsSenderType(filters: ConditionGroup | null | undefined): boolean {
  return !!filters?.any?.some((b) => b.all?.some((r) => r.field === 'trigger.sender_type'));
}

export interface EnrollResult {
  started: string[];
  exited: string[];
  resumed: string[];
}

/**
 * Reacts to an event for a contact: ends runs whose automation exits on it,
 * wakes runs waiting for it, then starts the automations it triggers.
 */
@Injectable()
export class EnrollmentService {
  private readonly logger = new Logger(EnrollmentService.name);
  private beforeEventHook: BeforeEventHook | null = null;

  constructor(
    @InjectRepository(AutomationTriggerEntity)
    private readonly triggers: Repository<AutomationTriggerEntity>,
    @InjectRepository(AutomationVersionEntity)
    private readonly versions: Repository<AutomationVersionEntity>,
    @InjectRepository(AutomationRunEntity)
    private readonly runs: Repository<AutomationRunEntity>,
    private readonly runtime: AutomationRuntimeService,
    private readonly store: RunStoreService,
  ) {}

  /** The installer registers itself here (avoids a dependency cycle). */
  setBeforeEventHook(hook: BeforeEventHook): void {
    this.beforeEventHook = hook;
  }

  async handleEvent(event: TriggerEvent): Promise<EnrollResult> {
    const result: EnrollResult = { started: [], exited: [], resumed: [] };
    if (!event.contactId) return result;
    await this.beforeEventHook?.beforeEvent(event.organizationId);

    const data = await this.runtime.loadData({
      organization_id: event.organizationId,
      contact_id: event.contactId,
      conversation_id: event.conversationId,
    });
    if (!data.contact) return result; // deleted meanwhile

    // However the contact got the "opt-out" tag, automations that respect it stop.
    if (event.key === 'contact.tag_added' && event.data.tag === 'opt-out') {
      await stopRunsForOptOut(this.runs.manager, event.organizationId, event.contactId);
    }
    const eventVars = this.runtime.varsFor({ context: { trigger: { key: event.key, data: event.data } }, trigger_key: event.key }, data);

    // 1 + 2. Active runs of the contact: exit rules, then waits.
    const active = await this.store.findActiveForContact(event.organizationId, event.contactId);
    if (active.length) {
      const versions = await this.versionsById(active.map((r) => r.version_id));
      for (const run of active) {
        const settings = versions.get(run.version_id)?.settings;
        const exitRule = settings?.exit_on?.find((rule) => rule.trigger === event.key && evaluateCondition(rule.filters, eventVars));
        // A run's own message never ends that run.
        if (exitRule && event.data.automation_run_id !== run.id) {
          const stopped = await this.store.stop({ ids: [run.id] }, 'exited', `Exited: ${event.key}`);
          result.exited.push(...stopped);
          continue;
        }
        const waiting = run.waiting_for;
        if (run.status === 'waiting' && waiting?.events?.includes(event.key as never)) {
          if (evaluateCondition(waiting.filters, { ...this.runVars(run, data), trigger: event.data })) {
            if (await this.runtime.resumeOnEvent(run, { key: event.key, data: event.data })) result.resumed.push(run.id);
          }
        }
      }
    }

    // 3. Automations this event starts.
    const candidates = await this.triggers.find({
      where: { organization_id: event.organizationId, trigger_key: event.key, is_active: true },
    });
    for (const trigger of candidates) {
      const run = await this.tryEnroll(trigger, event, data, eventVars);
      if (run) result.started.push(run);
    }
    return result;
  }

  private async tryEnroll(
    trigger: AutomationTriggerEntity,
    event: TriggerEvent,
    data: Awaited<ReturnType<AutomationRuntimeService['loadData']>>,
    eventVars: RunVars,
  ): Promise<string | null> {
    // An automation's own messages never start it again; other automations'
    // messages only when the trigger filters on who sent the message.
    if (event.key === 'message.sent' && event.data.sender_type === 'automation') {
      const sourceRun = event.data.automation_run_id ? await this.store.findById(String(event.data.automation_run_id)) : null;
      if (sourceRun?.automation_id === trigger.automation_id) return null;
      if (!mentionsSenderType(trigger.filters)) return null;
    }
    if (!evaluateCondition(trigger.filters, eventVars)) return null;

    const version = await this.versions.findOne({ where: { id: trigger.version_id } });
    if (!version) return null;
    if (version.settings?.respect_opt_out !== false && (data.contact?.tags ?? []).includes('opt-out')) return null;
    if (version.settings?.reentry === 'never') {
      const before = await this.runs.exist({ where: { automation_id: trigger.automation_id, contact_id: event.contactId! } });
      if (before) return null;
    }

    const context: RunContext = { trigger: { key: event.key, event_id: event.eventId, data: event.data, raw: event.raw } };
    const run = await this.runtime.start({
      organizationId: event.organizationId,
      automationId: trigger.automation_id,
      versionId: trigger.version_id,
      scope: 'contact',
      contactId: event.contactId,
      conversationId: event.conversationId,
      triggerKey: event.key,
      triggerEventId: event.eventId,
      context,
      exclusive: !version.settings?.allow_parallel_runs,
    });
    return run?.id ?? null;
  }

  /** A person (or the API) adds contacts to an automation with a manual trigger. */
  async enrollManually(automation: AutomationEntity, version: AutomationVersionEntity, contactIds: string[], actorId: string | null): Promise<{ started: string[]; skipped: string[] }> {
    const started: string[] = [];
    const skipped: string[] = [];
    for (const contactId of [...new Set(contactIds)]) {
      const data = await this.runtime.loadData({ organization_id: automation.organization_id, contact_id: contactId, conversation_id: null });
      if (!data.contact || (version.settings?.respect_opt_out !== false && (data.contact.tags ?? []).includes('opt-out'))) {
        skipped.push(contactId);
        continue;
      }
      if (version.settings?.reentry === 'never' && (await this.runs.exist({ where: { automation_id: automation.id, contact_id: contactId } }))) {
        skipped.push(contactId);
        continue;
      }
      const run = await this.runtime.start({
        organizationId: automation.organization_id,
        automationId: automation.id,
        versionId: version.id,
        scope: 'contact',
        contactId,
        conversationId: null,
        triggerKey: 'manual',
        triggerEventId: null,
        context: { trigger: { key: 'manual', data: { added_by: actorId }, raw: {} } },
        exclusive: !version.settings?.allow_parallel_runs,
      });
      (run ? started : skipped).push(run?.id ?? contactId);
    }
    return { started, skipped };
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

  private runVars(run: AutomationRunEntity, data: Awaited<ReturnType<AutomationRuntimeService['loadData']>>): RunVars {
    return this.runtime.varsFor(run, data);
  }

  private async versionsById(ids: string[]): Promise<Map<string, AutomationVersionEntity>> {
    const unique = [...new Set(ids)];
    const rows = unique.length ? await this.versions.find({ where: { id: In(unique) } }) : [];
    return new Map(rows.map((v) => [v.id, v]));
  }
}
