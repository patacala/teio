import { Injectable, Logger, Inject, Optional, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Queue } from 'bullmq';
import { ScheduledActionService } from './scheduled-action.service';
import { ActionExecutionService } from './action-execution.service';
import { ACTION_EXECUTION_QUEUE } from './automation-engine.constants';

@Injectable()
export class ActionSchedulerCron implements OnModuleInit {
  private readonly logger = new Logger(ActionSchedulerCron.name);
  private isRunning = false;
  private useQueue = false;

  constructor(
    private readonly actions: ScheduledActionService,
    private readonly actionExecutionService: ActionExecutionService,
    @Optional() @Inject(ACTION_EXECUTION_QUEUE) private readonly queue?: Queue,
  ) {}

  async onModuleInit() {
    if (!this.queue) {
      this.logger.warn(
        '⚠ ACTION_EXECUTION_QUEUE not injected — running in DIRECT mode. ' +
        'Follow-ups will process synchronously in the cron tick. ' +
        'Configure Redis to enable async queue processing.',
      );
      return;
    }

    // Verify Redis connectivity
    try {
      const client = await this.queue.client;
      await client.ping();
      this.useQueue = true;
      this.logger.log('✓ Action scheduler connected to Redis — running in QUEUE mode (async)');
    } catch (err) {
      this.useQueue = false;
      this.logger.warn(
        `⚠ Redis not reachable (${err instanceof Error ? err.message : err}). ` +
        'Falling back to DIRECT mode. Follow-ups will process synchronously. ' +
        'Fix Redis connection to enable async processing.',
      );
    }
  }

  @Cron('*/1 * * * *')
  async tick(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;

    try {
      const due = await this.actions.findDue(50);
      if (due.length === 0) return;

      let processed = 0;
      for (const appt of due) {
        const locked = await this.actions.markProcessing(appt.organization_id, appt.id);
        if (!locked) continue;

        if (this.useQueue && this.queue) {
          // Phase 2: async via BullMQ
          await this.queue.add('execute', { appointmentId: appt.id }, {
            attempts: 1,
            removeOnComplete: true,
            removeOnFail: 100,
          });
        } else {
          // Phase 1: direct execution (fallback)
          await this.actionExecutionService.execute(appt.id);
        }
        processed++;
      }

      if (processed > 0) {
        const mode = this.useQueue ? 'queued' : 'executed';
        this.logger.log(`${mode} ${processed} follow-up action(s)`);
      }
    } catch (err) {
      this.logger.error(`Scheduler tick error: ${err instanceof Error ? err.message : err}`);
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Agenda call steps whose call never reported back (voicemail, a dropped
   * call): markFailed bumps `attempts` and puts the step back to `pending`
   * while under `max_attempts`, then marks it `failed`.
   */
  @Cron('*/15 * * * *')
  async reapStuck(): Promise<void> {
    const timeoutHours = Number(process.env.FOLLOW_UP_PROCESSING_TIMEOUT_HOURS ?? 6);

    try {
      const stuck = await this.actions.findStuckProcessing(timeoutHours);
      if (stuck.length === 0) return;

      for (const appt of stuck) {
        await this.actions.markFailed(appt.organization_id, appt.id, `No completion received within ${timeoutHours}h of dispatch`);
      }

      this.logger.warn(
        `Reaped ${stuck.length} follow-up action(s) stuck in processing for over ${timeoutHours}h`,
      );
    } catch (err) {
      this.logger.error(`Reaper error: ${err instanceof Error ? err.message : err}`);
    }
  }
}
