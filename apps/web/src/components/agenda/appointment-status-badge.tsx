import { cn } from '@/lib/utils';
import { STATUS_LABELS } from './appointment-status';

const styles: Record<string, string> = {
  held: 'bg-warning/15 text-warning',
  pending: 'bg-warning/15 text-warning',
  scheduled: 'bg-warning/15 text-warning',
  confirmed: 'bg-olive-dark text-accent',
  completed: 'bg-success/15 text-success',
  cancelled: 'bg-danger/15 text-danger',
  no_show: 'bg-surface-raised text-secondary',
  processing: 'bg-surface-raised text-secondary',
  failed: 'bg-danger/15 text-danger',
  needs_outcome: 'bg-danger/15 text-danger',
};

interface Props {
  status: string;
  /** Ended but never marked completed / no-show. */
  needsOutcome?: boolean;
  className?: string;
}

export function AppointmentStatusBadge({ status, needsOutcome, className }: Props) {
  const key = needsOutcome ? 'needs_outcome' : status;
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        styles[key] ?? styles.scheduled,
        className,
      )}
    >
      {needsOutcome ? 'Needs outcome' : STATUS_LABELS[status] ?? status}
    </span>
  );
}
