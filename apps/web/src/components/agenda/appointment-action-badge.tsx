import { MessageSquare, Phone, Mail, Bell, CheckSquare } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * The action an automated appointment will perform. Calls are highlighted
 * because they are the escalation step and read very differently from a
 * message when scanning the schedule.
 */
const config = {
  send_message: { label: 'Message', Icon: MessageSquare, className: 'bg-surface-raised text-secondary' },
  call: { label: 'Call', Icon: Phone, className: 'bg-olive-dark text-accent' },
  send_email: { label: 'Email', Icon: Mail, className: 'bg-surface-raised text-secondary' },
  notify_agent: { label: 'Aviso', Icon: Bell, className: 'bg-warning/15 text-warning' },
  create_task: { label: 'Task', Icon: CheckSquare, className: 'bg-surface-raised text-secondary' },
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
