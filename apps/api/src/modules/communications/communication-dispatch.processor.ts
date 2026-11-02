import { Injectable, Logger, OnModuleDestroy, OnModuleInit, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Worker, Job } from 'bullmq';
import { CommunicationDispatchService } from './communication-dispatch.service';
import { COMM_DISPATCH_QUEUE, COMM_DISPATCH_QUEUE_NAME } from './communication-dispatch.constants';
import type { DispatchRequest } from '@crm/shared';

export interface CommDispatchJobData extends DispatchRequest {}

@Injectable()
export class CommunicationDispatchProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CommunicationDispatchProcessor.name);
  private worker: Worker;

  constructor(
    private readonly configService: ConfigService,
    private readonly dispatchService: CommunicationDispatchService,
    @Inject(COMM_DISPATCH_QUEUE) private readonly _queue: unknown,
  ) {}

  onModuleInit() {
    const host = this.configService.get<string>('redis.host', 'localhost');
    const port = this.configService.get<number>('redis.port', 6379);
    const password = this.configService.get<string>('redis.password', '');

    this.worker = new Worker(
      COMM_DISPATCH_QUEUE_NAME,
      async (job: Job<CommDispatchJobData>) => this.process(job),
      {
        connection: { host, port, password: password || undefined },
        concurrency: 5,
      },
    );

    this.worker.on('failed', (job, err) => {
      this.logger.error(`CommDispatch job ${job?.id} failed: ${err.message}`, err.stack);
    });
  }

  async onModuleDestroy() {
    await this.worker?.close();
  }

  private async process(job: Job<CommDispatchJobData>): Promise<void> {
    const result = await this.dispatchService.dispatch(job.data);

    if (!result.dispatched && result.error) {
      throw new Error(result.error);
    }

    this.logger.debug(`CommDispatch job ${job.id} completed — dispatched=${result.dispatched}`);
  }
}
