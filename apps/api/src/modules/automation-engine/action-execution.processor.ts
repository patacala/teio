import { Injectable, Logger, OnModuleInit, OnModuleDestroy, Optional, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Worker, Job, Queue } from 'bullmq';
import { ActionExecutionService } from './action-execution.service';
import { ACTION_EXECUTION_QUEUE, ACTION_EXECUTION_QUEUE_NAME } from './automation-engine.constants';

export interface ActionExecutionJobData {
  appointmentId: string;
}

@Injectable()
export class ActionExecutionProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ActionExecutionProcessor.name);
  private worker: Worker | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly actionExecutionService: ActionExecutionService,
    @Optional() @Inject(ACTION_EXECUTION_QUEUE) private readonly queue?: Queue,
  ) {}

  async onModuleInit() {
    if (!this.queue) {
      this.logger.debug('No queue available — BullMQ worker not started (direct mode active)');
      return;
    }

    // Only start worker if Redis is reachable
    try {
      const client = await this.queue.client;
      await client.ping();
    } catch {
      this.logger.debug('Redis not reachable — BullMQ worker not started (direct mode active)');
      return;
    }

    const connection = this.getRedisConnection();
    this.worker = new Worker(
      ACTION_EXECUTION_QUEUE_NAME,
      async (job: Job<ActionExecutionJobData>) => {
        await this.actionExecutionService.execute(job.data.appointmentId);
      },
      { connection, concurrency: 5 },
    );

    this.worker.on('failed', (job, err) => {
      this.logger.error(`Job ${job?.id} failed: ${err.message}`, err.stack);
    });

    this.logger.log('✓ BullMQ worker started for action_execution queue (concurrency: 5)');
  }

  async onModuleDestroy() {
    await this.worker?.close();
  }

  private getRedisConnection() {
    const host = this.configService.get<string>('redis.host', 'localhost');
    const port = this.configService.get<number>('redis.port', 6379);
    const password = this.configService.get<string>('redis.password', '');
    return { host, port, password: password || undefined };
  }
}
