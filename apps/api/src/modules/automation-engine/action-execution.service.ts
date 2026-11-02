import { Injectable, Logger, Optional, Inject } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ContactEntity } from '../client-management/contact.entity';
import { OrganizationEntity } from '../organizations/organization.entity';
import { RealtimeBroadcastService } from '../../infrastructure/realtime/realtime-broadcast.service';
import { RABBITMQ_SERVICE, RABBITMQ_QUEUES } from '../../infrastructure/rabbitmq/rabbitmq.constants';
import { AutomatedAppointmentService } from './automated-appointment.service';
import { AutomationSequenceService } from './automation-sequence.service';
import { ChannelStrategyResolverService } from './channel-strategy-resolver.service';
import type { IActionHandler } from './handlers/action-handler.interface';
import { SendMessageHandler } from './handlers/send-message.handler';
import { SendEmailHandler } from './handlers/send-email.handler';
import { NotifyAgentHandler } from './handlers/notify-agent.handler';
import { CreateTaskHandler } from './handlers/create-task.handler';
import { CallHandler } from './handlers/call.handler';

const CHANNEL_REQUIRED_ACTIONS = new Set(['send_message']);

@Injectable()
export class ActionExecutionService {
  private readonly logger = new Logger(ActionExecutionService.name);
  private readonly handlerMap = new Map<string, IActionHandler>();

  constructor(
    private readonly automatedAppointmentService: AutomatedAppointmentService,
    private readonly sequenceService: AutomationSequenceService,
    private readonly channelResolver: ChannelStrategyResolverService,
    @InjectRepository(ContactEntity)
    private readonly contactRepo: Repository<ContactEntity>,
    @InjectRepository(OrganizationEntity)
    private readonly orgRepo: Repository<OrganizationEntity>,
    @Optional() private readonly realtimeService?: RealtimeBroadcastService,
    @Optional() @Inject(RABBITMQ_SERVICE) private readonly rmqClient?: ClientProxy,
    @Optional() private readonly sendMessageHandler?: SendMessageHandler,
    @Optional() private readonly sendEmailHandler?: SendEmailHandler,
    @Optional() private readonly notifyAgentHandler?: NotifyAgentHandler,
    @Optional() private readonly createTaskHandler?: CreateTaskHandler,
    @Optional() private readonly callHandler?: CallHandler,
  ) {
    const handlers: IActionHandler[] = [
      this.sendMessageHandler,
      this.sendEmailHandler,
      this.notifyAgentHandler,
      this.createTaskHandler,
      this.callHandler,
    ].filter(Boolean) as IActionHandler[];

    for (const h of handlers) {
      this.handlerMap.set(h.actionType, h);
    }
  }

  async execute(appointmentId: string): Promise<void> {
    this.logger.debug(`Processing action for appointment ${appointmentId}`);

    const appt = await this.automatedAppointmentService['repo'].findOne({
      where: { id: appointmentId },
    });

    if (!appt) {
      this.logger.warn(`Appointment ${appointmentId} not found — skipping`);
      return;
    }

    if (appt.status !== 'processing') {
      this.logger.debug(`Appointment ${appointmentId} status=${appt.status} — skipping`);
      return;
    }

    const contact = await this.contactRepo.findOne({ where: { id: appt.contact_id } });
    if (!contact) {
      await this.failStep(appt, 'Contact not found');
      return;
    }

    const org = await this.orgRepo.findOne({ where: { id: appt.organization_id } });
    if (!org) {
      await this.failStep(appt, 'Organization not found');
      return;
    }

    let resolved = null;
    if (CHANNEL_REQUIRED_ACTIONS.has(appt.action)) {
      resolved = await this.channelResolver.resolve(
        contact,
        appt.organization_id,
        appt.channel_strategy ?? 'auto',
        appt.metadata as Record<string, unknown>,
      );
    } else if (appt.action === 'send_email') {
      resolved = { channel: 'email', recipientId: contact.email ?? '' };
    }

    const handler = this.handlerMap.get(appt.action);
    if (!handler) {
      await this.failStep(appt, `No handler for action: ${appt.action}`);
      return;
    }

    try {
      const result = await handler.execute(appt, contact, resolved, org);

      // Record what actually ran on the sequence step, so a degraded action
      // (call → message with no webhook) and the channel the resolver picked
      // stay visible for auditing. Fire-and-forget: never block execution.
      if (appt.sequence_id) {
        void this.sequenceService.recordStepOutcome(
          appt.sequence_id,
          appt.metadata?.attempt as number | undefined,
          result.executedAction ?? appt.action,
          result.channel ?? resolved?.channel,
        );
      }

      if (result.completed) {
        await this.automatedAppointmentService.markCompleted(appt.organization_id, appointmentId, result.channel ?? resolved?.channel);

        // If sequence appointment, advance or complete
        if (appt.sequence_id) {
          await this.sequenceService.advanceOrComplete(appt.organization_id, appt.sequence_id);
        }

        try {
          this.rmqClient?.emit(RABBITMQ_QUEUES.FOLLOW_UP_COMPLETED, {
            organization_id: appt.organization_id,
            appointment_id: appt.id,
            contact_id: appt.contact_id,
            action: appt.action,
            channel: result.channel ?? resolved?.channel,
          });
        } catch { /* no consumer registered yet */ }

        this.realtimeService?.broadcastToOrg(appt.organization_id, 'follow_up_completed', {
          appointment_id: appt.id,
          action: appt.action,
          contact_id: appt.contact_id,
        }).catch(() => {});
      }
      // If !result.completed → appointment stays in 'processing'.
      // n8n will complete via complete_follow_up tool.

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      await this.failStep(appt, errorMessage);

      try {
        this.rmqClient?.emit(RABBITMQ_QUEUES.FOLLOW_UP_FAILED, {
          organization_id: appt.organization_id,
          appointment_id: appt.id,
          contact_id: appt.contact_id,
          action: appt.action,
          error: errorMessage,
        });
      } catch { /* no consumer registered yet */ }
    }
  }

  /**
   * A retry keeps the same appointment as the sequence trigger. Once retries
   * are exhausted the step is over, so the sequence must schedule the next
   * agenda or close. Leaving it active with no appointment drops the cadence.
   */
  private async failStep(appt: { id: string; organization_id: string; sequence_id?: string | null }, error: string): Promise<void> {
    const outcome = await this.automatedAppointmentService.markFailed(appt.organization_id, appt.id, error);
    if (outcome === 'failed' && appt.sequence_id) {
      await this.sequenceService.advanceOrComplete(appt.organization_id, appt.sequence_id);
    }
  }
}
