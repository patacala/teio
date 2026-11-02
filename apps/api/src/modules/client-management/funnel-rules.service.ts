import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { ContactEntity } from './contact.entity';
import { FunnelStageEntity } from '../funnels/funnel-stage.entity';
import { FunnelRuleEntity } from '../funnels/funnel-rule.entity';
import { ContactFunnelHistoryEntity } from '../funnels/contact-funnel-history.entity';
import { ClientManagementService } from './client-management.service';

/** Hours a manual stage change is protected from being overridden by automation. */
const MANUAL_OVERRIDE_WINDOW_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class FunnelRulesService {
  private readonly logger = new Logger(FunnelRulesService.name);

  constructor(
    @InjectRepository(ContactEntity)
    private readonly contactRepo: Repository<ContactEntity>,
    @InjectRepository(FunnelStageEntity)
    private readonly stageRepo: Repository<FunnelStageEntity>,
    @InjectRepository(FunnelRuleEntity)
    private readonly ruleRepo: Repository<FunnelRuleEntity>,
    @InjectRepository(ContactFunnelHistoryEntity)
    private readonly historyRepo: Repository<ContactFunnelHistoryEntity>,
    private readonly clientService: ClientManagementService,
  ) {}

  /**
   * Moves the contact forward if an active rule matches the event. Silent —
   * never messages the customer. Safe to call fire-and-forget; it swallows and
   * logs its own errors so a bad rule can never break event processing.
   */
  async evaluate(organizationId: string, contactId: string, triggerEvent: string): Promise<void> {
    try {
      const contact = await this.contactRepo.findOne({
        where: { id: contactId, organization_id: organizationId },
        select: ['id', 'lead_stage', 'custom_fields'],
      });
      // Not in a funnel yet — initial placement is out of scope for the engine.
      if (!contact?.lead_stage) return;

      const current = await this.stageRepo.findOne({ where: { id: contact.lead_stage } });
      if (!current) return;
      if (current.is_terminal) return; // won/lost: automation never moves them

      // Anti-override: respect a recent manual move.
      const last = await this.historyRepo.findOne({
        where: { contact_id: contactId },
        order: { created_at: 'DESC' },
      });
      if (
        last &&
        last.source === 'manual' &&
        Date.now() - last.created_at.getTime() < MANUAL_OVERRIDE_WINDOW_MS
      ) {
        return;
      }

      // Active rules for this event: org-specific first, then system defaults.
      const rules = await this.ruleRepo.find({
        where: [
          { trigger_event: triggerEvent, is_active: true, organization_id: organizationId },
          { trigger_event: triggerEvent, is_active: true, organization_id: IsNull() },
        ],
        order: { priority: 'DESC' },
      });

      for (const rule of rules) {
        if (rule.funnel_id && rule.funnel_id !== current.funnel_id) continue;
        if (rule.from_stage_types.length && !rule.from_stage_types.includes(current.stage_type)) {
          continue;
        }
        if (!this.matchesConditions(rule.conditions, contact.custom_fields)) continue;

        // Resolve the portable target to the real stage in THIS contact's funnel.
        const target = await this.stageRepo.findOne({
          where: { funnel_id: current.funnel_id ?? undefined, stage_type: rule.to_stage_type },
        });
        if (!target || target.id === current.id) continue;
        if (rule.direction_policy === 'forward_only' && target.position <= current.position) {
          continue;
        }

        await this.clientService.updateStage(
          contactId,
          organizationId,
          target.id,
          undefined,
          'automation',
          rule.name,
        );
        this.logger.log(
          `Rule '${rule.name}' moved contact ${contactId}: ${current.name} → ${target.name}`,
        );
        return; // first matching rule wins
      }
    } catch (err) {
      this.logger.warn(
        `Funnel rule evaluation failed for contact ${contactId} on ${triggerEvent}: ${(err as Error).message}`,
      );
    }
  }

  /**
   * Checks a rule's `conditions` against the contact's captured custom_fields.
   * Shape: `{ custom_fields: { <key>: <expected> } }` where `<expected>` is
   * `"*"` (the field must just be present/non-empty) or a literal value. Booleans
   * are matched loosely so the agent's `true`/`"true"`/`"yes"` all count. Empty
   * conditions always match.
   */
  private matchesConditions(
    conditions: Record<string, unknown> | null | undefined,
    customFields: Record<string, unknown> | null | undefined,
  ): boolean {
    const required = (conditions?.custom_fields ?? {}) as Record<string, unknown>;
    const fields = customFields ?? {};
    for (const [key, expected] of Object.entries(required)) {
      const actual = fields[key];
      if (expected === '*') {
        if (actual === undefined || actual === null || actual === '') return false;
      } else if (expected === true) {
        if (!(actual === true || actual === 'true' || actual === 'yes')) return false;
      } else if (actual !== expected) {
        return false;
      }
    }
    return true;
  }
}
