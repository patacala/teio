'use client';

import { useRouter } from 'next/navigation';
import { Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AppointmentStatusBadge } from '@/components/agenda/appointment-status-badge';
import { useContactAppointments } from '@/hooks/useContacts';

interface Props {
  contactId: string;
}

export function AppointmentsCard({ contactId }: Props) {
  const router = useRouter();
  const { data: appointments = [], isLoading } = useContactAppointments(contactId);

  return (
    <div className="bg-surface border border-subtle rounded-xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <Calendar className="h-4 w-4 text-muted" />
        <h3 className="text-sm font-semibold text-primary">Appointments</h3>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2].map((i) => (
            <div key={i} className="h-8 bg-surface-raised animate-pulse rounded-sm" />
          ))}
        </div>
      ) : appointments.length === 0 ? (
        <p className="text-sm text-muted">No appointments</p>
      ) : (
        <ul className="space-y-2">
          {appointments.map((apt) => (
            <li key={apt.id} className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-medium text-primary truncate">{apt.title}</p>
                <p className="text-xs text-secondary">
                  {new Date(apt.starts_at).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </p>
              </div>
              <AppointmentStatusBadge status={apt.status} />
            </li>
          ))}
        </ul>
      )}

      <Button
        variant="outline"
        size="sm"
        className="mt-4 w-full"
        onClick={() => router.push('/agenda')}
      >
        Open Calendar
      </Button>
    </div>
  );
}
