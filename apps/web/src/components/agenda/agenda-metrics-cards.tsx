import { useAppointmentMetrics } from '@/hooks/useAppointments';
import { useFollowUpMetrics } from '@/hooks/useAutomation';
import { Card } from '@/components/ui/card';
import { CalendarDays, CalendarCheck, Clock, CheckCircle2, AlertCircle, UserCheck } from 'lucide-react';

const BOOKING_STATS = [
  { key: 'today_count', label: 'Today', Icon: CalendarDays, color: 'text-accent' },
  { key: 'week_count', label: 'This week', Icon: CalendarCheck, color: 'text-accent' },
  { key: 'pending_count', label: 'Awaiting', Icon: Clock, color: 'text-warning' },
  { key: 'completed_count', label: 'Completed', Icon: CheckCircle2, color: 'text-success' },
  { key: 'needs_outcome_count', label: 'Needs outcome', Icon: AlertCircle, color: 'text-danger' },
] as const;

const FOLLOW_UP_STATS = [
  { key: 'today_count', label: 'Today', Icon: CalendarDays, color: 'text-accent' },
  { key: 'week_count', label: 'This week', Icon: CalendarCheck, color: 'text-accent' },
  { key: 'pending_count', label: 'Scheduled', Icon: Clock, color: 'text-warning' },
  { key: 'completed_count', label: 'Done', Icon: CheckCircle2, color: 'text-success' },
  { key: 'awaiting_user_count', label: 'Your turn', Icon: UserCheck, color: 'text-danger' },
] as const;

export function AgendaMetricsCards({ calendarId, isFollowUp = false }: { calendarId?: string | null; isFollowUp?: boolean }) {
  const bookings = useAppointmentMetrics(isFollowUp ? null : calendarId);
  const followUps = useFollowUpMetrics(calendarId ?? null, isFollowUp);
  const { data, isLoading } = isFollowUp ? followUps : bookings;
  const stats = isFollowUp ? FOLLOW_UP_STATS : BOOKING_STATS;
  const values = (data ?? {}) as Record<string, number | undefined>;

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
      {stats.map(({ key, label, Icon, color }) => (
        <Card key={key} className="p-4">
          <div className="flex items-center gap-3">
            <div className={`rounded-lg p-2 bg-surface-raised ${color}`}>
              <Icon className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xs text-secondary">{label}</p>
              {isLoading ? (
                <div className="mt-0.5 h-5 w-8 animate-pulse rounded-sm bg-surface-hover" />
              ) : (
                <p className="text-xl font-bold text-primary">{values[key] ?? 0}</p>
              )}
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
