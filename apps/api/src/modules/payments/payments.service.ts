import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import type { Queue } from 'bullmq';
import Stripe from 'stripe';
import { AppointmentStatus, PaymentAttentionReason, PaymentResolution } from '@crm/shared';
import { PaymentEntity } from './entities/payment.entity';
import { ContactEntity } from '../client-management/contact.entity';
import { AppointmentEntity } from '../scheduling/appointment.entity';
import { UserEntity } from '../users/user.entity';
import { PaymentSettingsService } from './payment-settings.service';
import { PaymentServiceService } from './payment-service.service';
import { PaymentBookingOutcome, SchedulingService } from '../scheduling/scheduling.service';
import { CalendarService } from '../scheduling/calendar.service';
import { isValidTimeZone } from '../scheduling/domain/timezone';
import { WebhookDispatcherService } from '../integrations/webhook-dispatcher.service';
import { RealtimeBroadcastService } from '../../infrastructure/realtime/realtime-broadcast.service';
import { MailService } from '../../infrastructure/mail/mail.service';
import { NOTIFICATION_TEMPLATES, emailFromTemplate, webAppUrl } from '../../infrastructure/messaging';
import { OutboxService } from '../../infrastructure/outbox/outbox.service';
import { RABBITMQ_QUEUES } from '../../infrastructure/rabbitmq/rabbitmq.constants';
import { AGENT_TRIGGER_QUEUE } from '../ai-automation/ai-automation.constants';
import type { CreatePaymentDto, ResolvePaymentDto } from './dto/create-payment.dto';

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
  /** The slot is reserved until then; unpaid, it is released. */
  hold_expires_at: string | null;
}

/** Who asked for the link: the AI agent, an API key integration or a staff member. */
export interface PaymentLinkRequester {
  origin: 'ai' | 'human' | 'webhook';
  userId?: string | null;
}

const AI_REQUESTER: PaymentLinkRequester = { origin: 'ai' };

/** Stripe Checkout sessions must expire between 30 minutes and 24 hours after creation. */
const STRIPE_MIN_EXPIRY_MS = 31 * 60_000;
const STRIPE_MAX_EXPIRY_MS = 23 * 3_600_000 + 59 * 60_000;

interface CompletionResult {
  payment: PaymentEntity;
  booking: PaymentBookingIntent | null;
  appointmentConfirmed: boolean;
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
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    private readonly settingsService: PaymentSettingsService,
    private readonly paymentServiceService: PaymentServiceService,
    private readonly schedulingService: SchedulingService,
    private readonly calendarService: CalendarService,
    private readonly config: ConfigService,
    private readonly outbox: OutboxService,
    @Optional() @Inject(AGENT_TRIGGER_QUEUE)
    private readonly agentQueue?: Queue,
    @Optional() private readonly webhookDispatcher?: WebhookDispatcherService,
    @Optional() private readonly realtime?: RealtimeBroadcastService,
    @Optional() private readonly mailService?: MailService,
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

  /** Paid payments a person has to look at (slot lost, paid booking cancelled). */
  async findNeedingAttention(organizationId: string): Promise<PaymentEntity[]> {
    return this.paymentRepo
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.service', 'service')
      .leftJoinAndSelect('p.contact', 'contact')
      .where('p.organization_id = :orgId', { orgId: organizationId })
      .andWhere('p.attention_reason IS NOT NULL AND p.resolved_at IS NULL')
      .orderBy('p.attention_at', 'ASC')
      .getMany();
  }

  /**
   * Creates a Stripe Checkout Session on the ORG'S OWN Stripe account. With a
   * `booking`, the slot is reserved first (status `held`) so nobody else can
   * take it while the contact pays; the checkout expires together with the
   * hold. Called by the `create_payment_link` agent tool and by staff.
   */
  async createCheckoutLink(
    organizationId: string,
    dto: CreatePaymentDto,
    requester: PaymentLinkRequester = AI_REQUESTER,
  ): Promise<PaymentLinkResult> {
    const [stripe, settings, service, contact] = await Promise.all([
      this.settingsService.getStripeClient(organizationId),
      this.settingsService.getRaw(organizationId),
      this.paymentServiceService.findById(dto.service_id, organizationId),
      this.contactRepo.findOne({ where: { id: dto.contact_id, organization_id: organizationId } }),
    ]);

    if (!contact) throw new NotFoundException(`Contact ${dto.contact_id} not found`);
    if (!service.is_active) throw new BadRequestException(`Service '${service.name}' is not active`);

    const slot = dto.booking;
    const hasSlot = !!(slot?.starts_at && slot.duration_minutes);
    if (hasSlot && dto.appointment_id) {
      throw new BadRequestException('Send either booking or appointment_id, not both');
    }

    if (dto.appointment_id) await this.assertPayableAppointment(organizationId, dto.appointment_id, dto.contact_id);

    const linkedCalendar = await this.calendarService.findAppointmentsCalendarForPaymentService(
      organizationId,
      service.id,
    );
    if (linkedCalendar && !hasSlot && !dto.appointment_id) {
      throw new BadRequestException('booking required for this service');
    }

    let booking: PaymentBookingIntent | null = null;
    let hold: AppointmentEntity | null = null;
    if (hasSlot && slot) {
      booking = await this.resolveBooking(organizationId, service.id, service.name, slot, linkedCalendar?.id);
      hold = await this.schedulingService.createHold(organizationId, {
        calendarId: booking.calendar_id,
        contactId: contact.id,
        conversationId: dto.conversation_id ?? null,
        title: booking.title,
        startsAt: new Date(booking.starts_at),
        durationMinutes: booking.duration_minutes,
        timezone: booking.timezone,
        origin: requester.origin,
        createdBy: requester.userId ?? null,
      });
    }

    const appointmentId = hold?.id ?? dto.appointment_id ?? null;
    const expiresAt = hold?.hold_expires_at ? this.checkoutExpiry(hold.hold_expires_at) : null;
    const baseUrl = this.config.get<string>('webhooks.baseUrl', 'http://localhost:3001');

    let session: Stripe.Checkout.Session;
    try {
      session = await stripe.checkout.sessions.create({
        mode: 'payment',
        // Cards settle immediately; delayed methods could be paid after the hold ends.
        payment_method_types: ['card'],
        ...(expiresAt ? { expires_at: Math.floor(expiresAt.getTime() / 1000) } : {}),
        line_items: [
          {
            price_data: {
              currency: settings.currency,
              product_data: { name: service.name, description: service.description ?? undefined },
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
          ...(appointmentId ? { appointment_id: appointmentId } : {}),
          ...(booking
            ? {
                booking_calendar_id: booking.calendar_id,
                booking_starts_at: booking.starts_at,
                booking_duration_minutes: String(booking.duration_minutes),
                booking_title: booking.title.slice(0, 450),
                ...(booking.timezone ? { booking_timezone: booking.timezone } : {}),
              }
            : {}),
        },
      });
    } catch (err) {
      if (hold) await this.schedulingService.releaseHold(organizationId, hold.id);
      throw err;
    }

    const payment = await this.paymentRepo.save(
      this.paymentRepo.create({
        organization_id: organizationId,
        service_id: service.id,
        contact_id: contact.id,
        contact_name: [contact.first_name, contact.last_name].filter(Boolean).join(' ') || null,
        contact_email: contact.email ?? null,
        conversation_id: dto.conversation_id ?? null,
        appointment_id: appointmentId,
        amount: service.amount,
        currency: settings.currency,
        status: 'pending',
        stripe_checkout_session_id: session.id,
        checkout_url: session.url,
        metadata: booking ? { booking } : {},
      }),
    );
    if (hold) await this.schedulingService.attachPayment(organizationId, hold.id, payment.id, expiresAt);

    return {
      payment_id: payment.id,
      url: session.url as string,
      amount: service.amount,
      currency: settings.currency,
      service_name: service.name,
      appointment_id: payment.appointment_id,
      booking,
      hold_expires_at: expiresAt?.toISOString() ?? null,
    };
  }

  /** Verifies the raw webhook body against the ORG's own webhook signing secret. */
  async verifyWebhookSignature(organizationId: string, payload: Buffer, signature: string): Promise<Stripe.Event> {
    const settings = await this.settingsService.getRaw(organizationId);
    if (!settings.stripe_secret_key || !settings.stripe_webhook_secret) {
      throw new BadRequestException('Stripe is not configured for this organization');
    }
    const stripe = new Stripe(settings.stripe_secret_key);
    return stripe.webhooks.constructEvent(payload, signature, settings.stripe_webhook_secret);
  }

  /** Processes a verified Stripe event. Idempotent — safe to receive the same event twice. */
  async handleWebhookEvent(organizationId: string, event: Stripe.Event): Promise<void> {
    const session = event.data.object as Stripe.Checkout.Session;
    switch (event.type) {
      case 'checkout.session.completed':
        // Delayed payment methods complete the checkout before the money arrives.
        if (session.payment_status === 'paid' || session.payment_status === 'no_payment_required') {
          await this.handlePaid(organizationId, session);
        } else {
          await this.recordPaymentIntent(organizationId, session);
        }
        break;
      case 'checkout.session.async_payment_succeeded':
        await this.handlePaid(organizationId, session);
        break;
      case 'checkout.session.async_payment_failed':
        await this.handleNotPaid(organizationId, session, 'failed');
        break;
      case 'checkout.session.expired':
        await this.handleNotPaid(organizationId, session, 'expired');
        break;
      default:
        this.logger.debug(`Ignoring unhandled Stripe event type: ${event.type}`);
    }
  }

  /** Closes a "needs attention" payment (manual follow-up; nothing is refunded automatically). */
  async resolveAttention(
    organizationId: string,
    paymentId: string,
    dto: ResolvePaymentDto,
    userId: string | null,
  ): Promise<PaymentEntity> {
    return this.schedulingService.inTransaction(async (tx) => {
      const payments = tx.manager.getRepository(PaymentEntity);
      const payment = await payments
        .createQueryBuilder('p')
        .setLock('pessimistic_write')
        .where('p.id = :id AND p.organization_id = :orgId', { id: paymentId, orgId: organizationId })
        .getOne();
      if (!payment) throw new NotFoundException(`Payment ${paymentId} not found`);
      if (!payment.attention_reason || payment.resolved_at) {
        throw new ConflictException('This payment does not need attention');
      }

      if (dto.resolution === PaymentResolution.REBOOKED) {
        if (!dto.appointment_id) throw new BadRequestException('appointment_id is required to mark it rebooked');
        const appt = await tx.manager.getRepository(AppointmentEntity).findOne({
          where: { id: dto.appointment_id, organization_id: organizationId },
        });
        if (!appt) throw new NotFoundException(`Appointment ${dto.appointment_id} not found`);
        if (payment.contact_id && appt.contact_id !== payment.contact_id) {
          throw new BadRequestException('The appointment belongs to another contact');
        }
        if (appt.payment_id && appt.payment_id !== payment.id) {
          throw new ConflictException('That appointment is already linked to another payment');
        }
        // The payment now covers this appointment, not the released hold it was created for.
        await tx.manager
          .getRepository(AppointmentEntity)
          .createQueryBuilder()
          .update(AppointmentEntity)
          .set({ payment_id: null })
          .where('payment_id = :paymentId AND id <> :id', { paymentId: payment.id, id: appt.id })
          .execute();
        const outcome = await this.schedulingService.confirmFromPayment(tx, organizationId, appt.id, payment.id);
        if (outcome.outcome !== 'confirmed' && outcome.outcome !== 'already_confirmed') {
          throw new ConflictException(`That appointment cannot take this payment (${outcome.outcome})`);
        }
        payment.appointment_id = appt.id;
      } else if (dto.resolution === PaymentResolution.REFUNDED_MANUALLY) {
        payment.status = 'refunded';
      }

      payment.resolution = dto.resolution;
      payment.resolution_note = dto.note ?? null;
      payment.resolved_at = new Date();
      payment.resolved_by = userId;
      return payments.save(payment);
    });
  }

  // ── Internals ─────────────────────────────────────────────────────────

  private async handlePaid(organizationId: string, session: Stripe.Checkout.Session): Promise<void> {
    const result = await this.schedulingService.inTransaction<(CompletionResult & { payload: Record<string, unknown> }) | null>(async (tx) => {
      const payments = tx.manager.getRepository(PaymentEntity);
      const payment = await payments
        .createQueryBuilder('p')
        .leftJoinAndSelect('p.service', 'service')
        .setLock('pessimistic_write', undefined, ['p'])
        .where('p.stripe_checkout_session_id = :sid AND p.organization_id = :orgId', {
          sid: session.id,
          orgId: organizationId,
        })
        .getOne();

      if (!payment) {
        this.logger.warn(`No payment found for Stripe session ${session.id} (org ${organizationId})`);
        return null;
      }
      if (payment.status === 'paid' || payment.status === 'refunded') return null; // Stripe retries webhooks.

      payment.status = 'paid';
      payment.paid_at = new Date();
      payment.stripe_payment_intent_id =
        typeof session.payment_intent === 'string' ? session.payment_intent : (session.payment_intent?.id ?? null);

      const booking = this.readBooking(payment.metadata) ?? this.readBookingFromStripeMetadata(session.metadata);
      let outcome: PaymentBookingOutcome | null = null;

      if (payment.appointment_id) {
        outcome = await this.schedulingService.confirmFromPayment(tx, organizationId, payment.appointment_id, payment.id);
      } else if (booking) {
        // Links created before slots were held: the booking only lives in metadata.
        try {
          outcome = await this.schedulingService.createConfirmedFromPayment(tx, organizationId, {
            calendarId: booking.calendar_id,
            contactId: payment.contact_id ?? '',
            conversationId: payment.conversation_id,
            title: booking.title,
            startsAt: new Date(booking.starts_at),
            durationMinutes: booking.duration_minutes,
            timezone: booking.timezone,
            paymentId: payment.id,
          });
        } catch (err) {
          if (err instanceof QueryFailedError) throw err;
          this.logger.error(`Booking from payment ${payment.id} failed: ${(err as Error).message}`);
          outcome = { outcome: 'not_found' };
        }
        if (outcome.outcome === 'confirmed') payment.appointment_id = outcome.appointment.id;
      } else {
        this.logger.warn(`Payment ${payment.id} paid without booking metadata — no appointment created.`);
      }

      const attention = this.attentionFor(outcome);
      if (attention) {
        payment.attention_reason = attention;
        payment.attention_at = new Date();
      }

      await payments.save(payment);
      const completion: CompletionResult = {
        payment,
        booking,
        appointmentConfirmed: outcome?.outcome === 'confirmed' || outcome?.outcome === 'already_confirmed',
      };
      // Stored with the payment itself: a broker outage cannot lose it.
      const payload = this.paidPayload(session.id, completion);
      await this.outbox.add(tx.manager, RABBITMQ_QUEUES.PAYMENT_COMPLETED, { organization_id: organizationId, ...payload });
      tx.afterCommit(() => this.outbox.kick());
      return { ...completion, payload };
    });

    if (!result) return;
    if (result.payment.attention_reason) void this.notifyAttention(result.payment);
    void this.webhookDispatcher?.dispatch('payment.received', organizationId, result.payload);
    this.triggerAgent('payment.received', organizationId, result.payment, result.payload);
  }

  private attentionFor(outcome: PaymentBookingOutcome | null): PaymentAttentionReason | null {
    switch (outcome?.outcome) {
      case 'slot_unavailable':
        return PaymentAttentionReason.SLOT_UNAVAILABLE;
      case 'appointment_cancelled':
        return PaymentAttentionReason.APPOINTMENT_CANCELLED;
      case 'not_found':
        return PaymentAttentionReason.BOOKING_FAILED;
      default:
        return null;
    }
  }

  private paidPayload(sessionId: string, result: CompletionResult): Record<string, unknown> {
    const { payment, booking, appointmentConfirmed } = result;
    return {
      // Intentionally NOT a user utterance. n8n often feeds data.message to the LLM —
      // this must read as a system confirmation instruction, not "the user said they paid".
      source: 'system',
      payment_status: 'completed',
      message: this.buildPaymentCompletedMessage({
        serviceName: payment.service?.name ?? null,
        amount: payment.amount,
        currency: payment.currency,
        appointmentConfirmed,
        needsAttention: !!payment.attention_reason,
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
      needs_attention: !!payment.attention_reason,
      checkout_session_id: sessionId,
      ...(booking ? { booking } : {}),
    };
  }

  private async recordPaymentIntent(organizationId: string, session: Stripe.Checkout.Session): Promise<void> {
    const intent = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id;
    if (!intent) return;
    await this.paymentRepo.update(
      { stripe_checkout_session_id: session.id, organization_id: organizationId },
      { stripe_payment_intent_id: intent },
    );
  }

  private async handleNotPaid(
    organizationId: string,
    session: Stripe.Checkout.Session,
    status: 'expired' | 'failed',
  ): Promise<void> {
    const payment = await this.paymentRepo.findOne({
      where: { stripe_checkout_session_id: session.id, organization_id: organizationId },
      relations: ['service'],
    });
    if (!payment || payment.status !== 'pending') return;

    payment.status = status;
    await this.paymentRepo.save(payment);
    if (payment.appointment_id) await this.schedulingService.releaseHold(organizationId, payment.appointment_id);

    const booking = this.readBooking(payment.metadata);
    const payload = {
      source: 'system',
      payment_status: status,
      message:
        status === 'expired'
          ? 'The payment link expired. The appointment was not booked and the time slot was released.'
          : 'The payment was not completed. The appointment was not booked and the time slot was released.',
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

    await this.outbox.publish(RABBITMQ_QUEUES.PAYMENT_EXPIRED, { organization_id: organizationId, ...payload });
    void this.webhookDispatcher?.dispatch(`payment.${status}`, organizationId, payload);
    this.triggerAgent(`payment.${status}`, organizationId, payment, payload);
  }

  private triggerAgent(
    eventType: string,
    organizationId: string,
    payment: PaymentEntity,
    payload: Record<string, unknown>,
  ): void {
    void this.agentQueue
      ?.add(
        'trigger',
        {
          event_type: eventType,
          organization_id: organizationId,
          conversation_id: payment.conversation_id ?? undefined,
          contact_id: payment.contact_id,
          payload,
        },
        { attempts: 3, backoff: { type: 'exponential', delay: 2000 } },
      )
      .catch((err: Error) => this.logger.warn(`Could not enqueue agent trigger: ${err.message}`));
  }

  /** In-app notification plus an email to owners/admins. Best effort. */
  private async notifyAttention(payment: PaymentEntity): Promise<void> {
    const reason = (payment.attention_reason ?? '').replace(/_/g, ' ');
    const who = payment.contact_name ?? 'a contact';
    try {
      await this.realtime?.notifyOrg(payment.organization_id, {
        type: 'system',
        title: NOTIFICATION_TEMPLATES.payment_needs_review,
        description: `${who}: ${reason}`,
        href: '/payments?tab=attention',
        contactId: payment.contact_id ?? undefined,
      });
      if (!this.mailService) return;
      const admins = await this.userRepo.find({
        where: [
          { organization_id: payment.organization_id, role: 'owner', is_active: true },
          { organization_id: payment.organization_id, role: 'admin', is_active: true },
        ],
        select: ['id', 'email', 'full_name'],
      });
      const amount = `${(payment.amount / 100).toFixed(2)} ${payment.currency.toUpperCase()}`;
      const reviewUrl = `${webAppUrl(this.config)}/payments?tab=attention`;
      for (const admin of admins) {
        await this.mailService.send({
          to: admin.email,
          ...emailFromTemplate('payment_needs_review', {
            user_name: admin.full_name,
            amount,
            payer_name: who,
            reason,
            review_url: reviewUrl,
          }),
        });
      }
    } catch (err) {
      this.logger.warn(`Could not notify attention for payment ${payment.id}: ${(err as Error).message}`);
    }
  }

  /** Stripe needs 30 min – 24 h; the hold is stretched to match the checkout. */
  private checkoutExpiry(holdExpiresAt: Date): Date {
    const now = Date.now();
    const ms = Math.min(Math.max(holdExpiresAt.getTime(), now + STRIPE_MIN_EXPIRY_MS), now + STRIPE_MAX_EXPIRY_MS);
    return new Date(ms);
  }

  private async assertPayableAppointment(organizationId: string, appointmentId: string, contactId: string): Promise<void> {
    const appointment = await this.appointmentRepo.findOne({
      where: { id: appointmentId, organization_id: organizationId },
    });
    if (!appointment) throw new NotFoundException(`Appointment ${appointmentId} not found`);
    if (appointment.contact_id !== contactId) {
      throw new BadRequestException('appointment_id does not belong to this contact');
    }
    if (appointment.status !== AppointmentStatus.SCHEDULED && appointment.status !== AppointmentStatus.CONFIRMED) {
      throw new ConflictException(`A ${appointment.status} appointment cannot be paid`);
    }
    if (appointment.payment_id) throw new ConflictException('This appointment is already paid');
  }

  /** The calendar must be the one charging this service, or a calendar that charges nothing. */
  private async resolveBooking(
    organizationId: string,
    serviceId: string,
    serviceName: string,
    slot: NonNullable<CreatePaymentDto['booking']>,
    linkedCalendarId?: string,
  ): Promise<PaymentBookingIntent> {
    const defaultCalendar = linkedCalendarId
      ? null
      : await this.calendarService.findDefaultAppointmentsCalendar(organizationId);
    const calendarId = slot.calendar_id ?? linkedCalendarId ?? defaultCalendar?.id;
    if (!calendarId) throw new BadRequestException('booking.calendar_id is required for this service');

    const calendar = await this.calendarService.getCalendarById(organizationId, calendarId);
    if (calendar.type !== 'appointments') {
      throw new BadRequestException('booking.calendar_id must be an appointments calendar');
    }
    if (calendar.payment_service_id && calendar.payment_service_id !== serviceId) {
      throw new BadRequestException('booking.calendar_id charges a different service');
    }
    if (linkedCalendarId && calendar.id !== linkedCalendarId) {
      throw new BadRequestException('This service can only be booked on its own calendar');
    }

    const startsAt = new Date(slot.starts_at);
    if (Number.isNaN(startsAt.getTime())) throw new BadRequestException(`Invalid booking.starts_at: ${slot.starts_at}`);
    if (slot.timezone && !isValidTimeZone(slot.timezone)) {
      throw new BadRequestException(`Invalid booking.timezone: ${slot.timezone}`);
    }

    return {
      calendar_id: calendar.id,
      title: slot.title?.trim() || serviceName,
      starts_at: startsAt.toISOString(),
      duration_minutes: Number(slot.duration_minutes),
      ...(slot.timezone ? { timezone: slot.timezone } : {}),
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
  private readBookingFromStripeMetadata(metadata: Stripe.Metadata | null | undefined): PaymentBookingIntent | null {
    if (!metadata?.booking_calendar_id || !metadata.booking_starts_at) return null;
    const duration = Number(metadata.booking_duration_minutes);
    if (!Number.isFinite(duration) || duration < 1) return null;
    return {
      calendar_id: metadata.booking_calendar_id,
      title: metadata.booking_title || 'Appointment',
      starts_at: metadata.booking_starts_at,
      duration_minutes: duration,
      ...(metadata.booking_timezone ? { timezone: metadata.booking_timezone } : {}),
    };
  }

  private buildPaymentCompletedMessage(args: {
    serviceName: string | null;
    amount: number;
    currency: string;
    appointmentConfirmed: boolean;
    needsAttention: boolean;
    booking: PaymentBookingIntent | null;
    appointmentId: string | null;
  }): string {
    const amountLabel = `${(args.amount / 100).toFixed(2)} ${args.currency.toUpperCase()}`;
    const service = args.serviceName ? ` (${args.serviceName})` : '';

    if (args.appointmentConfirmed) {
      const title = args.booking?.title ?? 'the appointment';
      const when = args.booking ? ` on ${args.booking.starts_at}` : '';
      return (
        `Payment confirmed${service} (${amountLabel}). Appointment confirmed: "${title}"${when}` +
        (args.appointmentId ? ` (appointment_id=${args.appointmentId})` : '') +
        '.'
      );
    }
    if (args.needsAttention) {
      return (
        `Payment confirmed${service} (${amountLabel}), but that time slot was no longer available. ` +
        'The team will review the case and contact the customer to reschedule; do not promise a new time or a refund.'
      );
    }
    return `Payment confirmed${service} (${amountLabel}). No appointment was created: the link did not include a time slot.`;
  }
}
