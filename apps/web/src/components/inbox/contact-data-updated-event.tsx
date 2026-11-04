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
      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-olive-dark border border-accent/12">
        <UserPen className="h-3 w-3 text-accent/75 shrink-0" />
        <span className="text-[11px] text-accent">{fieldNames} updated</span>
        <span className="text-[10px] text-accent/75 shrink-0">· {formatRelativeTime(timestamp)}</span>
      </div>
    </div>
  );
}
