import {
  Injectable, Logger, OnModuleInit, OnModuleDestroy, Inject,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { Worker, Queue, Job } from 'bullmq';
import { createHmac, randomUUID } from 'crypto';
import { WebhookEntity } from './webhook.entity';
import { WebhookDeliveryEntity } from './webhook-delivery.entity';

export const WEBHOOK_DISPATCH_QUEUE_TOKEN = 'WEBHOOK_DISPATCH_QUEUE';

/** A webhook target must be an absolute http(s) URL — not a bare email/hostname. */
function isValidWebhookUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

interface DeliverJobData {
  webhookId: string;
  webhookUrl: string;
  webhookSecret: string | null;
  event: string;
  organizationId: string;
  payload: Record<string, unknown>;
  attempt: number;
}

@Injectable()
export class WebhookDispatcherService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WebhookDispatcherService.name);
  private worker!: Worker;

  constructor(
    @InjectRepository(WebhookEntity)
    private readonly webhookRepo: Repository<WebhookEntity>,
    @InjectRepository(WebhookDeliveryEntity)
    private readonly deliveryRepo: Repository<WebhookDeliveryEntity>,
    private readonly configService: ConfigService,
    @Inject(WEBHOOK_DISPATCH_QUEUE_TOKEN)
    private readonly queue: Queue,
  ) {}

  onModuleInit() {
    this.worker = new Worker(
      'webhook_dispatch',
      (job: Job<DeliverJobData>) => this.deliverJob(job),
      { connection: this.getRedisConnection(), concurrency: 10 },
    );

    this.worker.on('failed', (job, err) => {
      this.logger.error(`Webhook delivery job ${job?.id} failed: ${err.message}`);
    });
  }

  async onModuleDestroy() {
    await this.worker?.close();
  }

  async hasSubscribers(event: string, organizationId: string): Promise<boolean> {
    const webhooks = await this.webhookRepo.find({
      where: { organization_id: organizationId, is_active: true },
      select: ['id', 'events'],
    });
    return webhooks.some((wh) => wh.events.includes(event));
  }

  async dispatch(event: string, organizationId: string, data: Record<string, unknown>): Promise<void> {
    const webhooks = await this.webhookRepo.find({
      where: { organization_id: organizationId, is_active: true },
      select: ['id', 'url', 'secret', 'events'],
    });

    const matching = webhooks.filter((wh) => wh.events.includes(event));
    if (!matching.length) {
      this.logger.warn(`No matching webhooks for event=${event} org=${organizationId} (found ${webhooks.length} active webhooks)`);
      return;
    }

    // A malformed URL (e.g. an email address pasted where a URL was expected)
    // fails fetch() every single time — queuing it just burns 3 retries with
    // backoff per event, forever. Catch it here, once, and self-heal instead.
    const valid: typeof matching = [];
    for (const webhook of matching) {
      if (isValidWebhookUrl(webhook.url)) {
        valid.push(webhook);
        continue;
      }
      this.logger.error(
        `Webhook ${webhook.id} has an invalid url ("${webhook.url}") — deactivating instead of retrying forever.`,
      );
      void this.webhookRepo.update(webhook.id, { is_active: false });
    }
    if (!valid.length) return;

    const payload = {
      event,
      organization_id: organizationId,
      timestamp: new Date().toISOString(),
      data,
    };

    for (const webhook of valid) {
      try {
        await this.queue.add(
          'deliver',
          {
            webhookId: webhook.id,
            webhookUrl: webhook.url,
            webhookSecret: webhook.secret ?? null,
            event,
            organizationId,
            payload,
            attempt: 1,
          } satisfies DeliverJobData,
          { removeOnComplete: 100, removeOnFail: 200 },
        );
        this.logger.log(`Queued webhook delivery: event=${event} url=${webhook.url} webhook=${webhook.id}`);
      } catch (err) {
        this.logger.error(`Failed to queue webhook delivery: event=${event} webhook=${webhook.id}: ${err}`);
        throw err;
      }
    }
  }

  private async deliverJob(job: Job<DeliverJobData>): Promise<void> {
    const { webhookId, webhookUrl, webhookSecret, event, organizationId, payload, attempt } = job.data;
    this.logger.log(`Delivering webhook: event=${event} url=${webhookUrl} attempt=${attempt}`);

    const deliveryId = randomUUID();
    const timestamp = new Date().toISOString();
    const payloadStr = JSON.stringify(payload);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-CRM-Event': event,
      'X-CRM-Delivery': deliveryId,
      'X-CRM-Timestamp': timestamp,
    };

    if (webhookSecret) {
      const sig = createHmac('sha256', webhookSecret).update(payloadStr).digest('hex');
      headers['X-CRM-Signature'] = `sha256=${sig}`;
    }

    const startedAt = Date.now();
    let statusCode: number | null = null;
    let responseBody: string | null = null;
    let durationMs: number | null = null;
    let succeeded: boolean | null = null;
    let errorMessage: string | null = null;

    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers,
        body: payloadStr,
        signal: AbortSignal.timeout(10_000),
      });

      durationMs = Date.now() - startedAt;
      statusCode = response.status;
      const text = await response.text().catch(() => '');
      responseBody = text.slice(0, 2000);
      succeeded = response.ok;

      if (!response.ok) {
        errorMessage = `HTTP ${response.status}`;
        this.logger.warn(`Webhook delivery failed: url=${webhookUrl} status=${response.status} body=${responseBody?.slice(0, 200)}`);

        if (attempt < 3) {
          const delay = attempt === 1 ? 10_000 : 60_000;
          void this.queue.add(
            'deliver',
            { ...job.data, attempt: attempt + 1 },
            { delay, removeOnComplete: 100, removeOnFail: 200 },
          );
        }

        await this.webhookRepo.increment({ id: webhookId }, 'failure_count', 1);
      } else {
        await this.webhookRepo.update(webhookId, { last_triggered_at: new Date(), failure_count: 0 });
        this.logger.log(`Webhook delivered successfully: url=${webhookUrl} status=${statusCode}`);
      }
    } catch (err: unknown) {
      durationMs = Date.now() - startedAt;
      succeeded = false;
      errorMessage = err instanceof Error ? err.message : String(err);
      this.logger.error(`Webhook delivery error: url=${webhookUrl} error=${errorMessage}`);

      // A malformed URL can't ever succeed on retry — it's a config problem,
      // not a transient network one. Safety net for jobs queued before this
      // guard existed (dispatch() now filters these before they're queued).
      const permanentlyBroken = !isValidWebhookUrl(webhookUrl);
      if (permanentlyBroken) {
        this.logger.error(`Webhook ${webhookId} url is unparseable — deactivating instead of retrying.`);
        await this.webhookRepo.update(webhookId, { is_active: false });
      } else if (attempt < 3) {
        const delay = attempt === 1 ? 10_000 : 60_000;
        void this.queue.add(
          'deliver',
          { ...job.data, attempt: attempt + 1 },
          { delay, removeOnComplete: 100, removeOnFail: 200 },
        );
      }

      await this.webhookRepo.increment({ id: webhookId }, 'failure_count', 1);
    } finally {
      await this.deliveryRepo.save(
        this.deliveryRepo.create({
          webhook_id: webhookId,
          organization_id: organizationId,
          event_type: event,
          payload,
          status_code: statusCode,
          response_body: responseBody,
          duration_ms: durationMs,
          succeeded,
          error_message: errorMessage,
        }),
      );
    }
  }

  private getRedisConnection() {
    const host = this.configService.get<string>('redis.host', 'localhost');
    const port = this.configService.get<number>('redis.port', 6379);
    const password = this.configService.get<string>('redis.password', '');
    return { host, port, password: password || undefined };
  }
}
