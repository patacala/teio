import { Injectable, Logger, Optional } from '@nestjs/common';
import { RealtimeBroadcastService } from '../../infrastructure/realtime/realtime-broadcast.service';
import { RABBITMQ_QUEUES } from '../../infrastructure/rabbitmq/rabbitmq.constants';
import { OutboxService } from '../../infrastructure/outbox/outbox.service';
import { AppointmentEntity } from './appointment.entity';
import type { BookingTx } from './scheduling.types';

export interface ConfirmationRequest {
  confirmUrlEmail: string;
  confirmUrlSms: string;
  manageUrlEmail?: string;
  manageUrlSms?: string;
  reminder?: boolean;
  rescheduled?: boolean;
}

export interface ReminderDue extends Partial<ConfirmationRequest> {
  reminderId: string;
  offsetMinutes: number;
}

/**
 * The only place appointment events are produced. Inside a booking
 * transaction they go to the outbox with the change itself (published after
 * commit); outside one they are stored and published right away. Payloads
 * carry `origin` and `status`; every event has an `event_id` for dedupe.
 */
@Injectable()
export class AppointmentEventsPublisher {
  private readonly logger = new Logger(AppointmentEventsPublisher.name);

  constructor(
    private readonly outbox: OutboxService,
    @Optional() private readonly realtimeBroadcast?: RealtimeBroadcastService,
  ) {}

  payload(appt: AppointmentEntity): Record<string, unknown> {
    return {
      organization_id: appt.organization_id,
      appointment_id: appt.id,
      calendar_id: appt.calendar_id ?? null,
      contact_id: appt.contact_id,
      conversation_id: appt.conversation_id ?? null,
      assigned_to: appt.assigned_to ?? null,
      title: appt.title,
      starts_at: appt.starts_at,
      ends_at: appt.ends_at,
      location: appt.location,
      meeting_url: appt.meeting_url,
      timezone: appt.timezone ?? 'UTC',
      created_by: appt.created_by,
      description: appt.description,
      origin: appt.origin,
      status: appt.status,
      cancel_reason: appt.cancel_reason ?? null,
      payment_id: appt.payment_id ?? null,
      /** Calendar-invite SEQUENCE: grows with every change of time or status. */
      sequence: (appt.confirmation_version ?? 1) + (appt.status === 'cancelled' ? 1 : 0),
    };
  }

  private async record(tx: BookingTx | null, topic: string, data: Record<string, unknown>): Promise<void> {
    if (tx) {
      await this.outbox.add(tx.manager, topic, data);
      tx.afterCommit(() => this.outbox.kick());
    } else {
      await this.outbox.publish(topic, data);
    }
  }

  async created(tx: BookingTx | null, appt: AppointmentEntity): Promise<void> {
    await this.record(tx, RABBITMQ_QUEUES.APPOINTMENT_CREATED, this.payload(appt));
    const notify = () =>
      void this.realtimeBroadcast
        ?.notifyOrg(appt.organization_id, {
          type: 'appointment',
          title: `Nueva cita: ${appt.title}`,
          href: '/schedule',
          appointmentId: appt.id,
          contactId: appt.contact_id,
          conversationId: appt.conversation_id ?? undefined,
          actorUserId: appt.created_by ?? undefined,
        })
        ?.catch(() => undefined);
    if (tx) tx.afterCommit(notify);
    else notify();
  }

  confirmationRequested(tx: BookingTx | null, appt: AppointmentEntity, request: ConfirmationRequest): Promise<void> {
    return this.record(tx, RABBITMQ_QUEUES.APPOINTMENT_CONFIRMATION_REQUESTED, {
      ...this.payload(appt),
      confirm_url: request.confirmUrlEmail,
      confirm_url_sms: request.confirmUrlSms,
      manage_url: request.manageUrlEmail ?? null,
      manage_url_sms: request.manageUrlSms ?? null,
      reminder: request.reminder ?? false,
      rescheduled: request.rescheduled ?? false,
    });
  }

  reminderDue(tx: BookingTx | null, appt: AppointmentEntity, reminder: ReminderDue): Promise<void> {
    return this.record(tx, RABBITMQ_QUEUES.APPOINTMENT_REMINDER_DUE, {
      ...this.payload(appt),
      reminder_id: reminder.reminderId,
      offset_minutes: reminder.offsetMinutes,
      confirm_url: reminder.confirmUrlEmail ?? null,
      confirm_url_sms: reminder.confirmUrlSms ?? null,
      manage_url: reminder.manageUrlEmail ?? null,
      manage_url_sms: reminder.manageUrlSms ?? null,
    });
  }

  confirmed(tx: BookingTx | null, appt: AppointmentEntity, manage?: { email: string; sms: string }): Promise<void> {
    return this.record(tx, RABBITMQ_QUEUES.APPOINTMENT_CONFIRMED, {
      ...this.payload(appt),
      manage_url: manage?.email ?? null,
      manage_url_sms: manage?.sms ?? null,
    });
  }

  rescheduled(tx: BookingTx | null, appt: AppointmentEntity, manage?: { email: string; sms: string }): Promise<void> {
    return this.record(tx, RABBITMQ_QUEUES.APPOINTMENT_RESCHEDULED, {
      ...this.payload(appt),
      manage_url: manage?.email ?? null,
      manage_url_sms: manage?.sms ?? null,
    });
  }

  cancelled(tx: BookingTx | null, appt: AppointmentEntity): Promise<void> {
    return this.record(tx, RABBITMQ_QUEUES.APPOINTMENT_CANCELLED, this.payload(appt));
  }

  completed(tx: BookingTx | null, appt: AppointmentEntity): Promise<void> {
    return this.record(tx, RABBITMQ_QUEUES.APPOINTMENT_COMPLETED, this.payload(appt));
  }

  noShow(tx: BookingTx | null, appt: AppointmentEntity): Promise<void> {
    return this.record(tx, RABBITMQ_QUEUES.APPOINTMENT_NO_SHOW, this.payload(appt));
  }

  /** An unpaid hold ran out; the slot is free again. */
  holdReleased(tx: BookingTx | null, appt: AppointmentEntity): Promise<void> {
    return this.record(tx, RABBITMQ_QUEUES.APPOINTMENT_HOLD_RELEASED, this.payload(appt));
  }

  /** Descriptive fields changed (title, notes, …). */
  updated(tx: BookingTx | null, appt: AppointmentEntity): Promise<void> {
    return this.record(tx, RABBITMQ_QUEUES.APPOINTMENT_UPDATED, this.payload(appt));
  }

  /** Tells the team a paid booking needs a person (no automatic refunds). */
  paymentNeedsAttention(appt: Pick<AppointmentEntity, 'organization_id' | 'id' | 'contact_id' | 'title'>, reason: string): void {
    void this.realtimeBroadcast
      ?.notifyOrg(appt.organization_id, {
        type: 'system',
        title: 'Pago por revisar',
        description: `${appt.title}: ${reason.replace(/_/g, ' ')}`,
        href: '/payments?tab=attention',
        appointmentId: appt.id,
        contactId: appt.contact_id ?? undefined,
      })
      ?.catch(() => undefined);
  }
}
