import { Controller, Logger } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { RABBITMQ_QUEUES } from '../../infrastructure/rabbitmq/rabbitmq.constants';
import { AnalyticsService } from '../analytics/analytics.service';

interface CallStartedPayload {
  organization_id: string;
  call_id: string;
  contact_id?: string;
  channel?: string;
}

interface CallCompletedPayload {
  organization_id: string;
  call_id: string;
  contact_id?: string;
  duration_seconds?: number;
  status?: string;
}

interface CallTranscriptPayload {
  organization_id: string;
  call_id: string;
  transcript_id?: string;
}

@Controller()
export class VoiceEventConsumer {
  private readonly logger = new Logger(VoiceEventConsumer.name);

  constructor(private readonly analyticsService: AnalyticsService) {}

  @EventPattern(RABBITMQ_QUEUES.CALL_STARTED)
  async handleCallStarted(@Payload() data: CallStartedPayload): Promise<void> {
    try {
      await this.analyticsService.track(data.organization_id, {
        event_type: 'call.started',
        resource_id: data.call_id,
        resource_type: 'call',
        properties: {
          contact_id: data.contact_id,
          channel: data.channel,
        },
      });
      this.logger.debug(`Tracked call.started for call ${data.call_id}`);
    } catch (err) {
      this.logger.warn(`Failed to handle call.started: ${(err as Error).message}`);
    }
  }

  @EventPattern(RABBITMQ_QUEUES.CALL_COMPLETED)
  async handleCallCompleted(@Payload() data: CallCompletedPayload): Promise<void> {
    try {
      await this.analyticsService.track(data.organization_id, {
        event_type: 'call.completed',
        resource_id: data.call_id,
        resource_type: 'call',
        properties: {
          contact_id: data.contact_id,
          duration_seconds: data.duration_seconds,
          status: data.status,
        },
      });
      this.logger.debug(`Tracked call.completed for call ${data.call_id}`);
    } catch (err) {
      this.logger.warn(`Failed to handle call.completed: ${(err as Error).message}`);
    }
  }

  @EventPattern(RABBITMQ_QUEUES.CALL_TRANSCRIPT_UPDATED)
  async handleCallTranscriptUpdated(@Payload() data: CallTranscriptPayload): Promise<void> {
    try {
      await this.analyticsService.track(data.organization_id, {
        event_type: 'call.transcript.updated',
        resource_id: data.call_id,
        resource_type: 'call',
        properties: {
          transcript_id: data.transcript_id,
        },
      });
      this.logger.debug(`Tracked call.transcript.updated for call ${data.call_id}`);
    } catch (err) {
      this.logger.warn(`Failed to handle call.transcript.updated: ${(err as Error).message}`);
    }
  }
}
