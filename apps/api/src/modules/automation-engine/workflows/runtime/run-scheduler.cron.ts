import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { RunStoreService } from './run-store.service';
import { AutomationRuntimeService } from './automation-runtime.service';
import { ScheduleTriggerService } from '../triggers/schedule-trigger.service';

/**
 * The automations' clock: runs whose wait is over, scheduled automations that
 * are due, and runs whose worker died. Safe on several instances: every run
 * and schedule tick is claimed with a conditional update.
 */
@Injectable()
export class RunSchedulerCron {
  private readonly logger = new Logger(RunSchedulerCron.name);
  private ticking = false;

  constructor(
    private readonly store: RunStoreService,
    private readonly runtime: AutomationRuntimeService,
    private readonly schedules: ScheduleTriggerService,
  ) {}

  @Cron('*/1 * * * *')
  async tick(): Promise<void> {
    if (this.ticking) return;
    this.ticking = true;
    try {
      const fired = await this.schedules.fireDue();
      if (fired) this.logger.log(`Started ${fired} scheduled automation run(s)`);
      const due = await this.store.findDue(500);
      for (const run of due) await this.runtime.dispatch(run);
    } catch (err) {
      this.logger.error(`Automation scheduler failed: ${(err as Error).message}`);
    } finally {
      this.ticking = false;
    }
  }

  @Cron('*/5 * * * *')
  async reap(): Promise<void> {
    try {
      const reaped = await this.store.reapStuck();
      if (reaped) this.logger.warn(`Took back ${reaped} automation run(s) whose worker stopped`);
    } catch (err) {
      this.logger.error(`Automation reaper failed: ${(err as Error).message}`);
    }
  }
}
