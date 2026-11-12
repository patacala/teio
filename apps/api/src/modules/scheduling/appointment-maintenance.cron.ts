import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { SchedulingService } from './scheduling.service';

/** Safe on several instances: every job claims its rows with a single UPDATE. */
@Injectable()
export class AppointmentMaintenanceCron {
  private readonly logger = new Logger(AppointmentMaintenanceCron.name);

  constructor(private readonly scheduling: SchedulingService) {}

  @Cron('*/1 * * * *')
  async releaseExpiredHolds(): Promise<void> {
    try {
      const released = await this.scheduling.releaseAllExpiredHolds();
      if (released) this.logger.log(`Released ${released} unpaid hold(s)`);
    } catch (err) {
      this.logger.error(`Hold release failed: ${(err as Error).message}`);
    }
  }

  @Cron('*/1 * * * *')
  async sendReminders(): Promise<void> {
    try {
      const sent = await this.scheduling.sendDueReminders();
      if (sent) this.logger.log(`Queued ${sent} appointment reminder(s)`);
    } catch (err) {
      this.logger.error(`Appointment reminders failed: ${(err as Error).message}`);
    }
  }
}
