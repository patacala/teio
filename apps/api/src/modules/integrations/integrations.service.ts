import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WebhookEntity } from './webhook.entity';
import { WebhookDeliveryEntity } from './webhook-delivery.entity';

export interface CreateWebhookDto {
  name: string;
  url: string;
  events: string[];
  secret?: string;
  metadata?: Record<string, unknown>;
}

export interface UpdateWebhookDto {
  name?: string;
  url?: string;
  events?: string[];
  is_active?: boolean;
  secret?: string;
}

@Injectable()
export class IntegrationsService {
  constructor(
    @InjectRepository(WebhookEntity)
    private readonly webhookRepo: Repository<WebhookEntity>,
    @InjectRepository(WebhookDeliveryEntity)
    private readonly deliveryRepo: Repository<WebhookDeliveryEntity>,
  ) {}

  async findAll(organizationId: string): Promise<WebhookEntity[]> {
    return this.webhookRepo.find({
      where: { organization_id: organizationId },
      order: { created_at: 'DESC' },
    });
  }

  async findById(id: string, organizationId: string): Promise<WebhookEntity> {
    const webhook = await this.webhookRepo.findOne({
      where: { id, organization_id: organizationId },
    });
    if (!webhook) throw new NotFoundException(`Webhook ${id} not found`);
    return webhook;
  }

  async create(organizationId: string, dto: CreateWebhookDto): Promise<WebhookEntity> {
    const events = Array.isArray(dto.events) ? dto.events : [dto.events].filter(Boolean);
    const webhook = this.webhookRepo.create({
      organization_id: organizationId,
      metadata: dto.metadata ?? {},
      ...dto,
      events,
    });
    return this.webhookRepo.save(webhook);
  }

  async update(id: string, organizationId: string, dto: UpdateWebhookDto): Promise<WebhookEntity> {
    const webhook = await this.findById(id, organizationId);
    if (dto.events !== undefined) {
      dto.events = Array.isArray(dto.events) ? dto.events : [dto.events].filter(Boolean);
    }
    Object.assign(webhook, dto);
    return this.webhookRepo.save(webhook);
  }

  async delete(id: string, organizationId: string): Promise<void> {
    await this.findById(id, organizationId);
    await this.webhookRepo.delete({ id, organization_id: organizationId });
  }

  async findDeliveries(webhookId: string, orgId: string, limit = 50): Promise<WebhookDeliveryEntity[]> {
    await this.findById(webhookId, orgId);
    return this.deliveryRepo.find({
      where: { webhook_id: webhookId },
      order: { delivered_at: 'DESC' },
      take: limit,
    });
  }

  async testWebhook(id: string, orgId: string): Promise<{
    success: boolean;
    status_code?: number;
    response_body?: string;
    error?: string;
  }> {
    const webhook = await this.webhookRepo.findOne({
      where: { id, organization_id: orgId },
      select: ['id', 'url', 'secret'],
    });
    if (!webhook) throw new NotFoundException(`Webhook ${id} not found`);

    const payload = {
      event: 'test',
      organization_id: orgId,
      timestamp: new Date().toISOString(),
      data: { message: 'Test webhook from CRM' },
    };

    const payloadStr = JSON.stringify(payload);
    const { createHmac, randomUUID } = await import('crypto');

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-CRM-Event': 'test',
      'X-CRM-Delivery': randomUUID(),
      'X-CRM-Timestamp': payload.timestamp,
    };

    if (webhook.secret) {
      const sig = createHmac('sha256', webhook.secret).update(payloadStr).digest('hex');
      headers['X-CRM-Signature'] = `sha256=${sig}`;
    }

    try {
      const response = await fetch(webhook.url, {
        method: 'POST',
        headers,
        body: payloadStr,
        signal: AbortSignal.timeout(10_000),
      });

      const text = await response.text().catch(() => '');
      return {
        success: response.ok,
        status_code: response.status,
        response_body: text.slice(0, 2000),
      };
    } catch (err: unknown) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}
