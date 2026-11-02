import { MessageSquare, Phone, Mail, Bell, CheckSquare } from 'lucide-react';

/** Actions a step can take. Must match ActionType in @crm/shared. */
export const ACTIONS = [
  { value: 'send_message', label: 'Mensaje', icon: MessageSquare },
  { value: 'call', label: 'Llamada', icon: Phone },
  { value: 'send_email', label: 'Email', icon: Mail },
  { value: 'notify_agent', label: 'Avisar al agente', icon: Bell },
  { value: 'create_task', label: 'Crear tarea', icon: CheckSquare },
] as const;

/**
 * Resolved at execution time by ChannelStrategyResolverService.
 *
 * `auto` prefers the channel the contact last wrote on, so leaving every step
 * on `auto` never varies the channel — breaking out of the thread has to be
 * stated explicitly on the step.
 */
export const CHANNEL_STRATEGIES = [
  { value: 'auto', label: 'Automático', hint: 'Su último canal, luego la prioridad de la org' },
  { value: 'same_channel', label: 'Mismo canal', hint: 'Solo el canal donde escribió' },
  { value: 'whatsapp_only', label: 'Solo WhatsApp', hint: 'Cae a automático si no tiene' },
  { value: 'sms_only', label: 'Solo SMS', hint: 'Cae a automático si no tiene' },
  { value: 'email_only', label: 'Solo Email', hint: 'Cae a automático si no tiene' },
  { value: 'voice_only', label: 'Solo Llamada', hint: 'Requiere teléfono' },
] as const;

export const SEQUENCE_TYPE_LABELS: Record<string, string> = {
  no_response: 'Sin respuesta',
  reactivation: 'Reactivación',
  post_service: 'Post-servicio',
  appointment_reminder: 'Recordatorio de cita',
  manual: 'Manual',
};

export function actionMeta(value: string) {
  return ACTIONS.find((a) => a.value === value) ?? ACTIONS[0];
}

export function strategyLabel(value: string): string {
  return CHANNEL_STRATEGIES.find((s) => s.value === value)?.label ?? value;
}

/** "2 h" · "1 día" · "3 días" */
export function formatDelay(hours: number): string {
  if (hours < 24) return `${hours} h`;
  const days = Math.round(hours / 24);
  return days === 1 ? '1 día' : `${days} días`;
}
