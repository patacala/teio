'use client';

import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { TablePagination } from '@/components/ui/table-pagination';
import { AppointmentStatusBadge } from './appointment-status-badge';
import { AppointmentOriginBadge } from './appointment-origin-badge';
import { AppointmentActionBadge } from './appointment-action-badge';
import { Pencil, CheckCircle2, Trash2, Calendar, CheckCheck, UserX, XCircle, Send } from 'lucide-react';
import type { AgendaItem } from '@/services/scheduling.service';
import { formatZonedTime, localDate } from '@/lib/timezone';
import { isFollowUpStep, itemActions, needsOutcome } from './appointment-status';

interface Props {
  appointments: AgendaItem[];
  /** Times are shown on this calendar's wall clock. */
  timeZone: string;
  isLoading: boolean;
  onEdit: (item: AgendaItem) => void;
  onComplete: (item: AgendaItem) => void;
  onDelete: (item: AgendaItem) => void;
  onConfirm: (item: AgendaItem) => void;
  onCancel: (item: AgendaItem) => void;
  onNoShow: (item: AgendaItem) => void;
  onResend?: (item: AgendaItem) => void;
  /** Owners/admins; the API refuses deletes from other roles. */
  canDelete: boolean;
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}

function formatDate(iso: string, timeZone: string) {
  const [y, m, d] = localDate(new Date(iso), timeZone).split('-');
  return `${d}/${m}/${y} ${formatZonedTime(iso, timeZone)}`;
}

function getDurationMin(appt: AgendaItem) {
  return Math.round((new Date(appt.ends_at).getTime() - new Date(appt.starts_at).getTime()) / 60_000);
}

export function AppointmentsTable({
  appointments,
  timeZone,
  isLoading,
  onEdit,
  onComplete,
  onDelete,
  onConfirm,
  onCancel,
  onNoShow,
  onResend,
  canDelete,
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
              const step = isFollowUpStep(appt);
              const actions = itemActions(appt);
              return (
                <tr key={appt.id} className="hover:bg-surface-raised transition-colors">
                  <td className="px-4 py-3 whitespace-nowrap text-primary">
                    {formatDate(appt.starts_at, timeZone)}
                  </td>
                  <td className="px-4 py-3 text-primary font-medium max-w-[140px] truncate">
                    {contactName}
                  </td>
                  <td className="px-4 py-3 text-primary max-w-[200px] truncate">{appt.title}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-secondary">
                    {getDurationMin(appt)} min
                  </td>
                  <td className="px-4 py-3">
                    <AppointmentStatusBadge status={appt.status} needsOutcome={needsOutcome(appt)} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-1">
                      <AppointmentOriginBadge origin={appt.origin} />
                      <AppointmentActionBadge action={appt.action} />
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
                      {actions.confirm && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-accent hover:text-accent"
                          onClick={() => onConfirm(appt)}
                          title="Confirm for the contact"
                        >
                          <CheckCheck className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {actions.resend && onResend && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0"
                          onClick={() => onResend(appt)}
                          title="Resend confirmation link"
                        >
                          <Send className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {actions.complete && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-success hover:text-success"
                          onClick={() => onComplete(appt)}
                          title={step ? 'Mark done' : 'Complete'}
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {actions.noShow && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0"
                          onClick={() => onNoShow(appt)}
                          title="No-show"
                        >
                          <UserX className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {actions.cancel && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-danger hover:text-danger"
                          onClick={() => {
                            if (confirm(step ? 'Skip this follow-up step?' : 'Cancel this appointment? The contact will be notified.')) onCancel(appt);
                          }}
                          title={step ? 'Skip step' : 'Cancel'}
                        >
                          <XCircle className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {actions.remove && (step || canDelete) && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-danger hover:text-danger"
                          onClick={() => {
                            if (confirm(step ? 'Delete this follow-up step?' : 'Delete this appointment?')) onDelete(appt);
                          }}
                          title="Delete"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
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
