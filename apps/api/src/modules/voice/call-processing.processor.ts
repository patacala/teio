import { Injectable, Logger, OnModuleDestroy, OnModuleInit, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Worker, Job, Queue } from 'bullmq';
import { CallsService } from './calls.service';
import type { RetellWebhookDto } from './retell-webhook.dto';

export const CALL_PROCESSING_QUEUE = 'call_processing';
export const CALL_PROCESSING_QUEUE_TOKEN = 'CALL_PROCESSING_QUEUE';
export const TRANSCRIPT_PROCESSING_QUEUE_TOKEN = 'TRANSCRIPT_PROCESSING_QUEUE';

export interface CallProcessingJobData {
  dto: RetellWebhookDto;
}

export interface TranscriptJobData {
  call_id: string;
  org_id: string | null;
  transcript: string;
}

@Injectable()
export class CallProcessingProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CallProcessingProcessor.name);
  private worker!: Worker;

  constructor(
    private readonly callsService: CallsService,
    private readonly configService: ConfigService,
    @Inject(TRANSCRIPT_PROCESSING_QUEUE_TOKEN)
    private readonly transcriptQueue: Queue,
  ) {}

  onModuleInit() {
    const connection = this.getRedisConnection();
    this.worker = new Worker(
      CALL_PROCESSING_QUEUE,
      async (job: Job<CallProcessingJobData>) => this.process(job),
      { connection, concurrency: 5 },
    );

    this.worker.on('failed', (job, err) => {
      this.logger.error(`Job ${job?.id} failed: ${err.message}`, err.stack);
    });
  }

  async onModuleDestroy() {
    await this.worker?.close();
  }

  private async process(job: Job<CallProcessingJobData>): Promise<void> {
    const { dto } = job.data;
    this.logger.debug(`Processing call event: ${dto.event} for call ${dto.call_id}`);

    await this.callsService.handleWebhookEvent(dto);

    // Enqueue transcript processing for terminal events with a transcript
    if (
      (dto.event === 'call_ended' || dto.event === 'call_analyzed') &&
      dto.transcript
    ) {
      // Resolve the call to get its internal ID and orgId
      // We need to look it up — the upsertCall already cached it in Redis
      // Pass through what we have; TranscriptProcessor will look up the call
      await this.transcriptQueue.add('process_transcript', {
        call_id: dto.call_id,
        org_id: null,
        transcript: dto.transcript,
        agent_id: dto.agent_id,
      } satisfies TranscriptJobData & { agent_id?: string });
    }
  }

  private getRedisConnection() {
    const host = this.configService.get<string>('redis.host', 'localhost');
    const port = this.configService.get<number>('redis.port', 6379);
    const password = this.configService.get<string>('redis.password', '');
    return { host, port, password: password || undefined };
  }
}
