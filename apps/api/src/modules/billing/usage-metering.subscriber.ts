import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type { EntitySubscriberInterface, InsertEvent } from 'typeorm';
import type { MeteredMetric } from '@crm/shared';
import { ConversationEntity } from '../conversation-management/conversation.entity';
import { MessageEntity } from '../conversation-management/message.entity';
import { UsageTrackingService } from './usage-tracking.service';

/**
 * Counts conversations and messages at insert time, whatever code path created
 * them (HTTP, channel webhooks, AI replies, automations). Voice call summaries
 * are system messages and are billed as voice minutes instead.
 */
@Injectable()
export class UsageMeteringSubscriber implements EntitySubscriberInterface {
  private readonly logger = new Logger(UsageMeteringSubscriber.name);

  constructor(
    @InjectDataSource() dataSource: DataSource,
    private readonly usageTracking: UsageTrackingService,
  ) {
    dataSource.subscribers.push(this);
  }

  afterInsert(event: InsertEvent<unknown>): void {
    const target = event.metadata.target;
    const entity = event.entity as { organization_id?: string; type?: string } | undefined;
    if (!entity?.organization_id) return;

    if (target === ConversationEntity) {
      this.count(entity.organization_id, 'conversations');
    } else if (target === MessageEntity && entity.type !== 'system') {
      this.count(entity.organization_id, 'messages');
    }
  }

  private count(orgId: string, metric: MeteredMetric): void {
    void this.usageTracking.increment(orgId, metric).catch((err: Error) =>
      this.logger.warn(`Could not count ${metric} for org ${orgId}: ${err.message}`),
    );
  }
}
