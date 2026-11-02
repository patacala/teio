import { AppointmentEntity } from '../../scheduling/appointment.entity';
import { ContactEntity } from '../../client-management/contact.entity';
import { OrganizationEntity } from '../../organizations/organization.entity';
import type { ResolvedChannel } from '../channel-strategy-resolver.service';

export interface ActionResult {
  completed: boolean;
  channel?: string;
  /**
   * What actually ran, when it differs from the step's planned action — e.g. a
   * `call` degraded to `send_message` because the org has no n8n webhook.
   * Recorded on the sequence step so degradations stay visible.
   */
  executedAction?: string;
}

export interface IActionHandler {
  readonly actionType: string;
  execute(
    appointment: AppointmentEntity,
    contact: ContactEntity,
    resolved: ResolvedChannel | null,
    org: OrganizationEntity,
  ): Promise<ActionResult>;
}
