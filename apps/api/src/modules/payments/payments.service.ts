import { Injectable, Logger, NotFoundException, BadRequestException, Inject, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { ClientProxy } from '@nestjs/microservices';
import type { Queue } from 'bullmq';
import Stripe from 'stripe';
import { PaymentEntity } from './entities/payment.entity';
import { ContactEntity } from '../client-management/contact.entity';
import { AppointmentEntity } from '../scheduling/appointment.entity';
import { WorkScheduleEntity } from '../scheduling/work-schedule.entity';
import { PaymentSettingsService } from './payment-settings.service';
import { PaymentServiceService } from './payment-service.service';
import { SchedulingService } from '../scheduling/scheduling.service';
import { WebhookDispatcherService } from '../integrations/webhook-dispatcher.service';
import { RABBITMQ_SERVICE, RABBITMQ_QUEUES } from '../../infrastructure/rabbitmq/rabbitmq.constants';
import { AGENT_TRIGGER_QUEUE } from '../ai-automation/ai-automation.constants';
import type { CreatePaymentDto, PaymentBookingDto } from './dto/create-payment.dto';

export interface PaymentBookingIntent {
  calendar_id: string;
  title: string;
  starts_at: string;
  duration_minutes: number;
  timezone?: string;
}

export interface PaymentLinkResult {
  payment_id: string;
  url: string;
  amount: number;
  currency: string;
  service_name: string;
  appointment_id: string | null;
  booking: PaymentBookingIntent | null;
}

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    @InjectRepository(PaymentEntity)
    private readonly paymentRepo: Repository<PaymentEntity>,
    @InjectRepository(ContactEntity)
    private readonly contactRepo: Repository<ContactEntity>,
    @InjectRepository(AppointmentEntity)
    private readonly appointmentRepo: Repository<AppointmentEntity>,
    @InjectRepository(WorkScheduleEntity)
    private readonly calendarRepo: Repository<WorkScheduleEntity>,
    private readonly settingsService: PaymentSettingsService,
    private readonly paymentServiceService: PaymentServiceService,
    private readonly schedulingService: SchedulingService,
    private readonly config: ConfigService,
    @Inject(RABBITMQ_SERVICE)
    private readonly rmqClient: ClientProxy,
    @Optional() @Inject(AGENT_TRIGGER_QUEUE)
    private readonly agentQueue?: Queue,
    @Optional() private readonly webhookDispatcher?: WebhookDispatcherService,
  ) {}

  async findAll(organizationId: string, contactId?: string): Promise<PaymentEntity[]> {
    return this.paymentRepo.find({
      where: contactId
        ? { organization_id: organizationId, contact_id: contactId }
        : { organization_id: organizationId },
      relations: ['service', 'contact'],
      order: { created_at: 'DESC' },
    });
  }

  /**
   * Creates a Stripe Checkout Session on the ORG'S OWN Stripe account for a
   * configured service, and records the pending Payment. Called by the
   * `create_payment_link` agent tool — the caller (the AI) is responsible for
   * actually sending `url` to the contact via `send_message`.
   *
   * When `booking` is provided, the appointment is NOT created yet — it is
   * stored on the payment and only materialized as `confirmed` after Stripe pays.
   */
  async createCheckoutLink(
    organizationId: string,
    dto: CreatePaymentDto,
  ): Promise<PaymentLinkResult> {
    const [stripe, settings, service, contact] = await Promise.all([
      this.settingsService.getStripeClient(organizationId),
      this.settingsService.getRaw(organizationId),
      this.paymentServiceService.findById(dto.service_id, organizationId),
      this.contactRepo.findOne({ where: { id: dto.contact_id, organization_id: organizationId } }),
    ]);

    if (!contact) throw new NotFoundException(`Contact ${dto.contact_id} not found`);
    if (!service.is_active) throw new BadRequestException(`Service '${service.name}' is not active`);

    if (dto.appointment_id) {
      const appointment = await this.appointmentRepo.findOne({
        where: { id: dto.appointment_id, organization_id: organizationId },
      });
      if (!appointment) {
        throw new NotFoundException(`Appointment ${dto.appointment_id} not found`);
      }
      if (appointment.contact_id !== dto.contact_id) {
        throw new BadRequestException('appointment_id does not belong to this contact');
      }
    }

    const linkedCalendar = await this.schedulingService.findAppointmentsCalendarForPaymentService(
      organizationId,
      service.id,
    );

    const slot = dto.booking;
    const hasSlot = !!(slot?.starts_at && slot.duration_minutes);
    if (linkedCalendar && !hasSlot && !dto.appointment_id) {
      throw new BadRequestException('booking required for this service');
    }

    let booking: PaymentBookingIntent | null = null;
    if (hasSlot && slot) {
      const defaultCalendar = linkedCalendar
        ? null
        : await this.schedulingService.findDefaultAppointmentsCalendar(organizationId);
      const calendarId = slot.calendar_id ?? linkedCalendar?.id ?? defaultCalendar?.id;
      if (!calendarId) {
        throw new BadRequestException('booking.calendar_id is required for this service');
      }
      booking = await this.validateAndNormalizeBooking(organizationId, {
        calendar_id: calendarId,
        title: slot.title?.trim() || service.name,
        starts_at: slot.starts_at,
        duration_minutes: Number(slot.duration_minutes),
        timezone: slot.timezone,
      });
    }

    const baseUrl = this.config.get<string>('webhooks.baseUrl', 'http://localhost:3001');

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: settings.currency,
            product_data: {
              name: service.name,
              description: service.description ?? undefined,
            },
            unit_amount: service.amount,
          },
          quantity: 1,
        },
      ],
      customer_email: contact.email ?? undefined,
      success_url: `${baseUrl}/api/v1/payments/return?status=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/api/v1/payments/return?status=canceled`,
      metadata: {
        organization_id: organizationId,
        contact_id: contact.id,
        service_id: service.id,
        ...(dto.appointment_id ? { appointment_id: dto.appointment_id } : {}),
        ...(booking
          ? {
              booking_calendar_id: booking.calendar_id,
              booking_starts_at: booking.starts_at,
              booking_duration_minutes: String(booking.duration_minutes),
              booking_title: booking.title.slice(0, 450),
            }
          : {}),
      },
    });

    const payment = await this.paymentRepo.save(
      this.paymentRepo.create({
        organization_id: organizationId,
        service_id: service.id,
        contact_id: contact.id,
        conversation_id: dto.conversation_id ?? null,
        appointment_id: dto.appointment_id ?? null,
        amount: service.amount,
        currency: settings.currency,
        status: 'pending',
        stripe_checkout_session_id: session.id,
        checkout_url: session.url,
        metadata: booking ? { booking } : {},
      }),
    );

    return {
      payment_id: payment.id,
      url: session.url as string,
      amount: service.amount,
      currency: settings.currency,
      service_name: service.name,
      appointment_id: payment.appointment_id,
      booking,
    };
  }

  /** Verifies the raw webhook body against the ORG's own webhook signing secret. */
  async verifyWebhookSignature(
    organizationId: string,
    payload: Buffer,
    signature: string,
  ): Promise<Stripe.Event> {
    const settings = await this.settingsService.getRaw(organizationId);
    if (!settings.stripe_secret_key || !settings.stripe_webhook_secret) {
      throw new BadRequestException('Stripe no está configurado para esta organización');
    }
    const stripe = new Stripe(settings.stripe_secret_key);
    return stripe.webhooks.constructEvent(payload, signature, settings.stripe_webhook_secret);
  }

  /** Processes a verified Stripe event. Idempotent — safe to receive the same event twice. */
  async handleWebhookEvent(organizationId: string, event: Stripe.Event): Promise<void> {
    switch (event.type) {
      case 'checkout.session.completed':
        await this.handleCheckoutCompleted(organizationId, event.data.object as Stripe.Checkout.Session);
        break;
      case 'checkout.session.expired':
        await this.handleCheckoutExpired(event.data.object as Stripe.Checkout.Session);
        break;
      default:
        this.logger.debug(`Ignoring unhandled Stripe event type: ${event.type}`);
    }
  }

  private async handleCheckoutCompleted(
    organizationId: string,
    session: Stripe.Checkout.Session,
  ): Promise<void> {
    const payment = await this.paymentRepo.findOne({
      where: { stripe_checkout_session_id: session.id, organization_id: organizationId },
      relations: ['service'],
    });

    if (!payment) {
      this.logger.warn(`No payment found for Stripe session ${session.id} (org ${organizationId})`);
      return;
    }

    if (payment.status === 'paid') {
      return; // Already processed — Stripe retries webhooks.
    }

    payment.status = 'paid';
    payment.paid_at = new Date();
    payment.stripe_payment_intent_id =
      typeof session.payment_intent === 'string' ? session.payment_intent : (session.payment_intent?.id ?? null);

    // Preferred path: create the appointment from the booking draft stored at link time.
    // Legacy path: confirm an appointment that was created before the payment.
    let appointmentConfirmed = false;
    let booking =
      this.readBooking(payment.metadata) ?? this.readBookingFromStripeMetadata(session.metadata);

    if (!payment.appointment_id && booking) {
      try {
        const created = await this.schedulingService.createConfirmedFromPayment(organizationId, {
          calendar_id: booking.calendar_id,
          contact_id: payment.contact_id,
          conversation_id: payment.conversation_id,
          title: booking.title,
          starts_at: booking.starts_at,
          duration_minutes: booking.duration_minutes,
          timezone: booking.timezone,
          payment_id: payment.id,
        });
        payment.appointment_id = created.id;
        appointmentConfirmed = true;
        payment.metadata = { ...(payment.metadata ?? {}), booking };
      } catch (err) {
        this.logger.error(
          `Failed to create appointment from booking for payment ${payment.id}: ${(err as Error).message}`,
          (err as Error).stack,
        );
      }
    } else if (payment.appointment_id) {
      appointmentConfirmed = await this.schedulingService.confirmAfterPayment(
        organizationId,
        payment.appointment_id,
      );
    } else {
      this.logger.warn(
        `Payment ${payment.id} paid without booking metadata — no appointment created.`,
      );
    }

    await this.paymentRepo.save(payment);

    const paymentPayload = {
      // Intentionally NOT a user utterance. n8n often feeds data.message to the LLM —
      // this must read as a system confirmation instruction, not "the user said they paid".
      source: 'system',
      payment_status: 'completed',
      message: this.buildPaymentCompletedMessage({
        serviceName: payment.service?.name ?? null,
        amount: payment.amount,
        currency: payment.currency,
        appointmentConfirmed,
        booking,
        appointmentId: payment.appointment_id,
      }),
      payment_id: payment.id,
      contact_id: payment.contact_id,
      conversation_id: payment.conversation_id,
      amount: payment.amount,
      currency: payment.currency,
      service_id: payment.service_id,
      service_name: payment.service?.name ?? null,
      appointment_id: payment.appointment_id,
      appointment_confirmed: appointmentConfirmed,
      checkout_session_id: session.id,
      ...(booking ? { booking } : {}),
    };

    this.rmqClient.emit(RABBITMQ_QUEUES.PAYMENT_COMPLETED, {
      organization_id: organizationId,
      ...paymentPayload,
    });

    void this.webhookDispatcher?.dispatch('payment.received', organizationId, paymentPayload);

    void this.agentQueue?.add(
      'trigger',
      {
        event_type: 'payment.received',
        organization_id: organizationId,
        conversation_id: payment.conversation_id ?? undefined,
        contact_id: payment.contact_id,
        payload: paymentPayload,
      },
      { attempts: 3, backoff: { type: 'exponential', delay: 2000 } },
    );
  }

  private async validateAndNormalizeBooking(
    organizationId: string,
    booking: Required<Pick<PaymentBookingDto, 'calendar_id' | 'title' | 'starts_at' | 'duration_minutes'>> &
      Pick<PaymentBookingDto, 'timezone'>,
  ): Promise<PaymentBookingIntent> {
    const calendar = await this.calendarRepo.findOne({
      where: { id: booking.calendar_id, organization_id: organizationId },
    });
    if (!calendar) {
      throw new NotFoundException(`Calendar ${booking.calendar_id} not found`);
    }
    if (calendar.type !== 'appointments') {
      throw new BadRequestException('booking.calendar_id must be an appointments calendar');
    }

    const startsAt = new Date(booking.starts_at);
    if (Number.isNaN(startsAt.getTime())) {
      throw new BadRequestException(`Invalid booking.starts_at: ${booking.starts_at}`);
    }
    if (startsAt.getTime() < Date.now() - 60_000) {
      throw new BadRequestException('booking.starts_at must be in the future');
    }
    if (booking.duration_minutes < 1) {
      throw new BadRequestException('booking.duration_minutes must be at least 1');
    }

    return {
      calendar_id: booking.calendar_id,
      title: booking.title.trim(),
      starts_at: startsAt.toISOString(),
      duration_minutes: booking.duration_minutes,
      ...(booking.timezone ? { timezone: booking.timezone } : {}),
    };
  }

  private readBooking(metadata: Record<string, unknown> | null | undefined): PaymentBookingIntent | null {
    const raw = metadata?.booking;
    if (!raw || typeof raw !== 'object') return null;
    const booking = raw as Record<string, unknown>;
    const duration = Number(booking.duration_minutes);
    if (
      typeof booking.calendar_id !== 'string' ||
      typeof booking.title !== 'string' ||
      typeof booking.starts_at !== 'string' ||
      !Number.isFinite(duration) ||
      duration < 1
    ) {
      return null;
    }
    return {
      calendar_id: booking.calendar_id,
      title: booking.title,
      starts_at: booking.starts_at,
      duration_minutes: duration,
      ...(typeof booking.timezone === 'string' ? { timezone: booking.timezone } : {}),
    };
  }

  /** Fallback when payment.metadata.booking is missing but Stripe session still has the draft. */
  private readBookingFromStripeMetadata(
    metadata: Stripe.Metadata | null | undefined,
  ): PaymentBookingIntent | null {
    if (!metadata?.booking_calendar_id || !metadata.booking_starts_at) return null;
    const duration = Number(metadata.booking_duration_minutes);
    if (!Number.isFinite(duration) || duration < 1) return null;
    return {
      calendar_id: metadata.booking_calendar_id,
      title: metadata.booking_title || 'Appointment',
      starts_at: metadata.booking_starts_at,
      duration_minutes: duration,
    };
  }

  private buildPaymentCompletedMessage(args: {
    serviceName: string | null;
    amount: number;
    currency: string;
    appointmentConfirmed: boolean;
    booking: PaymentBookingIntent | null;
    appointmentId: string | null;
  }): string {
    const amountLabel = `${(args.amount / 100).toFixed(2)} ${args.currency.toUpperCase()}`;
    const service = args.serviceName ? ` (${args.serviceName})` : '';

    if (args.appointmentConfirmed && args.booking) {
      return (
        `Pago confirmado${service} (${amountLabel}). ` +
        `Cita agendada: "${args.booking.title}" el ${args.booking.starts_at}` +
        (args.appointmentId ? ` (appointment_id=${args.appointmentId})` : '') +
        '.'
      );
    }

    return (
      `Pago confirmado${service} (${amountLabel}). ` +
      (args.booking
        ? `Había intención de cita "${args.booking.title}" para ${args.booking.starts_at}, pero no se pudo crear en el calendario.`
        : 'No se creó cita: el link no incluía el slot.')
    );
  }

  private async handleCheckoutExpired(session: Stripe.Checkout.Session): Promise<void> {
    const payment = await this.paymentRepo.findOne({
      where: { stripe_checkout_session_id: session.id },
      relations: ['service'],
    });
    if (!payment || payment.status !== 'pending') return;

    payment.status = 'expired';
    await this.paymentRepo.save(payment);

    const booking = this.readBooking(payment.metadata);

    const expiredPayload = {
      source: 'system',
      payment_status: 'expired',
      message: 'El link de pago expiró. La cita no se agendó.',
      payment_id: payment.id,
      contact_id: payment.contact_id,
      conversation_id: payment.conversation_id,
      amount: payment.amount,
      currency: payment.currency,
      service_id: payment.service_id,
      service_name: payment.service?.name ?? null,
      appointment_id: payment.appointment_id,
      ...(booking ? { booking } : {}),
    };

    this.rmqClient.emit(RABBITMQ_QUEUES.PAYMENT_EXPIRED, {
      organization_id: payment.organization_id,
      ...expiredPayload,
    });

    // No appointment is created on expire — the booking draft dies with the link.
    void this.webhookDispatcher?.dispatch('payment.expired', payment.organization_id, expiredPayload);

    void this.agentQueue?.add(
      'trigger',
      {
        event_type: 'payment.expired',
        organization_id: payment.organization_id,
        conversation_id: payment.conversation_id ?? undefined,
        contact_id: payment.contact_id,
        payload: expiredPayload,
      },
      { attempts: 3, backoff: { type: 'exponential', delay: 2000 } },
    );
  }
}
