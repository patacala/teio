import { cn } from '@/lib/utils';

const styles: Record<string, string> = {
  pending: 'bg-warning/15 text-warning',
  scheduled: 'bg-warning/15 text-warning',
  confirmed: 'bg-olive-dark text-accent',
  completed: 'bg-success/15 text-success',
  cancelled: 'bg-danger/15 text-danger',
  no_show: 'bg-surface-raised text-secondary',
};

const labels: Record<string, string> = {
  pending: 'Pending',
  scheduled: 'Scheduled',
  confirmed: 'Confirmed',
  completed: 'Completed',
  cancelled: 'Cancelled',
  no_show: 'No-show',
};

interface Props {
  status: string;
  className?: string;
}

export function AppointmentStatusBadge({ status, className }: Props) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        styles[status] ?? styles.scheduled,
        className,
      )}
    >
      {labels[status] ?? status}
    </span>
  );
}
