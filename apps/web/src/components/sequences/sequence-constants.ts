import { MessageSquare, Phone, Mail, Bell, CheckSquare } from 'lucide-react';

/** Actions a step can take. Must match ActionType in @crm/shared. */
export const ACTIONS = [
  { value: 'send_message', label: 'Message', icon: MessageSquare },
  { value: 'call', label: 'Call', icon: Phone },
  { value: 'send_email', label: 'Email', icon: Mail },
  { value: 'notify_agent', label: 'Notify agent', icon: Bell },
  { value: 'create_task', label: 'Create task', icon: CheckSquare },
] as const;

/**
 * Resolved at execution time by ChannelStrategyResolverService.
 *
 * `auto` prefers the channel the contact last wrote on, so leaving every step
 * on `auto` never varies the channel — breaking out of the thread has to be
 * stated explicitly on the step.
 */
export const CHANNEL_STRATEGIES = [
  { value: 'auto', label: 'Automatic', hint: 'Their last channel, then the org priority' },
  { value: 'same_channel', label: 'Same channel', hint: 'Only the channel they wrote from' },
  { value: 'whatsapp_only', label: 'WhatsApp only', hint: 'Falls back to automatic if unavailable' },
  { value: 'sms_only', label: 'SMS only', hint: 'Falls back to automatic if unavailable' },
  { value: 'email_only', label: 'Email only', hint: 'Falls back to automatic if unavailable' },
  { value: 'voice_only', label: 'Call only', hint: 'Requires a phone number' },
] as const;

export const SEQUENCE_TYPE_LABELS: Record<string, string> = {
  no_response: 'No response',
  reactivation: 'Reactivation',
  post_service: 'Post-service',
  appointment_reminder: 'Appointment reminder',
  manual: 'Manual',
};

export function actionMeta(value: string) {
  return ACTIONS.find((a) => a.value === value) ?? ACTIONS[0];
}

export function strategyLabel(value: string): string {
  return CHANNEL_STRATEGIES.find((s) => s.value === value)?.label ?? value;
}

/** "2 h" · "1 day" · "3 days" */
export function formatDelay(hours: number): string {
  if (hours < 24) return `${hours} h`;
  const days = Math.round(hours / 24);
  return days === 1 ? '1 day' : `${days} days`;
}
