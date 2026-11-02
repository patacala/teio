import { Injectable, Logger, Optional } from '@nestjs/common';
import type { IActionHandler, ActionResult } from './action-handler.interface';
import { AppointmentEntity } from '../../scheduling/appointment.entity';
import { ContactEntity } from '../../client-management/contact.entity';
import { OrganizationEntity } from '../../organizations/organization.entity';
import { RealtimeBroadcastService } from '../../../infrastructure/realtime/realtime-broadcast.service';
import type { ResolvedChannel } from '../channel-strategy-resolver.service';

@Injectable()
export class NotifyAgentHandler implements IActionHandler {
  readonly actionType = 'notify_agent';
  private readonly logger = new Logger(NotifyAgentHandler.name);

  constructor(
    @Optional() private readonly realtimeService?: RealtimeBroadcastService,
  ) {}

  async execute(
    appointment: AppointmentEntity,
    contact: ContactEntity,
    _resolved: ResolvedChannel | null,
    _org: OrganizationEntity,
  ): Promise<ActionResult> {
    const contactName = `${contact.first_name} ${contact.last_name ?? ''}`.trim();

    await this.realtimeService?.broadcastToOrg(
      appointment.organization_id,
      'follow_up_task',
      {
        appointment_id: appointment.id,
        contact_id: contact.id,
        contact_name: contactName,
        title: appointment.title,
        action: appointment.action,
        executor: appointment.executor,
        message: appointment.message_content,
      },
    ).catch((err) => {
      this.logger.warn(`Realtime broadcast failed: ${err.message}`);
    });

    this.logger.log(`Notified agents for follow-up appointment ${appointment.id}`);
    return { completed: true };
  }
}
