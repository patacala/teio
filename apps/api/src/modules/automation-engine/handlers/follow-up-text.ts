import { FOLLOW_UP_MESSAGE, renderTemplate } from '../../../infrastructure/messaging';
import type { ScheduledActionEntity } from '../scheduled-action.entity';
import type { ContactEntity } from '../../client-management/contact.entity';
import type { OrganizationEntity } from '../../organizations/organization.entity';

/** The step's own text, or the default follow-up message for this contact. */
export function followUpText(
  step: Pick<ScheduledActionEntity, 'message_content'>,
  contact: Pick<ContactEntity, 'first_name' | 'last_name'>,
  org: Pick<OrganizationEntity, 'name'>,
): string {
  if (step.message_content) return step.message_content;
  const userName = [contact.first_name, contact.last_name].filter(Boolean).join(' ');
  return renderTemplate(FOLLOW_UP_MESSAGE, { user_name: userName, organization_name: org.name });
}
