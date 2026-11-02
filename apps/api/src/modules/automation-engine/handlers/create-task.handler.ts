import { Injectable, Logger } from '@nestjs/common';
import type { IActionHandler, ActionResult } from './action-handler.interface';
import { AppointmentEntity } from '../../scheduling/appointment.entity';
import { ContactEntity } from '../../client-management/contact.entity';
import { OrganizationEntity } from '../../organizations/organization.entity';
import type { ResolvedChannel } from '../channel-strategy-resolver.service';

@Injectable()
export class CreateTaskHandler implements IActionHandler {
  readonly actionType = 'create_task';
  private readonly logger = new Logger(CreateTaskHandler.name);

  async execute(
    appointment: AppointmentEntity,
    _contact: ContactEntity,
    _resolved: ResolvedChannel | null,
    _org: OrganizationEntity,
  ): Promise<ActionResult> {
    this.logger.log(`[STUB] create_task handler for appointment ${appointment.id} — not yet implemented`);
    return { completed: true };
  }
}
