import { UserPen } from 'lucide-react';
import { formatRelativeTime } from '@/lib/utils';

const FIELD_LABELS: Record<string, string> = {
  first_name: 'First name',
  last_name: 'Last name',
  email: 'Email',
  phone: 'Phone',
};

interface ContactDataUpdatedEventProps {
  changedFields: Record<string, { from: unknown; to: unknown }>;
  timestamp: string;
}

export function ContactDataUpdatedEvent({ changedFields, timestamp }: ContactDataUpdatedEventProps) {
  const fieldNames = Object.keys(changedFields)
    .map((k) => FIELD_LABELS[k] ?? k)
    .join(', ');

  return (
    <div className="flex justify-center my-1">
      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-50 border border-blue-100">
        <UserPen className="h-3 w-3 text-blue-400 shrink-0" />
        <span className="text-[11px] text-blue-600">{fieldNames} updated</span>
        <span className="text-[10px] text-blue-300 shrink-0">· {formatRelativeTime(timestamp)}</span>
      </div>
    </div>
  );
}
