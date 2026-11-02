import { Injectable, Logger, ConflictException, NotFoundException, BadRequestException, Optional, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ClientProxy } from '@nestjs/microservices';
import { Repository, IsNull } from 'typeorm';
import { FIRST_FOLLOW_UP_DELAY_HOURS, FOLLOW_UP_HOUR } from '@crm/shared';
import { RABBITMQ_SERVICE, RABBITMQ_QUEUES } from '../../infrastructure/rabbitmq/rabbitmq.constants';
import type { CreateSequenceInput, SequenceStatus, CompletionReason } from '@crm/shared';
import { AutomationSequenceEntity } from './automation-sequence.entity';
import { AppointmentEntity } from '../scheduling/appointment.entity';
import { WorkScheduleEntity } from '../scheduling/work-schedule.entity';
import { ContactEntity } from '../client-management/contact.entity';
import { ConversationEntity } from '../conversation-management/conversation.entity';
import { SequenceTemplateEntity } from './sequence-template.entity';
import { SequenceTemplateStepEntity } from './sequence-template-step.entity';
import { SequenceStepEntity } from './sequence-step.entity';
import { OrganizationEntity } from '../organizations/organization.entity';

/** Fallback when a sequence has no cloned steps (created before migration 030). */
const DEFAULT_STEP = { action: 'send_message', channel_strategy: 'auto', delay_hours: 24 };

/** Returns next Mon-Fri at 10:00 UTC. Skips weekends. */
function getNextBusinessDayAt10(): Date {
  return addBusinessDelay(24);
}

/**
 * Advances `delayHours` from now, then lands on the next weekday at
 * FOLLOW_UP_HOUR. Sub-day delays keep their exact time so short cadences
 * (appointment reminders) are not pushed to the next morning.
 */
function addBusinessDelay(delayHours: number): Date {
  const next = new Date(Date.now() + delayHours * 3600_000);
  if (delayHours < 24) return next;

  // Skip Saturday (6) and Sunday (0)
  while (next.getUTCDay() === 0 || next.getUTCDay() === 6) {
    next.setUTCDate(next.getUTCDate() + 1);
  }
  next.setUTCHours(FOLLOW_UP_HOUR, 0, 0, 0);
  return next;
}

@Injectable()
export class AutomationSequenceService {
  private readonly logger = new Logger(AutomationSequenceService.name);

  constructor(
    @InjectRepository(AutomationSequenceEntity)
    private readonly repo: Repository<AutomationSequenceEntity>,
    @InjectRepository(AppointmentEntity)
    private readonly appointmentRepo: Repository<AppointmentEntity>,
    @InjectRepository(WorkScheduleEntity)
    private readonly calendarRepo: Repository<WorkScheduleEntity>,
    @InjectRepository(ContactEntity)
    private readonly contactRepo: Repository<ContactEntity>,
    @InjectRepository(ConversationEntity)
    private readonly conversationRepo: Repository<ConversationEntity>,
    @InjectRepository(SequenceTemplateEntity)
    private readonly templateRepo: Repository<SequenceTemplateEntity>,
    @InjectRepository(SequenceTemplateStepEntity)
    private readonly templateStepRepo: Repository<SequenceTemplateStepEntity>,
    @InjectRepository(SequenceStepEntity)
    private readonly stepRepo: Repository<SequenceStepEntity>,
    @InjectRepository(OrganizationEntity)
    private readonly orgRepo: Repository<OrganizationEntity>,
    @Optional() @Inject(RABBITMQ_SERVICE) private readonly rmqClient?: ClientProxy,
  ) {}

  /**
   * The cadence to clone. An explicit `templateId` wins; otherwise it falls
   * back to the org's own template for this sequence_type, then the platform
   * default, then the platform `no_response` one.
   *
   * The fallbacks order by created_at because an org can own several active
   * templates of the same type — duplicating is the only way to add one — and
   * an unordered findOne would pick a different row run to run.
   */
  private async resolveTemplate(
    organizationId: string,
    sequenceType: string,
    templateId?: string,
  ): Promise<SequenceTemplateEntity | null> {
    if (templateId) {
      const pinned = await this.templateRepo.findOne({ where: { id: templateId } });
      if (!pinned) throw new NotFoundException(`Template ${templateId} not found`);
      if (pinned.organization_id && pinned.organization_id !== organizationId) {
        throw new NotFoundException(`Template ${templateId} not found`);
      }
      return pinned;
    }

    return (
      (await this.templateRepo.findOne({
        where: { organization_id: organizationId, sequence_type: sequenceType, is_active: true },
        order: { created_at: 'ASC' },
      })) ??
      (await this.templateRepo.findOne({
        where: { organization_id: IsNull(), sequence_type: sequenceType, is_active: true },
        order: { created_at: 'ASC' },
      })) ??
      (await this.templateRepo.findOne({
        where: { organization_id: IsNull(), sequence_type: 'no_response', is_active: true },
        order: { created_at: 'ASC' },
      }))
    );
  }

  /**
   * Copies a template's steps into this sequence.
   *
   * Cloned rather than referenced (same as FunnelsService.applyTemplate) so
   * editing a template never changes sequences already in flight.
   */
  private async cloneStepsFromTemplate(
    organizationId: string,
    sequence: AutomationSequenceEntity,
    template: SequenceTemplateEntity | null,
  ): Promise<SequenceStepEntity[]> {
    if (!template?.steps?.length) {
      this.logger.warn(
        `No template found for sequence_type=${sequence.sequence_type} — sequence ${sequence.id} will use defaults`,
      );
      return [];
    }

    const sorted = [...template.steps].sort((a, b) => a.position - b.position);
    const steps = await this.stepRepo.save(
      sorted.map((s) =>
        this.stepRepo.create({
          organization_id: organizationId,
          sequence_id: sequence.id,
          position: s.position,
          action: s.action,
          channel_strategy: s.channel_strategy,
          delay_hours: s.delay_hours,
          config: s.config ?? {},
        }),
      ),
    );

    sequence.template_id = template.id;
    sequence.max_attempts = steps.length;
    await this.repo.save(sequence);

    this.logger.log(
      `Cloned ${steps.length} steps from template "${template.name}" into sequence ${sequence.id}`,
    );
    return steps;
  }

  /** The plan for a given attempt. Falls back for pre-migration sequences. */
  private async getStep(
    sequenceId: string,
    position: number,
  ): Promise<{ action: string; channel_strategy: string; delay_hours: number }> {
    const step = await this.stepRepo.findOne({
      where: { sequence_id: sequenceId, position },
    });
    return step ?? DEFAULT_STEP;
  }

  private async areSequencesEnabled(organizationId: string): Promise<boolean> {
    const org = await this.orgRepo.findOne({
      where: { id: organizationId },
      select: ['id', 'settings'],
    });
    if (!org) return false;
    
    // Default to enabled if not explicitly set
    return org.settings?.sequences_enabled !== false;
  }

  /* ---------------------------------------------------------------------- */
  /* Template management (consumed by /config/sequences)                     */
  /* ---------------------------------------------------------------------- */

  /**
   * Platform defaults plus this org's own templates. An org template for a
   * given sequence_type shadows the platform one at clone time.
   */
  async listTemplates(organizationId: string): Promise<SequenceTemplateEntity[]> {
    const templates = await this.templateRepo.find({
      where: [{ organization_id: IsNull() }, { organization_id: organizationId }],
      order: { sequence_type: 'ASC', created_at: 'ASC' },
    });
    return templates.map((t) => {
      t.steps = [...(t.steps ?? [])].sort((a, b) => a.position - b.position);
      return t;
    });
  }

  async getTemplate(organizationId: string, id: string): Promise<SequenceTemplateEntity> {
    const template = await this.templateRepo.findOne({ where: { id } });
    if (!template) throw new NotFoundException(`Template ${id} not found`);
    if (template.organization_id && template.organization_id !== organizationId) {
      throw new NotFoundException(`Template ${id} not found`);
    }
    template.steps = [...(template.steps ?? [])].sort((a, b) => a.position - b.position);
    return template;
  }

  /**
   * Copies a platform template into an org-owned one it can edit.
   * Platform templates are shared by every org, so they are never mutated.
   */
  async duplicateTemplate(
    organizationId: string,
    templateId: string,
    name?: string,
  ): Promise<SequenceTemplateEntity> {
    const source = await this.getTemplate(organizationId, templateId);

    const copy = await this.templateRepo.save(
      this.templateRepo.create({
        organization_id: organizationId,
        name: name ?? `${source.name} (copia)`,
        description: source.description,
        sequence_type: source.sequence_type,
        is_active: true,
      }),
    );

    await this.templateStepRepo.save(
      (source.steps ?? []).map((s) =>
        this.templateStepRepo.create({
          template_id: copy.id,
          position: s.position,
          action: s.action,
          channel_strategy: s.channel_strategy,
          delay_hours: s.delay_hours,
          config: s.config ?? {},
        }),
      ),
    );

    return this.getTemplate(organizationId, copy.id);
  }

  private assertOwned(template: SequenceTemplateEntity, organizationId: string): void {
    if (template.organization_id !== organizationId) {
      throw new BadRequestException(
        'Platform templates cannot be edited — duplicate it first to get an editable copy',
      );
    }
  }

  async updateTemplate(
    organizationId: string,
    id: string,
    dto: { name?: string; description?: string; is_active?: boolean },
  ): Promise<SequenceTemplateEntity> {
    const template = await this.getTemplate(organizationId, id);
    this.assertOwned(template, organizationId);

    if (dto.name !== undefined) template.name = dto.name;
    if (dto.description !== undefined) template.description = dto.description;
    if (dto.is_active !== undefined) template.is_active = dto.is_active;

    await this.templateRepo.save(template);
    return this.getTemplate(organizationId, id);
  }

  /**
   * Replaces the whole step list in one shot — the editor always submits the
   * full ordered cadence, which keeps `position` contiguous by construction.
   */
  async replaceTemplateSteps(
    organizationId: string,
    id: string,
    steps: Array<{ action: string; channel_strategy: string; delay_hours: number; config?: Record<string, unknown> }>,
  ): Promise<SequenceTemplateEntity> {
    const template = await this.getTemplate(organizationId, id);
    this.assertOwned(template, organizationId);

    if (!steps.length) {
      throw new BadRequestException('A template needs at least one step');
    }

    await this.templateStepRepo.delete({ template_id: id });
    await this.templateStepRepo.save(
      steps.map((s, i) =>
        this.templateStepRepo.create({
          template_id: id,
          position: i + 1,
          action: s.action,
          channel_strategy: s.channel_strategy,
          delay_hours: s.delay_hours,
          config: s.config ?? {},
        }),
      ),
    );

    return this.getTemplate(organizationId, id);
  }

  async deleteTemplate(organizationId: string, id: string): Promise<void> {
    const template = await this.getTemplate(organizationId, id);
    this.assertOwned(template, organizationId);
    // Sequences keep their cloned steps — the copy is independent by design
    await this.templateRepo.remove(template);
  }

  /** The cloned cadence of one sequence, for the contact's follow-up card. */
  async getSequenceSteps(organizationId: string, sequenceId: string): Promise<SequenceStepEntity[]> {
    return this.stepRepo.find({
      where: { organization_id: organizationId, sequence_id: sequenceId },
      order: { position: 'ASC' },
    });
  }

  /**
   * Records what a step actually did, once executed.
   *
   * `executed_action` differs from `action` when a step degraded — a `call`
   * with no n8n webhook falls back to a message — so degradations stay
   * countable instead of vanishing into a log line. `resolved_channel` answers
   * "which channel strategy actually reaches people?".
   */
  async recordStepOutcome(
    sequenceId: string,
    position: number | undefined,
    executedAction: string,
    resolvedChannel?: string,
  ): Promise<void> {
    if (!position) return;
    try {
      await this.stepRepo.update(
        { sequence_id: sequenceId, position },
        { executed_action: executedAction, resolved_channel: resolvedChannel ?? null },
      );
    } catch (err) {
      this.logger.warn(`Failed to record outcome for sequence ${sequenceId} step ${position}: ${err}`);
    }
  }

  /** Channel the contact last used, so follow-ups stay on their thread. */
  private async resolveChannel(dto: CreateSequenceInput): Promise<string | null> {
    if (dto.conversation_id) {
      const conv = await this.conversationRepo.findOne({
        where: { id: dto.conversation_id },
        select: ['id', 'channel'],
      });
      if (conv?.channel) return conv.channel;
    }
    return (dto.metadata?.channel as string) ?? null;
  }

  async create(
    organizationId: string,
    dto: CreateSequenceInput,
  ): Promise<AutomationSequenceEntity> {
    // Check if sequences are enabled for this organization
    const enabled = await this.areSequencesEnabled(organizationId);
    if (!enabled) {
      this.logger.log(
        `Sequences disabled for organization ${organizationId} — skipping sequence creation`,
      );
      throw new ConflictException('Sequences are disabled for this organization');
    }

    // Resolved up front because a pinned template is the source of truth for
    // the type: checking the dto's type would let a reactivation cadence be
    // created under an already-running no_response sequence, and vice versa.
    const template = await this.resolveTemplate(
      organizationId,
      dto.sequence_type ?? 'no_response',
      dto.template_id,
    );
    const sequenceType = template?.sequence_type ?? dto.sequence_type ?? 'no_response';

    // One active sequence per contact PER TYPE — a contact can be in a
    // reactivation and a no_response cadence at the same time.
    const existing = await this.repo.findOne({
      where: {
        organization_id: organizationId,
        contact_id: dto.contact_id,
        sequence_type: sequenceType,
        status: 'active' as SequenceStatus,
      },
    });
    if (existing) {
      throw new ConflictException(
        `Contact ${dto.contact_id} already has an active "${sequenceType}" sequence (${existing.id})`,
      );
    }

    const now = new Date();
    const sequence = this.repo.create({
      organization_id: organizationId,
      contact_id: dto.contact_id,
      conversation_id: dto.conversation_id ?? undefined,
      sequence_type: sequenceType,
      current_attempt: 1,
      max_attempts: 7,
      status: 'active' as SequenceStatus,
      source: dto.source ?? 'manual',
      started_at: now,
      channel: await this.resolveChannel(dto),
      metadata: dto.metadata ?? {},
    });
    const saved = await this.repo.save(sequence) as AutomationSequenceEntity;

    // Clone the cadence before scheduling anything — createSequenceAppointment
    // reads step 1 from it. Also sets template_id and max_attempts.
    await this.cloneStepsFromTemplate(organizationId, saved, template);

    // Add 'follow-up' tag to contact
    try {
      const contact = await this.contactRepo.findOne({
        where: { id: dto.contact_id, organization_id: organizationId },
      });
      if (contact && !contact.tags?.includes('follow-up')) {
        contact.tags = [...(contact.tags ?? []), 'follow-up'];
        await this.contactRepo.save(contact);
      }
    } catch (err) {
      this.logger.warn(`Failed to add follow-up tag to contact ${dto.contact_id}: ${err}`);
    }

    // Manual: use provided due_at. Auto: delay by FIRST_FOLLOW_UP_DELAY_HOURS
    const dueAt = dto.due_at
      ? new Date(dto.due_at)
      : new Date(now.getTime() + FIRST_FOLLOW_UP_DELAY_HOURS * 3600_000);
    await this.createSequenceAppointment(organizationId, saved, dueAt, dto);

    const dueLabel = dto.due_at
      ? `at ${dueAt.toISOString()}`
      : `in ${FIRST_FOLLOW_UP_DELAY_HOURS}h`;
    this.logger.log(
      `Created sequence ${saved.id} type=${saved.sequence_type} for contact=${dto.contact_id} (first due ${dueLabel})`,
    );
    return saved;
  }

  async cancel(
    organizationId: string,
    sequenceId: string,
    reason: CompletionReason = 'manual',
  ): Promise<void> {
    const seq = await this.repo.findOne({
      where: { id: sequenceId, organization_id: organizationId },
    });
    if (!seq) throw new NotFoundException(`Sequence ${sequenceId} not found`);

    seq.status = 'cancelled';
    seq.completion_reason = reason;
    seq.completed_at = new Date();
    await this.repo.save(seq);

    // Cancel pending appointment
    await this.appointmentRepo
      .createQueryBuilder()
      .update(AppointmentEntity)
      .set({ status: 'cancelled' })
      .where('sequence_id = :sequenceId AND status IN (:...statuses)', {
        sequenceId,
        statuses: ['pending', 'scheduled', 'processing'],
      })
      .execute();

    this.logger.log(`Cancelled sequence ${sequenceId} reason=${reason}`);
  }

  async cancelAllForContact(
    organizationId: string,
    contactId: string,
    reason: CompletionReason = 'manual',
  ): Promise<number> {
    const activeSequences = await this.repo.find({
      where: {
        organization_id: organizationId,
        contact_id: contactId,
        status: 'active' as SequenceStatus,
      },
    });

    for (const seq of activeSequences) {
      await this.cancel(organizationId, seq.id, reason);
    }

    return activeSequences.length;
  }

  /**
   * Resets the sequence timer: cancels pending appointment (no longer needed) and schedules a new follow-up at +2h.
   * Called event-driven when contact sends an inbound message. Resets attempt to 1.
   */
  async resetTimer(organizationId: string, sequenceId: string): Promise<void> {
    const seq = await this.repo.findOne({
      where: { id: sequenceId, organization_id: organizationId },
    });
    if (!seq || seq.status !== 'active') return;

    // Cancel current pending appointment — contact responded before execution, no longer needed
    await this.appointmentRepo
      .createQueryBuilder()
      .update(AppointmentEntity)
      .set({ status: 'cancelled' })
      .where('sequence_id = :sequenceId AND status IN (:...statuses)', {
        sequenceId,
        statuses: ['pending', 'scheduled', 'processing'],
      })
      .execute();

    // Reset attempt counter — contact is responding
    seq.current_attempt = 1;
    await this.repo.save(seq);

    // Schedule new follow-up at +2h
    const dueAt = new Date(Date.now() + FIRST_FOLLOW_UP_DELAY_HOURS * 3600_000);
    await this.createSequenceAppointment(seq.organization_id, seq, dueAt);

    this.logger.log(`Sequence ${sequenceId} timer reset — contact responded, next follow-up in ${FIRST_FOLLOW_UP_DELAY_HOURS}h`);
  }

  async advanceOrComplete(organizationId: string, sequenceId: string): Promise<void> {
    const seq = await this.repo.findOne({
      where: { id: sequenceId, organization_id: organizationId },
    });
    if (!seq || seq.status !== 'active') return;

    if (seq.current_attempt >= seq.max_attempts) {
      seq.status = 'exhausted';
      seq.completion_reason = 'max_attempts';
      seq.completed_at = new Date();
      await this.repo.save(seq);
      this.rmqClient?.emit(RABBITMQ_QUEUES.SEQUENCE_EXHAUSTED, {
        organization_id: seq.organization_id,
        contact_id: seq.contact_id,
        sequence_id: seq.id,
        sequence_type: seq.sequence_type,
      });
      this.logger.log(`Sequence ${sequenceId} exhausted after ${seq.current_attempt} attempts`);
      return;
    }

    // Advance
    seq.current_attempt += 1;
    await this.repo.save(seq);

    // Spacing comes from the next step's delay_hours (weekends still skipped)
    const nextStep = await this.getStep(seq.id, seq.current_attempt);
    const dueAt = addBusinessDelay(nextStep.delay_hours);
    await this.createSequenceAppointment(seq.organization_id, seq, dueAt);

    this.logger.log(
      `Sequence ${sequenceId} advanced to attempt ${seq.current_attempt}/${seq.max_attempts} (next due: ${dueAt.toISOString()})`,
    );
  }

  async markCompleted(
    organizationId: string,
    sequenceId: string,
    reason: CompletionReason,
  ): Promise<void> {
    await this.repo
      .createQueryBuilder()
      .update(AutomationSequenceEntity)
      .set({
        status: 'completed' as SequenceStatus,
        completion_reason: reason,
        completed_at: new Date(),
      })
      .where('id = :id AND organization_id = :orgId', { id: sequenceId, orgId: organizationId })
      .execute();
  }

  async findByAppointmentId(organizationId: string, appointmentId: string): Promise<AutomationSequenceEntity | null> {
    const appt = await this.appointmentRepo.findOne({
      where: { id: appointmentId, organization_id: organizationId },
      select: ['sequence_id'],
    });
    if (!appt?.sequence_id) return null;
    return this.repo.findOne({ where: { id: appt.sequence_id, organization_id: organizationId } });
  }

  async findAll(
    organizationId: string,
    filters?: { status?: string; contact_id?: string; sequence_type?: string; limit?: number; offset?: number },
  ): Promise<{ items: AutomationSequenceEntity[]; total: number }> {
    const qb = this.repo
      .createQueryBuilder('seq')
      .where('seq.organization_id = :orgId', { orgId: organizationId })
      .orderBy('seq.created_at', 'DESC');

    if (filters?.status) qb.andWhere('seq.status = :status', { status: filters.status });
    if (filters?.contact_id) qb.andWhere('seq.contact_id = :contactId', { contactId: filters.contact_id });
    if (filters?.sequence_type) qb.andWhere('seq.sequence_type = :type', { type: filters.sequence_type });

    const total = await qb.getCount();
    const items = await qb
      .take(filters?.limit ?? 50)
      .skip(filters?.offset ?? 0)
      .getMany();

    return { items, total };
  }

  async findById(
    organizationId: string,
    id: string,
  ): Promise<AutomationSequenceEntity | null> {
    return this.repo.findOne({
      where: { id, organization_id: organizationId },
    });
  }

  async findActive(
    organizationId: string,
    contactId: string,
  ): Promise<AutomationSequenceEntity | null> {
    return this.repo.findOne({
      where: {
        organization_id: organizationId,
        contact_id: contactId,
        status: 'active' as SequenceStatus,
      },
    });
  }

  private async createSequenceAppointment(
    organizationId: string,
    sequence: AutomationSequenceEntity,
    dueAt: Date,
    dto?: CreateSequenceInput,
  ): Promise<AppointmentEntity> {
    // The plan for this attempt — action and channel strategy both come from
    // the cloned step instead of being hardcoded.
    const step = await this.getStep(sequence.id, sequence.current_attempt);

    // Find or create follow-up calendar
    let calendar = await this.calendarRepo.findOne({
      where: { organization_id: organizationId, type: 'follow_up' },
    });
    if (!calendar) {
      calendar = await this.calendarRepo.save(
        this.calendarRepo.create({
          organization_id: organizationId,
          name: 'Follow-up',
          type: 'follow_up',
          color: '#16a34a',
          is_active: true,
          work_days: [1, 2, 3, 4, 5],
          start_time: '09:00',
          end_time: '18:00',
          slot_duration_minutes: 30,
          buffer_minutes: 0,
          timezone: 'UTC',
          blocked_dates: [],
        }),
      );
    }

    const startsAt = dueAt;
    const endsAt = new Date(startsAt.getTime() + 15 * 60_000);

    // Only the first attempt can carry a hand-written body — later ones are
    // scheduled without a dto and fall back to the generated message.
    // `metadata.message_content` is the legacy shape callers used before the
    // column was wired through.
    const messageContent =
      dto?.message_content ?? (dto?.metadata?.message_content as string | undefined);

    const appt = this.appointmentRepo.create({
      organization_id: organizationId,
      calendar_id: calendar.id,
      contact_id: sequence.contact_id,
      title: `Sequence: ${sequence.sequence_type} #${sequence.current_attempt}`,
      status: 'pending',
      starts_at: startsAt,
      ends_at: endsAt,
      timezone: 'UTC',
      origin: 'automation',
      action: step.action,
      executor: 'system',
      channel_strategy: step.channel_strategy,
      ...(messageContent ? { message_content: messageContent } : {}),
      source: sequence.source,
      sequence_id: sequence.id,
      conversation_id: sequence.conversation_id ?? undefined,
      metadata: {
        sequence_type: sequence.sequence_type,
        attempt: sequence.current_attempt,
        // Cloned from the template's step count, so n8n can tell a middle
        // touch from the last one instead of assuming the default of 7.
        total_follow_ups: sequence.max_attempts,
        ...(dto?.metadata ?? {}),
      },
    });

    return this.appointmentRepo.save(appt);
  }
}
