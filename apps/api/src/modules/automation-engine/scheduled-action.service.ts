import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { CalendarSystemKey } from '@crm/shared';
import { ScheduledActionEntity, ScheduledActionStatus } from './scheduled-action.entity';
import { WorkScheduleEntity } from '../scheduling/work-schedule.entity';
import { ContactEntity } from '../client-management/contact.entity';
import { AutomationSequenceService } from './automation-sequence.service';
import { ensureSystemCalendar, findOrganizationTimezone } from '../scheduling/system-calendars';

const ACTION_TITLES: Record<string, string> = {
  send_message: 'Follow-up: Send Message',
  send_email: 'Follow-up: Send Email',
  notify_agent: 'Follow-up: Notify Agent',
  create_task: 'Follow-up: Task',
  call: 'Follow-up: Call',
};

/** Statuses in which a step has not run to an end yet. */
export const OPEN_ACTION_STATUSES: ScheduledActionStatus[] = ['pending', 'processing', 'awaiting_user'];

export interface CreateScheduledActionInput {
  contact_id: string;
  action: string;
  due_at: string | Date;
  calendar_id?: string;
  conversation_id?: string | null;
  executor?: string;
  channel_strategy?: string;
  message_content?: string | null;
  title?: string;
  description?: string | null;
  source?: string;
  metadata?: Record<string, unknown>;
  sequence_id?: string | null;
}

export interface ScheduledActionFilters {
  status?: string;
  action?: string;
  contact_id?: string;
  calendar_id?: string;
  from?: string;
  to?: string;
  sort?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

export interface ScheduledActionMetrics {
  today_count: number;
  week_count: number;
  pending_count: number;
  completed_count: number;
  awaiting_user_count: number;
}

/**
 * Follow-up steps. Every state change is a conditional UPDATE on the current
 * status, so the scheduler, the reaper, n8n callbacks and people acting in the
 * agenda can never undo each other.
 */
@Injectable()
export class ScheduledActionService {
  private readonly logger = new Logger(ScheduledActionService.name);

  constructor(
    @InjectRepository(ScheduledActionEntity)
    private readonly repo: Repository<ScheduledActionEntity>,
    @InjectRepository(WorkScheduleEntity)
    private readonly calendarRepo: Repository<WorkScheduleEntity>,
    @InjectRepository(ContactEntity)
    private readonly contactRepo: Repository<ContactEntity>,
    private readonly sequences: AutomationSequenceService,
  ) {}

  // ── Creation ────────────────────────────────────────────────────────────

  async create(
    organizationId: string,
    input: CreateScheduledActionInput,
    options: { createdBy?: string | null; origin?: 'automation' | 'human' } = {},
  ): Promise<ScheduledActionEntity> {
    const contact = await this.contactRepo.exists({ where: { id: input.contact_id, organization_id: organizationId } });
    if (!contact) throw new NotFoundException(`Contact ${input.contact_id} not found`);

    const calendar = input.calendar_id
      ? await this.calendarRepo.findOne({ where: { id: input.calendar_id, organization_id: organizationId } })
      : await ensureSystemCalendar(this.calendarRepo, organizationId, CalendarSystemKey.FOLLOW_UP);
    if (!calendar) throw new NotFoundException(`Calendar ${input.calendar_id} not found`);
    if (calendar.type !== 'follow_up') {
      throw new BadRequestException('Follow-up steps can only be scheduled on a follow-up calendar');
    }

    const dueAt = new Date(input.due_at);
    if (Number.isNaN(dueAt.getTime())) throw new BadRequestException('due_at must be a valid date');

    const saved = await this.repo.save(
      this.repo.create({
        organization_id: organizationId,
        calendar_id: calendar.id,
        contact_id: input.contact_id,
        conversation_id: input.conversation_id ?? null,
        sequence_id: input.sequence_id ?? null,
        title: input.title?.trim() || ACTION_TITLES[input.action] || 'Follow-up',
        description: input.description ?? null,
        action: input.action,
        executor: input.executor ?? 'system',
        channel_strategy: input.channel_strategy ?? 'auto',
        message_content: input.message_content ?? null,
        status: 'pending',
        due_at: dueAt,
        timezone: await findOrganizationTimezone(this.calendarRepo, organizationId),
        source: input.source ?? 'manual',
        origin: options.origin ?? 'automation',
        created_by: options.createdBy ?? null,
        metadata: input.metadata ?? {},
      }),
    );
    this.logger.log(`Scheduled ${saved.action} ${saved.id} for contact ${saved.contact_id} at ${saved.due_at.toISOString()}`);
    return saved;
  }

  // ── Scheduler / reaper ──────────────────────────────────────────────────

  async findDue(limit = 50): Promise<ScheduledActionEntity[]> {
    return this.repo
      .createQueryBuilder('s')
      .where(`s.status = 'pending'`)
      .andWhere('s.due_at <= NOW()')
      .orderBy('s.due_at', 'ASC')
      .take(limit)
      .getMany();
  }

  /** Steps dispatched to n8n that never reported back. */
  async findStuckProcessing(olderThanHours: number, limit = 50): Promise<ScheduledActionEntity[]> {
    return this.repo
      .createQueryBuilder('s')
      .where(`s.status = 'processing'`)
      .andWhere(`s.updated_at < NOW() - (:hours * INTERVAL '1 hour')`, { hours: olderThanHours })
      .orderBy('s.updated_at', 'ASC')
      .take(limit)
      .getMany();
  }

  /** For the executor: the step regardless of organization (ids come from our own queue). */
  async findForExecution(id: string): Promise<ScheduledActionEntity | null> {
    return this.repo.findOne({ where: { id } });
  }

  async markProcessing(organizationId: string, id: string): Promise<boolean> {
    return this.transition(organizationId, id, ['pending'], { status: 'processing' });
  }

  /** A person has to do this step; it waits in the agenda instead of running. */
  async markAwaitingUser(organizationId: string, id: string): Promise<boolean> {
    return this.transition(organizationId, id, ['processing'], { status: 'awaiting_user' });
  }

  async markCompleted(
    organizationId: string,
    id: string,
    resolvedChannel?: string,
    completedBy?: string | null,
  ): Promise<boolean> {
    return this.transition(organizationId, id, OPEN_ACTION_STATUSES, {
      status: 'completed',
      completed_at: new Date(),
      ...(resolvedChannel ? { resolved_channel: resolvedChannel } : {}),
      ...(completedBy ? { completed_by: completedBy } : {}),
    });
  }

  /**
   * Counts a failed attempt — only while the step is still `processing`, so a
   * completion that arrived first (or a cancellation) is never undone.
   */
  async markFailed(organizationId: string, id: string, error: string): Promise<'retrying' | 'failed' | 'missing'> {
    const result: unknown = await this.repo.manager.query(
      `UPDATE scheduling.scheduled_actions
          SET attempts = attempts + 1,
              status = CASE WHEN attempts + 1 < max_attempts THEN 'pending' ELSE 'failed' END,
              last_error = $3
        WHERE id = $1 AND organization_id = $2 AND status = 'processing'
        RETURNING status, attempts, max_attempts`,
      [id, organizationId, error],
    );
    const rows = (Array.isArray(result) && Array.isArray(result[0]) ? result[0] : result) as Array<{
      status: string;
      attempts: number;
      max_attempts: number;
    }>;
    const row = rows?.[0];
    if (!row) return 'missing';
    this.logger.warn(`Step ${id} attempt ${row.attempts}/${row.max_attempts}: ${error} → ${row.status}`);
    return row.status === 'failed' ? 'failed' : 'retrying';
  }

  // ── People and n8n acting on a step ─────────────────────────────────────

  /** Done (by n8n, a call, or a person); the sequence moves on to its next step. */
  async complete(
    organizationId: string,
    id: string,
    options: { resolvedChannel?: string; completedBy?: string | null } = {},
  ): Promise<ScheduledActionEntity> {
    const step = await this.findById(id, organizationId);
    const changed = await this.markCompleted(organizationId, id, options.resolvedChannel, options.completedBy);
    if (!changed && step.status !== 'completed') {
      throw new ConflictException(`A ${step.status} follow-up step cannot be completed`);
    }
    if (changed && step.sequence_id) await this.advance(organizationId, step.sequence_id);
    return this.findById(id, organizationId);
  }

  /** Skips a step; the sequence moves on instead of stalling. */
  async skip(organizationId: string, id: string): Promise<ScheduledActionEntity> {
    const step = await this.findById(id, organizationId);
    const changed = await this.transition(organizationId, id, OPEN_ACTION_STATUSES, { status: 'cancelled' });
    if (!changed) throw new ConflictException(`A ${step.status} follow-up step cannot be cancelled`);
    if (step.sequence_id) await this.advance(organizationId, step.sequence_id);
    return this.findById(id, organizationId);
  }

  async reschedule(organizationId: string, id: string, dueAt: Date): Promise<ScheduledActionEntity> {
    const changed = await this.transition(organizationId, id, ['pending', 'awaiting_user'], {
      due_at: dueAt,
      status: 'pending',
    });
    if (!changed) {
      const step = await this.findById(id, organizationId);
      throw new ConflictException(`A ${step.status} follow-up step cannot be moved`);
    }
    return this.findById(id, organizationId);
  }

  async updateDetails(
    organizationId: string,
    id: string,
    dto: { title?: string; description?: string; message_content?: string },
  ): Promise<ScheduledActionEntity> {
    const step = await this.findById(id, organizationId);
    if (dto.title !== undefined) step.title = dto.title;
    if (dto.description !== undefined) step.description = dto.description;
    if (dto.message_content !== undefined) step.message_content = dto.message_content;
    return this.repo.save(step);
  }

  async remove(organizationId: string, id: string): Promise<void> {
    const step = await this.findById(id, organizationId);
    await this.repo.delete({ id, organization_id: organizationId });
    if (step.sequence_id && OPEN_ACTION_STATUSES.includes(step.status)) {
      await this.advance(organizationId, step.sequence_id);
    }
  }

  // ── Reads ───────────────────────────────────────────────────────────────

  async findById(id: string, organizationId: string): Promise<ScheduledActionEntity> {
    const step = await this.repo.findOne({ where: { id, organization_id: organizationId }, relations: ['contact'] });
    if (!step) throw new NotFoundException(`Follow-up ${id} not found`);
    return step;
  }

  async findProcessingBySequence(organizationId: string, sequenceId: string): Promise<ScheduledActionEntity | null> {
    return this.repo.findOne({
      where: { organization_id: organizationId, sequence_id: sequenceId, status: 'processing' },
    });
  }

  /**
   * The dispatched step of this kind waiting on this contact, whether or not
   * its sequence is still active, so a call still closes its step when the
   * sequence has since been paused or when the step was created outside one.
   */
  async findProcessingByContactAndAction(
    organizationId: string,
    contactId: string,
    action: string,
  ): Promise<ScheduledActionEntity | null> {
    return this.repo.findOne({
      where: { organization_id: organizationId, contact_id: contactId, action, status: 'processing' },
      order: { due_at: 'DESC' },
    });
  }

  async findByContact(
    organizationId: string,
    contactId: string,
    filters: { status?: string; action?: string } = {},
  ): Promise<ScheduledActionEntity[]> {
    return this.repo.find({
      where: {
        organization_id: organizationId,
        contact_id: contactId,
        ...(filters.status ? { status: filters.status as ScheduledActionStatus } : {}),
        ...(filters.action ? { action: filters.action } : {}),
      },
      order: { due_at: 'DESC' },
    });
  }

  async findAll(
    organizationId: string,
    filters: ScheduledActionFilters = {},
  ): Promise<{ items: ScheduledActionEntity[]; total: number }> {
    const direction = filters.sort === 'asc' ? 'ASC' : 'DESC';
    const qb = this.repo
      .createQueryBuilder('s')
      .leftJoinAndSelect('s.contact', 'contact')
      .where('s.organization_id = :orgId', { orgId: organizationId })
      .orderBy('s.due_at', direction)
      .addOrderBy('s.id', direction);

    if (filters.status) qb.andWhere('s.status = :status', { status: filters.status });
    if (filters.action) qb.andWhere('s.action = :action', { action: filters.action });
    if (filters.contact_id) qb.andWhere('s.contact_id = :contactId', { contactId: filters.contact_id });
    if (filters.calendar_id) qb.andWhere('s.calendar_id = :calendarId', { calendarId: filters.calendar_id });
    if (filters.from) qb.andWhere('s.due_at >= :from', { from: new Date(filters.from) });
    if (filters.to) qb.andWhere('s.due_at <= :to', { to: new Date(filters.to) });

    const limit = Math.min(Math.max(Number(filters.limit) || 50, 1), 200);
    const [items, total] = await qb
      .skip(Math.max(Number(filters.offset) || 0, 0))
      .take(limit)
      .getManyAndCount();
    return { items, total };
  }

  async findByIds(organizationId: string, ids: string[]): Promise<ScheduledActionEntity[]> {
    if (!ids.length) return [];
    return this.repo.find({ where: { organization_id: organizationId, id: In(ids) } });
  }

  /** Agenda counters for the follow-up calendar, in the organization's time zone. */
  async getMetrics(organizationId: string, calendarId?: string): Promise<ScheduledActionMetrics> {
    const timezone = await findOrganizationTimezone(this.calendarRepo, organizationId);
    const local = `(s.due_at AT TIME ZONE :tz)`;
    const week = `date_trunc('week', NOW() AT TIME ZONE :tz)`;
    const qb = this.repo
      .createQueryBuilder('s')
      .select([
        `COUNT(*) FILTER (WHERE s.status <> 'cancelled' AND ${local}::date = (NOW() AT TIME ZONE :tz)::date)::int AS today_count`,
        `COUNT(*) FILTER (WHERE s.status <> 'cancelled' AND ${local} >= ${week} AND ${local} < ${week} + INTERVAL '7 days')::int AS week_count`,
        `COUNT(*) FILTER (WHERE s.status IN ('pending', 'processing'))::int AS pending_count`,
        `COUNT(*) FILTER (WHERE s.status = 'completed')::int AS completed_count`,
        `COUNT(*) FILTER (WHERE s.status = 'awaiting_user')::int AS awaiting_user_count`,
      ])
      .where('s.organization_id = :orgId', { orgId: organizationId })
      .setParameter('tz', timezone);
    if (calendarId) qb.andWhere('s.calendar_id = :calendarId', { calendarId });
    const row = await qb.getRawOne<Record<string, number>>();
    return {
      today_count: Number(row?.today_count ?? 0),
      week_count: Number(row?.week_count ?? 0),
      pending_count: Number(row?.pending_count ?? 0),
      completed_count: Number(row?.completed_count ?? 0),
      awaiting_user_count: Number(row?.awaiting_user_count ?? 0),
    };
  }

  // ── Internals ───────────────────────────────────────────────────────────

  private async transition(
    organizationId: string,
    id: string,
    from: ScheduledActionStatus[],
    set: Partial<Pick<ScheduledActionEntity, 'status' | 'completed_at' | 'resolved_channel' | 'completed_by' | 'due_at'>>,
  ): Promise<boolean> {
    const result = await this.repo
      .createQueryBuilder()
      .update(ScheduledActionEntity)
      .set(set)
      .where('id = :id AND organization_id = :orgId', { id, orgId: organizationId })
      .andWhere('status IN (:...from)', { from })
      .execute();
    return (result.affected ?? 0) > 0;
  }

  private async advance(organizationId: string, sequenceId: string): Promise<void> {
    try {
      await this.sequences.advanceOrComplete(organizationId, sequenceId);
    } catch (err) {
      this.logger.warn(`Could not advance sequence ${sequenceId}: ${(err as Error).message}`);
    }
  }
}
