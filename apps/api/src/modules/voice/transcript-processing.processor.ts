import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Worker, Job } from 'bullmq';
import { TranscriptService } from './transcript.service';
import { CallEntity } from './call.entity';

const TRANSCRIPT_PROCESSING_QUEUE = 'transcript_processing';

interface TranscriptJobPayload {
  call_id: string;     // external_call_id from Retell
  transcript: string;
  agent_id?: string;
}

@Injectable()
export class TranscriptProcessingProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TranscriptProcessingProcessor.name);
  private worker: Worker;

  constructor(
    private readonly transcriptService: TranscriptService,
    private readonly configService: ConfigService,
    @InjectRepository(CallEntity)
    private readonly callRepo: Repository<CallEntity>,
  ) {}

  onModuleInit() {
    const connection = this.getRedisConnection();
    this.worker = new Worker(
      TRANSCRIPT_PROCESSING_QUEUE,
      async (job: Job<TranscriptJobPayload>) => this.process(job),
      { connection, concurrency: 3 },
    );

    this.worker.on('failed', (job, err) => {
      this.logger.error(`Transcript job ${job?.id} failed: ${err.message}`, err.stack);
    });
  }

  async onModuleDestroy() {
    await this.worker?.close();
  }

  private async process(job: Job<TranscriptJobPayload>): Promise<void> {
    const { call_id: externalCallId, transcript } = job.data;
    this.logger.debug(`Processing transcript for external call ${externalCallId}`);

    const call = await this.callRepo.findOne({
      where: { external_call_id: externalCallId },
      select: ['id', 'organization_id'],
    });

    if (!call) {
      this.logger.warn(`Call not found for external_call_id=${externalCallId}`);
      return;
    }

    await this.transcriptService.parseAndStore(call.id, call.organization_id, transcript);
  }

  private getRedisConnection() {
    const host = this.configService.get<string>('redis.host', 'localhost');
    const port = this.configService.get<number>('redis.port', 6379);
    const password = this.configService.get<string>('redis.password', '');
    return { host, port, password: password || undefined };
  }
}
