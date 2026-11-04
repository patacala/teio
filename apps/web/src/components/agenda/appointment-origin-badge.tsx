import { Bot, User, Webhook } from 'lucide-react';
import { cn } from '@/lib/utils';

const config = {
  ai: { label: 'Bot IA', Icon: Bot, className: 'bg-chart-purple/15 text-chart-purple' },
  human: { label: 'User', Icon: User, className: 'bg-surface-raised text-secondary' },
  webhook: { label: 'Webhook', Icon: Webhook, className: 'bg-warning/15 text-warning' },
};

interface Props {
  origin: string;
  className?: string;
}

export function AppointmentOriginBadge({ origin, className }: Props) {
  const c = config[origin as keyof typeof config] ?? config.human;
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
