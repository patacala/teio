import { BadRequestException, Injectable, Logger, NotFoundException, Inject, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClientProxy } from '@nestjs/microservices';
import { AgentToolExecutionEntity } from './entities/agent-tool-execution.entity';
import { AgentTriggerService } from './agent-trigger.service';
import { ConversationManagementService } from '../conversation-management/conversation-management.service';
import { ClientManagementService } from '../client-management/client-management.service';
import { SchedulingService } from '../scheduling/scheduling.service';
import { AvailabilityService } from '../scheduling/availability.service';
import { CalendarService } from '../scheduling/calendar.service';
import { AI_ACTOR } from '../scheduling/scheduling.types';
import { isValidTimeZone, localDate, localMinutes } from '../scheduling/domain/timezone';
import { AutomationSequenceService } from '../automation-engine/automation-sequence.service';
import { ScheduledActionService } from '../automation-engine/scheduled-action.service';
import { PaymentsService } from '../payments/payments.service';
import { PaymentServiceService } from '../payments/payment-service.service';
import { PaymentSettingsService } from '../payments/payment-settings.service';
import { RABBITMQ_SERVICE, RABBITMQ_QUEUES } from '../../infrastructure/rabbitmq/rabbitmq.constants';
import { MailService } from '../../infrastructure/mail/mail.service';
import { emailFromTemplate } from '../../infrastructure/messaging';
import { SmsService } from '../../infrastructure/sms/sms.service';
import type {
  CreateContactDto,
  UpdateContactDto,
} from '../client-management/client-management.service';
import type { CreateSequenceInput } from '@crm/shared';

interface ToolContext {
  orgId: string;
  conversationService: ConversationManagementService;
  clientService: ClientManagementService;
  schedulingService: SchedulingService;
  availabilityService: AvailabilityService;
  calendarService: CalendarService;
  automationSequenceService?: AutomationSequenceService;
  scheduledActionService?: ScheduledActionService;
  paymentsService?: PaymentsService;
  paymentServiceService?: PaymentServiceService;
  paymentSettingsService?: PaymentSettingsService;
  mailService: MailService;
  smsService: SmsService;
  logger: Logger;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MAX_AGENT_EMAIL_SUBJECT = 200;
const MAX_AGENT_EMAIL_BODY = 10_000;
/** 10 SMS segments. */
const MAX_AGENT_SMS = 1_600;

/** A required, non-empty string from the agent's input, trimmed and length-capped. */
function requireText(input: Record<string, unknown>, key: string, max: number): string {
  const value = input[key];
  if (typeof value !== 'string' || !value.trim()) {
    throw new BadRequestException(`${key} must be a non-empty string`);
  }
  if (value.length > max) {
    throw new BadRequestException(`${key} must be at most ${max} characters`);
  }
  return value.trim();
}

function requireUuid(input: Record<string, unknown>, key: string): string {
  const value = input[key];
  if (typeof value !== 'string' || !UUID_RE.test(value)) throw new BadRequestException(`${key} must be a UUID`);
  return value;
}

function optionalUuid(input: Record<string, unknown>, key: string): string | undefined {
  return input[key] === undefined || input[key] === null || input[key] === '' ? undefined : requireUuid(input, key);
}

/** The agent may only touch the appointments of the contact it is talking to. */
async function assertAppointmentOfContact(ctx: ToolContext, appointmentId: string, contactId?: string): Promise<void> {
  const appointment = await ctx.schedulingService.findById(appointmentId, ctx.orgId);
  if (contactId && appointment.contact_id !== contactId) {
    throw new NotFoundException(`Appointment ${appointmentId} not found for this contact`);
  }
}

/** 'YYYY-MM-DD HH:MM' on the calendar's wall clock, so the agent never converts time zones itself. */
function formatLocal(instant: Date, timeZone: string): string {
  const minutes = localMinutes(instant, timeZone);
  return `${localDate(instant, timeZone)} ${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

type ToolFn = (input: Record<string, unknown>, ctx: ToolContext) => Promise<unknown>;

const TOOL_REGISTRY = new Map<string, ToolFn>([
  [
    'send_message',
    async (input, ctx) =>
      ctx.conversationService.sendMessage(
        input.conversation_id as string,
        ctx.orgId,
        {
          content: input.content as string,
          type: 'text',
          direction: 'outbound',
        },
      ),
  ],
  [
    'create_contact',
    async (input, ctx) => ctx.clientService.create(ctx.orgId, input as unknown as CreateContactDto),
  ],
  [
    'update_contact',
    async (input, ctx) =>
      ctx.clientService.update(
        input.contact_id as string,
        ctx.orgId,
        input as unknown as UpdateContactDto,
      ),
  ],
  [
    'create_appointment',
    async (input, ctx) => {
      // Same rules as any booking: calendar hours, no overlaps, and on a
      // charging calendar it refuses with 'use create_payment_link'.
      const calendarId = requireUuid(input, 'calendar_id');
      const contactId = requireUuid(input, 'contact_id');
      const startsAt = new Date(String(input.starts_at ?? ''));
      if (Number.isNaN(startsAt.getTime())) throw new BadRequestException('starts_at must be an ISO 8601 datetime');
      const timezone = typeof input.timezone === 'string' && isValidTimeZone(input.timezone) ? input.timezone : undefined;
      const calendar = await ctx.calendarService.getCalendarById(ctx.orgId, calendarId);

      const appointment = await ctx.schedulingService.createBooking(
        ctx.orgId,
        {
          contact_id: contactId,
          calendar_id: calendarId,
          title: String(input.title ?? '').trim() || calendar.name,
          starts_at: startsAt.toISOString(),
          duration_minutes: Number(input.duration_minutes) || calendar.slot_duration_minutes,
          description: typeof input.description === 'string' ? input.description : undefined,
          conversation_id: optionalUuid(input, 'conversation_id'),
          timezone,
        },
        AI_ACTOR,
      );

      // Cancel active sequence when appointment is booked — goal achieved
      if (ctx.automationSequenceService) {
        const active = await ctx.automationSequenceService.findActive(ctx.orgId, contactId);
        if (active) {
          await ctx.automationSequenceService.cancel(ctx.orgId, active.id, 'appointment_booked');
        }
      }

      return {
        id: appointment.id,
        title: appointment.title,
        status: appointment.status,
        starts_at: appointment.starts_at,
        ends_at: appointment.ends_at,
        timezone: appointment.timezone,
        local_start: formatLocal(appointment.starts_at, appointment.timezone),
        note: 'The contact receives a confirmation link by email/SMS; the appointment is confirmed when they use it.',
      };
    },
  ],
  [
    'get_available_slots',
    async (input, ctx) => {
      const from = (input.from ?? input.start_date) as string | undefined;
      const to = (input.to ?? input.end_date ?? from) as string | undefined;
      if (!from || !to) throw new BadRequestException('from and to are required (YYYY-MM-DD)');
      const result = await ctx.availabilityService.getAvailability(ctx.orgId, {
        from,
        to,
        calendar_id: optionalUuid(input, 'calendar_id'),
        duration_minutes: Number(input.duration_minutes) || undefined,
      });
      return {
        calendar_id: result.calendar_id,
        timezone: result.timezone,
        duration_minutes: result.duration_minutes,
        slots: result.slots.map((slot) => ({
          ...slot,
          local_start: formatLocal(new Date(slot.starts_at), result.timezone),
        })),
      };
    },
  ],
  [
    'get_calendars',
    async (_input, ctx) => {
      const calendars = await ctx.calendarService.listCalendars(ctx.orgId);
      const services = ctx.paymentServiceService ? await ctx.paymentServiceService.findAll(ctx.orgId, true) : [];
      const serviceById = new Map(services.map((svc) => [svc.id, svc]));
      return {
        calendars: calendars
          .filter((cal) => cal.is_active !== false && cal.type !== 'follow_up')
          .map((cal) => {
            const service = cal.payment_service_id ? serviceById.get(cal.payment_service_id) : undefined;
            return {
              id: cal.id,
              name: cal.name,
              timezone: cal.timezone,
              slot_duration_minutes: cal.slot_duration_minutes,
              min_notice_minutes: cal.min_notice_minutes,
              max_advance_days: cal.max_advance_days,
              is_default: cal.system_key === 'appointments',
              // A charging calendar is booked with create_payment_link, not create_appointment.
              charges: service ? { service_id: service.id, name: service.name, amount: service.amount } : null,
            };
          }),
      };
    },
  ],
  [
    'cancel_appointment',
    async (input, ctx) => {
      const appointmentId = requireUuid(input, 'appointment_id');
      await assertAppointmentOfContact(ctx, appointmentId, optionalUuid(input, 'contact_id'));
      const cancelled = await ctx.schedulingService.cancel(ctx.orgId, appointmentId, AI_ACTOR, 'contact');
      return { id: cancelled.id, status: cancelled.status, note: 'The contact is notified of the cancellation.' };
    },
  ],
  [
    'reschedule_appointment',
    async (input, ctx) => {
      const appointmentId = requireUuid(input, 'appointment_id');
      await assertAppointmentOfContact(ctx, appointmentId, optionalUuid(input, 'contact_id'));
      const startsAt = new Date(String(input.starts_at ?? ''));
      if (Number.isNaN(startsAt.getTime())) throw new BadRequestException('starts_at must be an ISO 8601 datetime');
      const moved = await ctx.schedulingService.reschedule(
        ctx.orgId,
        appointmentId,
        { starts_at: startsAt.toISOString(), duration_minutes: Number(input.duration_minutes) || undefined },
        AI_ACTOR,
      );
      return {
        id: moved.id,
        status: moved.status,
        starts_at: moved.starts_at,
        ends_at: moved.ends_at,
        timezone: moved.timezone,
        local_start: formatLocal(moved.starts_at, moved.timezone),
        note: 'The contact receives the new time by email/SMS.',
      };
    },
  ],
  [
    'list_payment_services',
    async (_input, ctx) => {
      if (!ctx.paymentServiceService) throw new Error('PaymentServiceService not available');
      const settings = ctx.paymentSettingsService
        ? await ctx.paymentSettingsService.getRaw(ctx.orgId)
        : null;
      const services = await ctx.paymentServiceService.findAll(ctx.orgId, true);
      return {
        currency: settings?.currency ?? 'usd',
        services: services.map((s) => ({
          id: s.id,
          name: s.name,
          description: s.description,
          amount: s.amount,
        })),
      };
    },
  ],
  [
    'add_contact_note',
    async (input, ctx) =>
      ctx.clientService.update(input.contact_id as string, ctx.orgId, {
        custom_fields: { note: input.note, noted_at: new Date().toISOString() },
      }),
  ],
  [
    'get_contact_appointments',
    async (input, ctx) => {
      const appointments = await ctx.schedulingService.findUpcomingForContact(
        ctx.orgId,
        input.contact_id as string,
        (input.limit as number) ?? 5,
      );
      return appointments.map((a) => ({
        id: a.id,
        calendar_id: a.calendar_id,
        title: a.title,
        starts_at: a.starts_at,
        ends_at: a.ends_at,
        timezone: a.timezone,
        local_start: formatLocal(a.starts_at, a.timezone),
        status: a.status,
        location: a.location,
        meeting_url: a.meeting_url,
      }));
    },
  ],
  [
    'get_conversation_history',
    async (input, ctx) => {
      const contactId = input.contact_id as string;
      const limit = (input.limit as number) ?? 20;
      const conversations = await ctx.conversationService.findByContactId(ctx.orgId, contactId);
      if (!conversations.length) return { messages: [] };

      const convId = (input.conversation_id as string) ?? conversations[0].id;
      const { items } = await ctx.conversationService.getMessages(convId, ctx.orgId);
      const messages = items.slice(0, limit).map((m: any) => ({
        direction: m.direction,
        content: m.content,
        sent_at: m.sent_at ?? m.created_at,
        sender_type: m.sender_type ?? m.direction,
      }));
      return { messages };
    },
  ],
  [
    'complete_follow_up',
    async (input, ctx) => {
      // n8n sends the step id as appointment_id (kept for existing workflows) or action_id.
      const stepId = requireUuid({ id: input.action_id ?? input.appointment_id }, 'id');
      const channel = input.channel as string | undefined;
      if (!ctx.scheduledActionService) throw new Error('ScheduledActionService not available');

      // Completing twice (n8n retries) does not advance the sequence twice.
      const step = await ctx.scheduledActionService.complete(ctx.orgId, stepId, { resolvedChannel: channel });
      return { success: true, status: step.status };
    },
  ],
  [
    'create_follow_up_sequence',
    async (input, ctx) => {
      if (!ctx.automationSequenceService) throw new Error('AutomationSequenceService not available');
      const dto: CreateSequenceInput = {
        contact_id: input.contact_id as string,
        conversation_id: input.conversation_id as string | undefined,
        sequence_type: (input.sequence_type as CreateSequenceInput['sequence_type']) ?? 'no_response',
        source: (input.source as string) ?? 'n8n',
      };
      const seq = await ctx.automationSequenceService.create(ctx.orgId, dto);
      return { sequence_id: seq.id, status: seq.status };
    },
  ],
  [
    'create_payment_link',
    async (input, ctx) => {
      if (!ctx.paymentsService) throw new Error('PaymentsService not available');
      const nested = (input.booking ?? {}) as Record<string, unknown>;
      const startsAt = (nested.starts_at ?? input.starts_at) as string | undefined;
      const duration = nested.duration_minutes ?? input.duration_minutes;
      const calendarId = (nested.calendar_id ?? input.calendar_id) as string | undefined;
      const title = (nested.title ?? input.title) as string | undefined;
      const timezone = (nested.timezone ?? input.timezone) as string | undefined;

      return ctx.paymentsService.createCheckoutLink(ctx.orgId, {
        contact_id: input.contact_id as string,
        service_id: input.service_id as string,
        conversation_id: input.conversation_id as string | undefined,
        appointment_id: input.appointment_id as string | undefined,
        booking: startsAt
          ? {
              calendar_id: calendarId,
              title,
              starts_at: startsAt,
              duration_minutes: Number(duration),
              timezone,
            }
          : undefined,
      });
    },
  ],
  [
    'opt_out_contact',
    async (input, ctx) => {
      const contactId = input.contact_id as string;
      if (!contactId) throw new Error('contact_id is required');

      let sequencesCancelled = 0;
      if (ctx.automationSequenceService) {
        sequencesCancelled = await ctx.automationSequenceService.cancelAllForContact(
          ctx.orgId,
          contactId,
          'opt_out',
        );
      }

      const contact = await ctx.clientService.findById(contactId, ctx.orgId);
      const currentTags: string[] = (contact.tags as string[]) ?? [];
      if (!currentTags.includes('opt-out')) {
        await ctx.clientService.update(contactId, ctx.orgId, {
          tags: [...currentTags, 'opt-out'],
        });
      }

      return {
        opted_out: true,
        sequences_cancelled: sequencesCancelled,
        message: sequencesCancelled > 0
          ? `Contact opted out. ${sequencesCancelled} sequence(s) cancelled.`
          : 'Contact opted out. No active sequences found.',
      };
    },
  ],
  [
    'send_email',
    async (input, ctx) => {
      // The agent writes plain text (see the tool schema). It is escaped into the
      // email layout, so prompt-injected HTML/links cannot become markup.
      const subject = requireText(input, 'subject', MAX_AGENT_EMAIL_SUBJECT);
      const body = requireText(input, 'body', MAX_AGENT_EMAIL_BODY);
      const contact = await ctx.clientService.findById(input.contact_id as string, ctx.orgId);
      const to = contact.email as string | undefined;
      if (!to) throw new Error('Contact has no email on file');
      await ctx.mailService.send({ to, ...emailFromTemplate('agent_email', { subject, message: body }) });
      return { sent: true, to };
    },
  ],
  [
    'send_sms',
    async (input, ctx) => {
      const text = requireText(input, 'message', MAX_AGENT_SMS);
      const contact = await ctx.clientService.findById(input.contact_id as string, ctx.orgId);
      const to = contact.phone as string | undefined;
      if (!to) throw new Error('Contact has no phone on file');
      const result = await ctx.smsService.send({ to, text });
      return { sent: true, to, provider_id: result.providerId };
    },
  ],
]);

@Injectable()
export class ToolExecutionService {
  private readonly logger = new Logger(ToolExecutionService.name);

  constructor(
    @InjectRepository(AgentToolExecutionEntity)
    private readonly executionRepo: Repository<AgentToolExecutionEntity>,
    private readonly agentTriggerService: AgentTriggerService,
    private readonly conversationService: ConversationManagementService,
    private readonly clientService: ClientManagementService,
    private readonly schedulingService: SchedulingService,
    private readonly availabilityService: AvailabilityService,
    private readonly calendarService: CalendarService,
    @Inject(RABBITMQ_SERVICE)
    private readonly rmqClient: ClientProxy,
    private readonly mailService: MailService,
    private readonly smsService: SmsService,
    @Optional() private readonly automationSequenceService?: AutomationSequenceService,
    @Optional() private readonly scheduledActionService?: ScheduledActionService,
    @Optional() private readonly paymentsService?: PaymentsService,
    @Optional() private readonly paymentServiceService?: PaymentServiceService,
    @Optional() private readonly paymentSettingsService?: PaymentSettingsService,
  ) {}

  async execute(
    orgId: string,
    agentId: string,
    toolName: string,
    input: Record<string, unknown>,
    conversationId?: string,
  ): Promise<AgentToolExecutionEntity> {
    // 1. Validate tool is registered for org
    const toolFn = TOOL_REGISTRY.get(toolName);
    if (!toolFn) {
      throw new NotFoundException(`Tool '${toolName}' is not a recognized CRM tool`);
    }

    const toolEntity = await this.agentTriggerService.findToolByName(toolName, orgId);

    // 2. Create execution record (status=pending)
    const execution = await this.executionRepo.save(
      this.executionRepo.create({
        organization_id: orgId,
        agent_id: agentId,
        tool_id: toolEntity?.id ?? null,
        conversation_id: conversationId ?? null,
        input,
        result: {},
        status: 'pending',
      }),
    );

    // 3. Execute the tool
    try {
      const ctx: ToolContext = {
        orgId,
        conversationService: this.conversationService,
        clientService: this.clientService,
        schedulingService: this.schedulingService,
        availabilityService: this.availabilityService,
        calendarService: this.calendarService,
        automationSequenceService: this.automationSequenceService,
        scheduledActionService: this.scheduledActionService,
        paymentsService: this.paymentsService,
        paymentServiceService: this.paymentServiceService,
        paymentSettingsService: this.paymentSettingsService,
        mailService: this.mailService,
        smsService: this.smsService,
        logger: this.logger,
      };

      const result = await toolFn(input, ctx);

      // 4. Update to success
      execution.status = 'success';
      execution.result = (result as Record<string, unknown>) ?? {};
      await this.executionRepo.save(execution);

      // 5. Emit RabbitMQ event
      this.rmqClient.emit(RABBITMQ_QUEUES.AGENT_TOOL_EXECUTED, {
        organization_id: orgId,
        agent_id: agentId,
        tool_name: toolName,
        execution_id: execution.id,
      });

      return execution;
    } catch (err: unknown) {
      const error = err as Error;
      this.logger.error(`Tool '${toolName}' failed: ${error.message}`, error.stack);

      execution.status = 'failed';
      execution.result = { error: error.message };
      await this.executionRepo.save(execution);

      throw err;
    }
  }

  async findByAgent(agentId: string, orgId: string, limit = 20): Promise<AgentToolExecutionEntity[]> {
    return this.executionRepo.find({
      where: { agent_id: agentId, organization_id: orgId },
      order: { created_at: 'DESC' },
      take: limit,
    });
  }

  static getAvailableTools() {
    return [
      {
        name: 'send_message',
        description: 'Sends a message to a contact in an existing conversation',
        input_schema: {
          type: 'object',
          properties: {
            conversation_id: { type: 'string', description: 'The conversation ID' },
            content: { type: 'string', description: 'The message content to send' },
          },
          required: ['conversation_id', 'content'],
        },
      },
      {
        name: 'create_contact',
        description: 'Creates a new contact in the CRM',
        input_schema: {
          type: 'object',
          properties: {
            first_name: { type: 'string', description: 'Contact first name' },
            last_name: { type: 'string', description: 'Contact last name' },
            email: { type: 'string', description: 'Contact email address' },
            phone: { type: 'string', description: 'Contact phone number' },
          },
          required: ['first_name'],
        },
      },
      {
        name: 'update_contact',
        description: 'Updates an existing contact information',
        input_schema: {
          type: 'object',
          properties: {
            contact_id: { type: 'string', description: 'The contact ID to update' },
            first_name: { type: 'string', description: 'Contact first name' },
            last_name: { type: 'string', description: 'Contact last name' },
            email: { type: 'string', description: 'Contact email address' },
            phone: { type: 'string', description: 'Contact phone number' },
          },
          required: ['contact_id'],
        },
      },
      {
        name: 'create_appointment',
        description:
          'Books an appointment on a free slot (use get_available_slots first). The contact gets a confirmation link by email/SMS. ' +
          'Calendars that charge a service refuse this tool: use create_payment_link with a booking instead. ' +
          'Automatically cancels any active follow-up sequence.',
        input_schema: {
          type: 'object',
          properties: {
            contact_id: { type: 'string', description: 'The contact ID' },
            calendar_id: { type: 'string', description: 'The calendar ID to book on' },
            starts_at: { type: 'string', description: 'Start instant from get_available_slots (ISO 8601 with offset)' },
            duration_minutes: { type: 'number', description: 'Duration in minutes (defaults to the calendar slot size)' },
            title: { type: 'string', description: 'Appointment title (defaults to the calendar name)' },
            conversation_id: { type: 'string', description: 'The conversation the booking came from' },
          },
          required: ['contact_id', 'calendar_id', 'starts_at'],
        },
      },
      {
        name: 'get_available_slots',
        description:
          'Free slots between two dates of the calendar (inclusive). Dates are local to the calendar time zone; ' +
          'each slot has starts_at (UTC instant to book with) and local_start (calendar wall clock, to tell the contact).',
        input_schema: {
          type: 'object',
          properties: {
            calendar_id: { type: 'string', description: 'The calendar ID' },
            from: { type: 'string', description: 'First date, YYYY-MM-DD' },
            to: { type: 'string', description: 'Last date, YYYY-MM-DD (at most 62 days after from)' },
            duration_minutes: { type: 'number', description: 'Appointment length (defaults to the calendar slot size)' },
          },
          required: ['calendar_id', 'from', 'to'],
        },
      },
      {
        name: 'get_calendars',
        description:
          'Lists the calendars appointments can be booked on: time zone, slot size, booking window, and whether ' +
          'booking charges a service (then use create_payment_link instead of create_appointment).',
        input_schema: { type: 'object', properties: {} },
      },
      {
        name: 'reschedule_appointment',
        description:
          'Moves an upcoming appointment of the contact to a free slot (use get_available_slots first). The contact is notified.',
        input_schema: {
          type: 'object',
          properties: {
            appointment_id: { type: 'string', description: 'The appointment ID (from get_contact_appointments)' },
            contact_id: { type: 'string', description: 'The contact the appointment belongs to' },
            starts_at: { type: 'string', description: 'New start instant from get_available_slots (ISO 8601)' },
            duration_minutes: { type: 'number', description: 'New duration (defaults to the current one)' },
          },
          required: ['appointment_id', 'contact_id', 'starts_at'],
        },
      },
      {
        name: 'cancel_appointment',
        description: 'Cancels an upcoming appointment at the contact\'s request. The contact is notified.',
        input_schema: {
          type: 'object',
          properties: {
            appointment_id: { type: 'string', description: 'The appointment ID (from get_contact_appointments)' },
            contact_id: { type: 'string', description: 'The contact the appointment belongs to' },
          },
          required: ['appointment_id', 'contact_id'],
        },
      },
      {
        name: 'opt_out_contact',
        description: 'Opts out a contact from automated communications. Cancels ALL active sequences and adds opt-out tag. Use when contact explicitly requests to stop receiving messages.',
        input_schema: {
          type: 'object',
          properties: {
            contact_id: { type: 'string', description: 'The contact ID to opt out' },
          },
          required: ['contact_id'],
        },
      },
      {
        name: 'add_contact_note',
        description: 'Adds a note to a contact',
        input_schema: {
          type: 'object',
          properties: {
            contact_id: { type: 'string', description: 'The contact ID' },
            note: { type: 'string', description: 'The note content' },
          },
          required: ['contact_id', 'note'],
        },
      },
      {
        name: 'get_contact_appointments',
        description: 'Gets upcoming appointments for a contact',
        input_schema: {
          type: 'object',
          properties: {
            contact_id: { type: 'string', description: 'The contact ID' },
            limit: { type: 'number', description: 'Maximum number of appointments to return' },
          },
          required: ['contact_id'],
        },
      },
      {
        name: 'get_conversation_history',
        description: 'Gets message history for a contact',
        input_schema: {
          type: 'object',
          properties: {
            contact_id: { type: 'string', description: 'The contact ID' },
            conversation_id: { type: 'string', description: 'Optional specific conversation ID' },
            limit: { type: 'number', description: 'Maximum number of messages to return' },
          },
          required: ['contact_id'],
        },
      },
      {
        name: 'complete_follow_up',
        description: 'Marks a follow-up action as completed (used by n8n after execution)',
        input_schema: {
          type: 'object',
          properties: {
            appointment_id: { type: 'string', description: 'The follow-up step ID (appointment_id in the follow_up.due payload)' },
            channel: { type: 'string', description: 'The channel used (whatsapp, sms, etc)' },
          },
          required: ['appointment_id'],
        },
      },
      {
        name: 'create_follow_up_sequence',
        description: 'Creates an automated follow-up sequence for a contact',
        input_schema: {
          type: 'object',
          properties: {
            contact_id: { type: 'string', description: 'The contact ID' },
            conversation_id: { type: 'string', description: 'The conversation ID' },
            sequence_type: {
              type: 'string',
              description: 'Type of sequence',
              enum: ['no_response', 'appointment_reminder', 'post_service', 'reactivation', 'manual'],
            },
            source: { type: 'string', description: 'Source of the sequence creation' },
          },
          required: ['contact_id'],
        },
      },
      {
        name: 'create_payment_link',
        description: 'Creates a payment link for a service with optional appointment booking',
        input_schema: {
          type: 'object',
          properties: {
            contact_id: { type: 'string', description: 'The contact ID' },
            service_id: { type: 'string', description: 'The payment service ID' },
            conversation_id: { type: 'string', description: 'The conversation ID' },
            booking: {
              type: 'object',
              description: 'Optional appointment booking details',
              properties: {
                calendar_id: { type: 'string' },
                title: { type: 'string' },
                starts_at: { type: 'string' },
                duration_minutes: { type: 'number' },
                timezone: { type: 'string' },
              },
            },
          },
          required: ['contact_id', 'service_id'],
        },
      },
      {
        name: 'list_payment_services',
        description: 'Lists all available payment services',
        input_schema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'send_email',
        description: 'Sends an email to a contact with the information they requested. The recipient is resolved from the contact on file.',
        input_schema: {
          type: 'object',
          properties: {
            contact_id: { type: 'string', description: 'The contact ID' },
            subject: { type: 'string', description: 'Email subject line' },
            body: { type: 'string', description: 'Email body (plain text; newlines become line breaks)' },
          },
          required: ['contact_id', 'subject', 'body'],
        },
      },
      {
        name: 'send_sms',
        description: 'Sends an SMS to a contact. The recipient phone is resolved from the contact on file. Use only when the contact asks to receive information by SMS; appointment confirmations are sent automatically.',
        input_schema: {
          type: 'object',
          properties: {
            contact_id: { type: 'string', description: 'The contact ID' },
            message: { type: 'string', description: 'The SMS text to send' },
          },
          required: ['contact_id', 'message'],
        },
      },
    ];
  }
}
