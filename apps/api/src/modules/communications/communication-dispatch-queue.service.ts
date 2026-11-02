import { Injectable, Inject, Optional, Logger } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { COMM_DISPATCH_QUEUE } from './communication-dispatch.constants';
import type { DispatchRequest } from '@crm/shared';

@Injectable()
export class CommunicationDispatchQueueService {
  private readonly logger = new Logger(CommunicationDispatchQueueService.name);

  constructor(
    @Optional() @Inject(COMM_DISPATCH_QUEUE) private readonly queue?: Queue,
  ) {}

  async enqueue(request: DispatchRequest): Promise<void> {
    if (!this.queue) {
      this.logger.warn('Communication dispatch queue not available, skipping enqueue');
      return;
    }

    await this.queue.add('dispatch', request, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 10000 },
    });
  }
}
