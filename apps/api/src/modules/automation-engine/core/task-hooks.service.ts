import { Injectable, Logger } from '@nestjs/common';
import type { ScheduledActionEntity } from '../scheduled-action.entity';

type TaskClosedListener = (task: ScheduledActionEntity) => Promise<unknown>;

/**
 * Tells interested parties that an agenda task was done, skipped or deleted.
 * The automation runtime listens, to resume a run waiting for its task,
 * without the agenda depending on the automation engine.
 */
@Injectable()
export class TaskHooksService {
  private readonly logger = new Logger(TaskHooksService.name);
  private readonly listeners: TaskClosedListener[] = [];

  onTaskClosed(listener: TaskClosedListener): void {
    this.listeners.push(listener);
  }

  async taskClosed(task: ScheduledActionEntity): Promise<void> {
    for (const listener of this.listeners) {
      try {
        await listener(task);
      } catch (err) {
        this.logger.warn(`Task ${task.id} close listener failed: ${(err as Error).message}`);
      }
    }
  }
}
