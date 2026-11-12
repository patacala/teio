import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { ContactEntity } from './contact.entity';
import { FunnelStageEntity } from '../funnels/funnel-stage.entity';
import { FunnelRuleEntity } from '../funnels/funnel-rule.entity';
import { ClientManagementService } from './client-management.service';

/** Re-reads after a concurrent stage change (e.g. appointment.created + confirmed emitted together). */
const MAX_MOVE_ATTEMPTS = 3;

type MoveOutcome = 'moved' | 'no_match' | 'conflict';

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
    private readonly clientService: ClientManagementService,
  ) {}

  /**
   * Moves the contact forward if an active rule matches the event. Silent —
   * never messages the customer. Safe to call fire-and-forget; it swallows and
   * logs its own errors so a bad rule can never break event processing.
   */
  async evaluate(
    organizationId: string,
    contactId: string,
    triggerEvent: string,
    eventData: Record<string, unknown> = {},
  ): Promise<void> {
    try {
      for (let attempt = 1; attempt <= MAX_MOVE_ATTEMPTS; attempt++) {
        const outcome = await this.tryMove(organizationId, contactId, triggerEvent, eventData);
        if (outcome !== 'conflict') return;
      }
      this.logger.warn(
        `Funnel rule evaluation for contact ${contactId} on ${triggerEvent} gave up after ${MAX_MOVE_ATTEMPTS} concurrent stage changes`,
      );
    } catch (err) {
      this.logger.warn(
        `Funnel rule evaluation failed for contact ${contactId} on ${triggerEvent}: ${(err as Error).message}`,
      );
    }
  }

  private async tryMove(
    organizationId: string,
    contactId: string,
    triggerEvent: string,
    eventData: Record<string, unknown>,
  ): Promise<MoveOutcome> {
    const contact = await this.contactRepo.findOne({
      where: { id: contactId, organization_id: organizationId },
      select: ['id', 'lead_stage', 'custom_fields'],
    });
    // Not in a funnel yet — initial placement is out of scope for the engine.
    if (!contact?.lead_stage) return 'no_match';

    const current = await this.stageRepo.findOne({
      where: { id: contact.lead_stage, organization_id: organizationId },
    });
    // A stage outside any funnel has no siblings to resolve a target against.
    if (!current?.funnel_id) return 'no_match';
    if (current.is_terminal) return 'no_match'; // won/lost: automation never moves them

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
      if (!this.matchesConditions(rule.conditions, contact.custom_fields, eventData)) continue;

      // Resolve the portable target to the real stage in THIS contact's funnel.
      // Lowest position wins when a funnel has several stages of the same type.
      const target = await this.stageRepo.findOne({
        where: {
          organization_id: organizationId,
          funnel_id: current.funnel_id,
          stage_type: rule.to_stage_type,
        },
        order: { position: 'ASC' },
      });
      if (!target || target.id === current.id) continue;
      if (rule.direction_policy === 'forward_only' && target.position <= current.position) {
        continue;
      }

      const moved = await this.clientService.moveStageIfUnchanged(
        contactId,
        organizationId,
        current.id,
        target.id,
        rule.name,
      );
      if (!moved) return 'conflict';

      this.logger.log(
        `Rule '${rule.name}' moved contact ${contactId}: ${current.name} → ${target.name}`,
      );
      return 'moved'; // first matching rule wins
    }
    return 'no_match';
  }

  /**
   * Checks a rule's `conditions`. Shape:
   * `{ custom_fields?: { <key>: <expected> }, event?: { <key>: <expected> } }` —
   * `custom_fields` is matched against the contact's captured data, `event`
   * against the triggering event's payload (e.g. `{ sequence_type: 'no_response' }`).
   * `<expected>` is `"*"` (must be present/non-empty) or a literal value.
   * Booleans are matched loosely so the agent's `true`/`"true"`/`"yes"` all
   * count. Empty conditions always match.
   */
  private matchesConditions(
    conditions: Record<string, unknown> | null | undefined,
    customFields: Record<string, unknown> | null | undefined,
    eventData: Record<string, unknown>,
  ): boolean {
    return (
      this.matchesFields(conditions?.custom_fields, customFields) &&
      this.matchesFields(conditions?.event, eventData)
    );
  }

  private matchesFields(required: unknown, actualValues: Record<string, unknown> | null | undefined): boolean {
    const fields = actualValues ?? {};
    for (const [key, expected] of Object.entries((required ?? {}) as Record<string, unknown>)) {
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
