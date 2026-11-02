import { MessageSquare, Phone, Mail, Bell, CheckSquare } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * The action an automated appointment will perform. Calls are highlighted
 * because they are the escalation step and read very differently from a
 * message when scanning the schedule.
 */
const config = {
  send_message: { label: 'Mensaje', Icon: MessageSquare, className: 'bg-gray-100 text-gray-600' },
  call: { label: 'Llamada', Icon: Phone, className: 'bg-blue-100 text-blue-700' },
  send_email: { label: 'Email', Icon: Mail, className: 'bg-gray-100 text-gray-600' },
  notify_agent: { label: 'Aviso', Icon: Bell, className: 'bg-amber-100 text-amber-700' },
  create_task: { label: 'Tarea', Icon: CheckSquare, className: 'bg-gray-100 text-gray-600' },
};

interface Props {
  action?: string | null;
  className?: string;
}

export function AppointmentActionBadge({ action, className }: Props) {
  if (!action) return null;
  const c = config[action as keyof typeof config];
  if (!c) return null;

  const { Icon, label } = c;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
        c.className,
        className,
      )}
    >
      <Icon className="h-3 w-3" />
      {label}
    </span>
  );
}
