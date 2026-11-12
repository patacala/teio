import { AppointmentStatus } from '@crm/shared';

/** Statuses that occupy a slot on the calendar. */
export const ACTIVE_BOOKING_STATUSES: readonly string[] = [
  AppointmentStatus.HELD,
  AppointmentStatus.SCHEDULED,
  AppointmentStatus.CONFIRMED,
];

/** Legacy 'pending' bookings behave like 'scheduled'. */
const SCHEDULED_LIKE = [AppointmentStatus.CONFIRMED, AppointmentStatus.CANCELLED, AppointmentStatus.COMPLETED, AppointmentStatus.NO_SHOW];

const TRANSITIONS: Record<string, readonly string[]> = {
  [AppointmentStatus.HELD]: [AppointmentStatus.CONFIRMED, AppointmentStatus.CANCELLED],
  [AppointmentStatus.SCHEDULED]: SCHEDULED_LIKE,
  pending: SCHEDULED_LIKE,
  [AppointmentStatus.CONFIRMED]: [AppointmentStatus.COMPLETED, AppointmentStatus.NO_SHOW, AppointmentStatus.CANCELLED],
  // Outcome corrections only.
  [AppointmentStatus.COMPLETED]: [AppointmentStatus.NO_SHOW],
  [AppointmentStatus.NO_SHOW]: [AppointmentStatus.COMPLETED],
  [AppointmentStatus.CANCELLED]: [],
};

export function canTransition(from: string, to: string): boolean {
  return (TRANSITIONS[from] ?? []).includes(to);
}

export function isActiveBooking(status: string): boolean {
  return ACTIVE_BOOKING_STATUSES.includes(status) || status === 'pending';
}

/** Statuses that can be moved to another time. */
export function isReschedulable(status: string): boolean {
  return status === AppointmentStatus.SCHEDULED || status === AppointmentStatus.CONFIRMED || status === 'pending';
}

/** A booking that has ended but nobody recorded whether it happened. */
export function needsOutcome(
  appt: { status: string; ends_at: Date },
  now: Date,
): boolean {
  return (
    (appt.status === AppointmentStatus.SCHEDULED ||
      appt.status === AppointmentStatus.CONFIRMED ||
      appt.status === 'pending') &&
    appt.ends_at.getTime() < now.getTime()
  );
}
