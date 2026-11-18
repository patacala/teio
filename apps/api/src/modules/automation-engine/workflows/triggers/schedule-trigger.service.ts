import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AutomationScheduleEntity } from '../entities/automation-schedule.entity';
import type { AutomationRunEntity } from '../entities/automation-run.entity';
import { AutomationRuntimeService } from '../runtime/automation-runtime.service';
import { RunStoreService } from '../runtime/run-store.service';
import { nextOccurrence } from '../time/automation-time';

/**
 * Fires scheduled automations: one organization run per due time.
 *
 * Due schedules are locked (FOR UPDATE SKIP LOCKED), moved to their next time
 * and given their run in one transaction, so several instances never fire the
 * same tick twice and a crash never skips a tick without its run. A run is
 * also unique per (automation, tick).
 */
@Injectable()
export class ScheduleTriggerService {
  private readonly logger = new Logger(ScheduleTriggerService.name);

  constructor(
    @InjectRepository(AutomationScheduleEntity)
    private readonly schedules: Repository<AutomationScheduleEntity>,
    private readonly store: RunStoreService,
    private readonly runtime: AutomationRuntimeService,
  ) {}

  async fireDue(now = new Date(), limit = 100): Promise<number> {
    const started = await this.schedules.manager.transaction(async (manager) => {
      const due = await manager
        .getRepository(AutomationScheduleEntity)
        .createQueryBuilder('s')
        .setLock('pessimistic_write')
        .setOnLocked('skip_locked')
        .where('s.is_active AND s.next_run_at <= :now', { now })
        .orderBy('s.next_run_at', 'ASC')
        .limit(limit)
        .getMany();

      const runs: AutomationRunEntity[] = [];
      for (const schedule of due) {
        const fireAt = schedule.next_run_at!;
        // After downtime a missed tick runs once; the next one is in the future.
        const next = nextOccurrence(schedule.spec, schedule.timezone, fireAt > now ? fireAt : now);
        await manager
          .getRepository(AutomationScheduleEntity)
          .update({ id: schedule.id }, { next_run_at: next, last_run_at: fireAt, is_active: !!next });
        const run = await this.store.create(
          {
            organizationId: schedule.organization_id,
            automationId: schedule.automation_id,
            versionId: schedule.version_id,
            scope: 'organization',
            contactId: null,
            conversationId: null,
            triggerKey: 'schedule',
            triggerEventId: `${schedule.id}:${fireAt.toISOString()}`,
            context: { trigger: { key: 'schedule', data: { fired_at: fireAt.toISOString() }, raw: {} } },
          },
          manager,
        );
        if (run) runs.push(run);
        else this.logger.warn(`Schedule ${schedule.id} tick ${fireAt.toISOString()} already had a run`);
      }
      return runs;
    });
    for (const run of started) await this.runtime.dispatch(run);
    return started.length;
  }
}
