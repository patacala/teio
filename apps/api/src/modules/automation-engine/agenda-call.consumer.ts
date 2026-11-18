import { Controller, Logger } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import type { CallCompletedEvent } from '@crm/shared';
import { RABBITMQ_QUEUES } from '../../infrastructure/rabbitmq/rabbitmq.constants';
import { ScheduledActionService } from './scheduled-action.service';

/**
 * A finished call completes the agenda "call" step that placed it.
 *
 * The voice module emits CALL_COMPLETED for every call — inbound, manual,
 * agent-initiated — so only a step waiting for a call of this contact is
 * closed; any other call leaves the agenda alone.
 */
@Controller()
export class AgendaCallConsumer {
  private readonly logger = new Logger(AgendaCallConsumer.name);

  constructor(private readonly actions: ScheduledActionService) {}

  @EventPattern(RABBITMQ_QUEUES.CALL_COMPLETED)
  async handleCallCompleted(@Payload() data: CallCompletedEvent): Promise<void> {
    if (!data?.contact_id || !data?.organization_id) return;
    try {
      const step = await this.actions.findProcessingByContactAndAction(data.organization_id, data.contact_id, 'call');
      if (!step) return;
      if (await this.actions.markCompleted(data.organization_id, step.id, 'voice')) {
        this.logger.log(`Call completed agenda step ${step.id} for contact ${data.contact_id}`);
      }
    } catch (err) {
      this.logger.warn(`Could not complete the call step of contact ${data.contact_id}: ${(err as Error).message}`);
    }
  }
}
