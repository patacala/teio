import { ScheduledActionEntity } from '../scheduled-action.entity';
import { ContactEntity } from '../../client-management/contact.entity';
import { OrganizationEntity } from '../../organizations/organization.entity';
import type { ResolvedChannel } from '../channel-strategy-resolver.service';

export interface ActionResult {
  completed: boolean;
  channel?: string;
  /**
   * What actually ran, when it differs from the step's planned action — e.g. a
   * `call` degraded to `send_message` because the contact has no phone.
   */
  executedAction?: string;
}

export interface IActionHandler {
  readonly actionType: string;
  execute(
    appointment: ScheduledActionEntity,
    contact: ContactEntity,
    resolved: ResolvedChannel | null,
    org: OrganizationEntity,
  ): Promise<ActionResult>;
}
