import {
  Controller,
  Post,
  Req,
  Res,
  HttpCode,
  HttpStatus,
  Logger,
  BadRequestException,
  Inject,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { Queue } from 'bullmq';
import { Public } from '../../common/decorators/public.decorator';
import { RetellWebhookDto } from './retell-webhook.dto';
import { CALL_PROCESSING_QUEUE_TOKEN } from './call-processing.processor';

@Controller()
export class RetellWebhookController {
  private readonly logger = new Logger(RetellWebhookController.name);

  constructor(
    @Inject(CALL_PROCESSING_QUEUE_TOKEN)
    private readonly callQueue: Queue,
  ) {}

  @Public()
  @Post('webhooks/retell')
  @HttpCode(HttpStatus.OK)
  async handleRetellWebhook(
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    // ── 1. Parse and validate body ───────────────────────────────────────────
    let parsed: Record<string, unknown>;
    try {
      parsed = req.body as Record<string, unknown>;
      if (!parsed || typeof parsed !== 'object') {
        throw new Error('Not an object');
      }
    } catch {
      throw new BadRequestException('Invalid JSON body');
    }

    // Retell sends { event, call: { call_id, agent_id, ... } }
    // Flatten call.* to top-level so downstream code stays unchanged
    const flat: Record<string, unknown> = { event: parsed.event };
    if (parsed.call && typeof parsed.call === 'object') {
      Object.assign(flat, parsed.call);
    } else {
      // Legacy / test payloads may already be flat
      Object.assign(flat, parsed);
    }

    const dto = plainToInstance(RetellWebhookDto, flat);
    const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: false });
    if (errors.length > 0) {
      this.logger.warn(`Validation failed: ${JSON.stringify(errors)}`);
      res.status(HttpStatus.BAD_REQUEST).json({ message: 'Validation failed', errors });
      return;
    }

    // ── 2. Enqueue and return 200 immediately ────────────────────────────────
    await this.callQueue.add('process_call', { dto }, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: 100,
      removeOnFail: 50,
    });

    this.logger.log(`Enqueued call event: ${dto.event} for call ${dto.call_id}`);
    res.status(HttpStatus.OK).json({ status: 'queued' });
  }
}
