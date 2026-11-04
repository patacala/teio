'use client';

import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { TablePagination } from '@/components/ui/table-pagination';
import { AppointmentStatusBadge } from './appointment-status-badge';
import { AppointmentOriginBadge } from './appointment-origin-badge';
import { AppointmentActionBadge } from './appointment-action-badge';
import { Pencil, CheckCircle2, Trash2, Calendar } from 'lucide-react';
import type { Appointment } from '@/services/scheduling.service';

interface Props {
  appointments: Appointment[];
  isLoading: boolean;
  onEdit: (appt: Appointment) => void;
  onComplete: (id: string) => void;
  onDelete: (id: string) => void;
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}

function formatDate(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  const h = d.getHours();
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${h12}:${pad(d.getMinutes())} ${ampm}`;
}

function getDurationMin(appt: Appointment) {
  return Math.round((new Date(appt.ends_at).getTime() - new Date(appt.starts_at).getTime()) / 60_000);
}

export function AppointmentsTable({
  appointments,
  isLoading,
  onEdit,
  onComplete,
  onDelete,
  page,
  pageSize,
  total,
  onPageChange,
}: Props) {
  if (isLoading) {
    return (
      <div className="rounded-xl border border-subtle bg-surface overflow-hidden">
        <div className="divide-y divide-subtle">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-3">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-4 w-12" />
              <Skeleton className="h-5 w-20 rounded-full" />
              <Skeleton className="h-5 w-16 rounded-full" />
              <Skeleton className="h-7 w-20" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (appointments.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center rounded-xl border border-subtle bg-surface">
        <Calendar className="h-10 w-10 text-muted mb-3" />
        <p className="text-sm font-medium text-secondary">No appointments scheduled</p>
        <p className="text-xs text-muted mt-1">Create a new appointment with the button above.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-subtle bg-surface overflow-hidden h-full flex flex-col">
      <div className="overflow-auto flex-1 min-h-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-subtle bg-surface-raised text-left">
              <th className="px-4 py-2.5 font-medium text-secondary whitespace-nowrap sticky top-0 bg-surface-raised z-10">Date/Time</th>
              <th className="px-4 py-2.5 font-medium text-secondary sticky top-0 bg-surface-raised z-10">Contact</th>
              <th className="px-4 py-2.5 font-medium text-secondary sticky top-0 bg-surface-raised z-10">Title</th>
              <th className="px-4 py-2.5 font-medium text-secondary whitespace-nowrap sticky top-0 bg-surface-raised z-10">Duration</th>
              <th className="px-4 py-2.5 font-medium text-secondary sticky top-0 bg-surface-raised z-10">Status</th>
              <th className="px-4 py-2.5 font-medium text-secondary sticky top-0 bg-surface-raised z-10">Origin</th>
              <th className="px-4 py-2.5 font-medium text-secondary sticky top-0 bg-surface-raised z-10">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-subtle">
            {appointments.map((appt) => {
              const contactName = appt.contact
                ? `${appt.contact.first_name} ${appt.contact.last_name ?? ''}`.trim()
                : appt.contact_id;
              const doneOrCancelled = appt.status === 'completed' || appt.status === 'cancelled';
              return (
                <tr key={appt.id} className="hover:bg-surface-raised transition-colors">
                  <td className="px-4 py-3 whitespace-nowrap text-primary">
                    {formatDate(appt.starts_at)}
                  </td>
                  <td className="px-4 py-3 text-primary font-medium max-w-[140px] truncate">
                    {contactName}
                  </td>
                  <td className="px-4 py-3 text-primary max-w-[200px] truncate">{appt.title}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-secondary">
                    {getDurationMin(appt)} min
                  </td>
                  <td className="px-4 py-3">
                    <AppointmentStatusBadge status={appt.status} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-1">
                      <AppointmentOriginBadge origin={appt.origin} />
                      <AppointmentActionBadge action={(appt as { action?: string }).action} />
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={() => onEdit(appt)}
                        title="Edit"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      {!doneOrCancelled && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-success hover:text-success"
                          onClick={() => onComplete(appt.id)}
                          title="Complete"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-danger hover:text-danger"
                        onClick={() => {
                          if (confirm('Delete this appointment?')) onDelete(appt.id);
                        }}
                        title="Delete"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <TablePagination
        page={page}
        pageSize={pageSize}
        total={total}
        onPageChange={onPageChange}
        label="appointments"
      />
    </div>
  );
}
