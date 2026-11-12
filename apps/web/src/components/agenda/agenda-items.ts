import type { AgendaItem, Appointment } from '@/services/scheduling.service';
import type { AutomatedFollowUp } from '@/services/automation.service';

/** Follow-up steps are instants; the agenda shows them as short blocks. */
export const STEP_BLOCK_MINUTES = 15;

export function bookingItem(appt: Appointment): AgendaItem {
  return { ...appt, kind: 'booking' };
}

export function stepItem(step: AutomatedFollowUp): AgendaItem {
  const starts = new Date(step.due_at);
  return {
    kind: 'step',
    id: step.id,
    contact_id: step.contact_id,
    contact: step.contact ? { ...step.contact, last_name: step.contact.last_name ?? '' } : undefined,
    title: step.title,
    description: step.description,
    starts_at: starts.toISOString(),
    ends_at: new Date(starts.getTime() + STEP_BLOCK_MINUTES * 60_000).toISOString(),
    status: step.status,
    origin: (step.origin as AgendaItem['origin']) ?? 'automation',
    timezone: step.timezone,
    calendar_id: step.calendar_id,
    action: step.action,
    executor: step.executor,
    channel_strategy: step.channel_strategy,
    message_content: step.message_content,
    created_at: step.created_at,
    updated_at: step.updated_at,
  };
}
