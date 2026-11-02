import { CalendarCheck } from 'lucide-react';
import { formatRelativeTime } from '@/lib/utils';

interface AppointmentEventProps {
  action: string;
  timestamp: string;
}

export function AppointmentEvent({ action, timestamp }: AppointmentEventProps) {
  return (
    <div className="flex flex-col items-center my-2">
      <div className="flex items-center gap-3 w-full px-4">
        <div className="flex-1 h-px bg-border" />
        <div className="flex items-center gap-1.5">
          <CalendarCheck className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
          <span className="text-xs text-gray-500">{action}</span>
        </div>
        <div className="flex-1 h-px bg-border" />
      </div>
      <span className="text-[10px] text-gray-300 mt-0.5">{formatRelativeTime(timestamp)}</span>
    </div>
  );
}
