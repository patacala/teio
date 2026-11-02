import { useAppointmentMetrics } from '@/hooks/useAppointments';
import { Card } from '@/components/ui/card';
import { CalendarDays, CalendarCheck, Clock, CheckCircle2 } from 'lucide-react';

const stats = [
  { key: 'today_count' as const, label: 'Today', Icon: CalendarDays, color: 'text-blue-600' },
  { key: 'week_count' as const, label: 'This week', Icon: CalendarCheck, color: 'text-blue-600' },
  { key: 'pending_count' as const, label: 'Pending', Icon: Clock, color: 'text-amber-600' },
  { key: 'completed_count' as const, label: 'Completed', Icon: CheckCircle2, color: 'text-emerald-600' },
];

export function AgendaMetricsCards({ calendarId }: { calendarId?: string | null }) {
  const { data, isLoading } = useAppointmentMetrics(calendarId);

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      {stats.map(({ key, label, Icon, color }) => (
        <Card key={key} className="p-4">
          <div className="flex items-center gap-3">
            <div className={`rounded-lg p-2 bg-gray-50 ${color}`}>
              <Icon className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xs text-gray-500">{label}</p>
              {isLoading ? (
                <div className="mt-0.5 h-5 w-8 animate-pulse rounded bg-gray-200" />
              ) : (
                <p className="text-xl font-bold text-gray-900">{data?.[key] ?? 0}</p>
              )}
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
