import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppointmentEntity } from '../scheduling/appointment.entity';
import { WorkScheduleEntity } from '../scheduling/work-schedule.entity';
import type { CreateAutomatedAppointmentInput } from '@crm/shared';

const ACTION_TITLES: Record<string, string> = {
  send_message: 'Follow-up: Send Message',
  send_email: 'Follow-up: Send Email',
  notify_agent: 'Follow-up: Notify Agent',
  create_task: 'Follow-up: Create Task',
  call: 'Follow-up: Call',
};

@Injectable()
export class AutomatedAppointmentService {
  private readonly logger = new Logger(AutomatedAppointmentService.name);

  constructor(
    @InjectRepository(AppointmentEntity)
    private readonly repo: Repository<AppointmentEntity>,
    @InjectRepository(WorkScheduleEntity)
    private readonly calendarRepo: Repository<WorkScheduleEntity>,
  ) {}

  async create(
    organizationId: string,
    dto: CreateAutomatedAppointmentInput,
  ): Promise<AppointmentEntity> {
    let calendarId = dto.calendar_id;

    if (!calendarId) {
      const followUp = await this.calendarRepo.findOne({
        where: { organization_id: organizationId, type: 'follow_up' },
      });
      if (followUp) {
        calendarId = followUp.id;
      } else {
        // Auto-create a Follow-up calendar for this org
        const cal = this.calendarRepo.create({
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
        });
        const saved = await this.calendarRepo.save(cal);
        calendarId = saved.id;
      }
    }

    const startsAt = new Date(dto.due_at);
    const endsAt = new Date(startsAt.getTime() + 15 * 60_000); // 15min default

    const appt = this.repo.create({
      organization_id: organizationId,
      calendar_id: calendarId,
      contact_id: dto.contact_id,
      title: dto.title ?? ACTION_TITLES[dto.action] ?? 'Follow-up',
      status: 'pending',
      starts_at: startsAt,
      ends_at: endsAt,
      timezone: 'UTC',
      origin: 'automation',
      action: dto.action,
      executor: dto.executor ?? 'system',
      channel_strategy: dto.channel_strategy ?? 'auto',
      message_content: dto.message_content ?? undefined,
      source: dto.source ?? 'manual',
      metadata: dto.metadata ?? {},
    });

    const saved = await this.repo.save(appt) as AppointmentEntity;
    this.logger.log(`Created automated appointment ${saved.id} action=${dto.action} for contact=${dto.contact_id}`);
    return saved;
  }

  async findDue(limit = 50): Promise<AppointmentEntity[]> {
    return this.repo
      .createQueryBuilder('appt')
      .where('appt.action IS NOT NULL')
      .andWhere('appt.status IN (:...statuses)', { statuses: ['pending', 'scheduled'] })
      .andWhere('appt.starts_at <= NOW()')
      .orderBy('appt.starts_at', 'ASC')
      .take(limit)
      .getMany();
  }

  /**
   * Appointments stuck in `processing` past a deadline.
   *
   * A handler that dispatches to n8n returns `{ completed: false }` and leaves
   * the appointment here until the `complete_follow_up` tool comes back. If n8n
   * never answers — a failed workflow, a call that went to voicemail — the
   * sequence stalls forever with no signal. These are what the reaper retries.
   */
  async findStuckProcessing(olderThanHours: number, limit = 50): Promise<AppointmentEntity[]> {
    return this.repo
      .createQueryBuilder('appt')
      .where('appt.status = :status', { status: 'processing' })
      .andWhere('appt.action IS NOT NULL')
      .andWhere(`appt.updated_at < NOW() - (:hours * INTERVAL '1 hour')`, { hours: olderThanHours })
      .orderBy('appt.updated_at', 'ASC')
      .take(limit)
      .getMany();
  }

  async markProcessing(organizationId: string, id: string): Promise<boolean> {
    const result = await this.repo
      .createQueryBuilder()
      .update(AppointmentEntity)
      .set({ status: 'processing' })
      .where('id = :id AND organization_id = :orgId', { id, orgId: organizationId })
      .andWhere('status IN (:...statuses)', { statuses: ['pending', 'scheduled'] })
      .execute();
    return (result.affected ?? 0) > 0;
  }

  async markCompleted(organizationId: string, id: string, resolvedChannel?: string): Promise<void> {
    await this.repo
      .createQueryBuilder()
      .update(AppointmentEntity)
      .set({
        status: 'completed',
        completed_at: new Date(),
        resolved_channel: resolvedChannel ?? undefined,
        reminder_sent: true,
      })
      .where('id = :id AND organization_id = :orgId', { id, orgId: organizationId })
      .execute();
  }

  async markFailed(organizationId: string, id: string, error: string): Promise<'retrying' | 'failed' | 'missing'> {
    const appt = await this.repo.findOne({
      where: { id, organization_id: organizationId },
    });
    if (!appt) return 'missing';

    const newAttempts = appt.attempts + 1;
    const newStatus = newAttempts < appt.max_attempts ? 'pending' : 'failed';

    await this.repo
      .createQueryBuilder()
      .update(AppointmentEntity)
      .set({
        attempts: newAttempts,
        status: newStatus,
        last_error: error,
      })
      .where('id = :id AND organization_id = :orgId', { id, orgId: organizationId })
      .execute();

    this.logger.warn(`Appointment ${id} attempt ${newAttempts}/${appt.max_attempts}: ${error} → ${newStatus}`);
    return newStatus === 'failed' ? 'failed' : 'retrying';
  }

  async completeFollowUp(organizationId: string, appointmentId: string, sequenceService: {
    findByAppointmentId(orgId: string, id: string): Promise<{ id: string; status: string } | null>;
    advanceOrComplete(orgId: string, seqId: string): Promise<void>;
  }): Promise<void> {
    await this.markCompleted(organizationId, appointmentId);

    const seq = await sequenceService.findByAppointmentId(organizationId, appointmentId);
    if (seq && seq.status === 'active') {
      await sequenceService.advanceOrComplete(organizationId, seq.id);
    }
  }

  async findProcessingBySequence(organizationId: string, sequenceId: string): Promise<AppointmentEntity | null> {
    return this.repo.findOne({
      where: { organization_id: organizationId, sequence_id: sequenceId, status: 'processing' },
    });
  }

  /**
   * The dispatched call step waiting on this contact, whether or not its
   * sequence is still active. Looking it up by contact rather than by sequence
   * means a call still closes its step when the sequence has since been paused
   * or when the step was created outside one.
   */
  async findProcessingByContactAndAction(
    organizationId: string,
    contactId: string,
    action: string,
  ): Promise<AppointmentEntity | null> {
    return this.repo.findOne({
      where: {
        organization_id: organizationId,
        contact_id: contactId,
        action,
        status: 'processing',
      },
      order: { starts_at: 'DESC' },
    });
  }

  async cancel(id: string, organizationId: string): Promise<void> {
    await this.repo
      .createQueryBuilder()
      .update(AppointmentEntity)
      .set({ status: 'cancelled' })
      .where('id = :id AND organization_id = :orgId', { id, orgId: organizationId })
      .execute();
  }

  async findByContact(
    organizationId: string,
    contactId: string,
    filters?: { status?: string; action?: string },
  ): Promise<AppointmentEntity[]> {
    const qb = this.repo
      .createQueryBuilder('appt')
      .where('appt.organization_id = :orgId', { orgId: organizationId })
      .andWhere('appt.contact_id = :contactId', { contactId })
      .andWhere('appt.action IS NOT NULL')
      .orderBy('appt.starts_at', 'DESC');

    if (filters?.status) {
      qb.andWhere('appt.status = :status', { status: filters.status });
    }
    if (filters?.action) {
      qb.andWhere('appt.action = :action', { action: filters.action });
    }

    return qb.getMany();
  }

  async findAllFollowUps(
    organizationId: string,
    filters?: { status?: string; action?: string; contact_id?: string; limit?: number; offset?: number },
  ): Promise<{ items: AppointmentEntity[]; total: number }> {
    const qb = this.repo
      .createQueryBuilder('appt')
      .leftJoinAndSelect('appt.contact', 'contact')
      .where('appt.organization_id = :orgId', { orgId: organizationId })
      .andWhere('appt.action IS NOT NULL')
      .orderBy('appt.starts_at', 'DESC');

    if (filters?.status) {
      qb.andWhere('appt.status = :status', { status: filters.status });
    }
    if (filters?.action) {
      qb.andWhere('appt.action = :action', { action: filters.action });
    }
    if (filters?.contact_id) {
      qb.andWhere('appt.contact_id = :contactId', { contactId: filters.contact_id });
    }

    const total = await qb.getCount();
    const items = await qb
      .take(filters?.limit ?? 50)
      .skip(filters?.offset ?? 0)
      .getMany();

    return { items, total };
  }

  async findById(id: string, organizationId: string): Promise<AppointmentEntity | null> {
    return this.repo.findOne({
      where: { id, organization_id: organizationId },
      relations: ['contact'],
    });
  }
}
