import { Injectable, Logger, OnModuleDestroy, OnModuleInit, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Worker, Job } from 'bullmq';
import { ToolExecutionService } from './tool-execution.service';
import { TOOL_EXECUTION_QUEUE } from './ai-automation.constants';

export const TOOL_EXECUTION_QUEUE_NAME = 'tool_execution';

export interface ToolExecutionJobData {
  organization_id: string;
  agent_id: string;
  tool: string;
  input: Record<string, unknown>;
  conversation_id?: string;
}

@Injectable()
export class ToolExecutionProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ToolExecutionProcessor.name);
  private worker!: Worker;

  constructor(
    private readonly toolExecutionService: ToolExecutionService,
    private readonly configService: ConfigService,
    @Inject(TOOL_EXECUTION_QUEUE) private readonly _queue: unknown,
  ) {}

  onModuleInit() {
    const host = this.configService.get<string>('redis.host', 'localhost');
    const port = this.configService.get<number>('redis.port', 6379);
    const password = this.configService.get<string>('redis.password', '');

    this.worker = new Worker(
      TOOL_EXECUTION_QUEUE_NAME,
      async (job: Job<ToolExecutionJobData>) => this.process(job),
      {
        connection: { host, port, password: password || undefined },
        concurrency: 10,
      },
    );

    this.worker.on('failed', (job, err) => {
      this.logger.error(`ToolExecution job ${job?.id} failed: ${err.message}`, err.stack);
    });
  }

  async onModuleDestroy() {
    await this.worker?.close();
  }

  private async process(job: Job<ToolExecutionJobData>): Promise<void> {
    const { organization_id, agent_id, tool, input, conversation_id } = job.data;

    this.logger.debug(`Async tool execution: ${tool} for agent ${agent_id}`);

    await this.toolExecutionService.execute(
      organization_id,
      agent_id,
      tool,
      input,
      conversation_id,
    );
  }
}
