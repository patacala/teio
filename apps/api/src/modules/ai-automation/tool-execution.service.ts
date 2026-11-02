import { Injectable, Logger, NotFoundException, Inject, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClientProxy } from '@nestjs/microservices';
import { AgentToolExecutionEntity } from './entities/agent-tool-execution.entity';
import { AgentTriggerService } from './agent-trigger.service';
import { ConversationManagementService } from '../conversation-management/conversation-management.service';
import { ClientManagementService } from '../client-management/client-management.service';
import { SchedulingService } from '../scheduling/scheduling.service';
import { AutomationSequenceService } from '../automation-engine/automation-sequence.service';
import { AutomatedAppointmentService } from '../automation-engine/automated-appointment.service';
import { PaymentsService } from '../payments/payments.service';
import { PaymentServiceService } from '../payments/payment-service.service';
import { PaymentSettingsService } from '../payments/payment-settings.service';
import { RABBITMQ_SERVICE, RABBITMQ_QUEUES } from '../../infrastructure/rabbitmq/rabbitmq.constants';
import { MailService } from '../../infrastructure/mail/mail.service';
import { SmsService } from '../../infrastructure/sms/sms.service';
import { CommunicationDispatchService } from '../communications/communication-dispatch.service';
import { CommunicationEventType } from '@crm/shared';
import type {
  CreateContactDto,
  UpdateContactDto,
} from '../client-management/client-management.service';
import type { AvailabilityQuery, CreateAppointmentDto } from '../scheduling/scheduling.service';
import type { CreateSequenceInput } from '@crm/shared';

interface ToolContext {
  orgId: string;
  conversationService: ConversationManagementService;
  clientService: ClientManagementService;
  schedulingService: SchedulingService;
  automationSequenceService?: AutomationSequenceService;
  automatedAppointmentService?: AutomatedAppointmentService;
  paymentsService?: PaymentsService;
  paymentServiceService?: PaymentServiceService;
  paymentSettingsService?: PaymentSettingsService;
  mailService: MailService;
  smsService: SmsService;
  communicationDispatch: CommunicationDispatchService;
  logger: Logger;
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
      // SchedulingService.create() is the single guard: for a non-human origin
      // it throws 'use create_payment_link' when the calendar charges a service.
      // origin is forced to 'ai' so the model can't pass origin:'human' to skip payment.
      const appointment = await ctx.schedulingService.create(ctx.orgId, {
        ...(input as unknown as CreateAppointmentDto),
        origin: 'ai',
      });

      // Cancel active sequence when appointment is booked — goal achieved
      if (ctx.automationSequenceService && input.contact_id) {
        const active = await ctx.automationSequenceService.findActive(
          ctx.orgId,
          input.contact_id as string,
        );
        if (active) {
          await ctx.automationSequenceService.cancel(ctx.orgId, active.id, 'appointment_booked');
        }
      }

      // Automatic confirmation SMS via the org's template — best effort, never
      // fails the booking. No template configured for the org → dispatch no-ops.
      if (input.contact_id) {
        try {
          const contact = await ctx.clientService.findById(input.contact_id as string, ctx.orgId);
          const phone = contact.phone as string | undefined;
          if (phone) {
            const tz = (appointment.timezone as string) || 'UTC';
            const startsAt = appointment.starts_at as unknown as string;
            await ctx.communicationDispatch.dispatch({
              organizationId: ctx.orgId,
              eventType: CommunicationEventType.APPOINTMENT_CREATED,
              channelType: 'sms',
              recipient: phone,
              variables: {
                title: String(appointment.title ?? ''),
                starts_at: startsAt ? String(startsAt) : '',
                date: startsAt ? new Date(startsAt).toLocaleDateString('es', { timeZone: tz }) : '',
                time: startsAt ? new Date(startsAt).toLocaleTimeString('es', { timeZone: tz }) : '',
              },
            });
          }
        } catch (err) {
          ctx.logger.warn(`Confirmation SMS skipped: ${(err as Error).message}`);
        }
      }

      return appointment;
    },
  ],
  [
    'get_available_slots',
    async (input, ctx) =>
      ctx.schedulingService.getAvailableSlots(ctx.orgId, input as unknown as AvailabilityQuery),
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
        title: a.title,
        starts_at: a.starts_at,
        ends_at: a.ends_at,
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
      const appointmentId = input.appointment_id as string;
      const channel = input.channel as string | undefined;
      if (!ctx.automatedAppointmentService) throw new Error('AutomatedAppointmentService not available');

      await ctx.automatedAppointmentService.markCompleted(ctx.orgId, appointmentId, channel);

      // If sequence appointment, advance
      if (ctx.automationSequenceService) {
        const seq = await ctx.automationSequenceService.findByAppointmentId(ctx.orgId, appointmentId);
        if (seq && seq.status === 'active') {
          await ctx.automationSequenceService.advanceOrComplete(ctx.orgId, seq.id);
        }
      }

      return { success: true };
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
      const contact = await ctx.clientService.findById(input.contact_id as string, ctx.orgId);
      const to = contact.email as string | undefined;
      if (!to) throw new Error('Contact has no email on file');
      await ctx.mailService.send({
        to,
        subject: input.subject as string,
        html: (input.body as string).replace(/\n/g, '<br>'),
      });
      return { sent: true, to };
    },
  ],
  [
    'send_sms',
    async (input, ctx) => {
      const contact = await ctx.clientService.findById(input.contact_id as string, ctx.orgId);
      const to = contact.phone as string | undefined;
      if (!to) throw new Error('Contact has no phone on file');
      const result = await ctx.smsService.send({ to, text: input.message as string });
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
    @Inject(RABBITMQ_SERVICE)
    private readonly rmqClient: ClientProxy,
    private readonly mailService: MailService,
    private readonly smsService: SmsService,
    private readonly communicationDispatch: CommunicationDispatchService,
    @Optional() private readonly automationSequenceService?: AutomationSequenceService,
    @Optional() private readonly automatedAppointmentService?: AutomatedAppointmentService,
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
        automationSequenceService: this.automationSequenceService,
        automatedAppointmentService: this.automatedAppointmentService,
        paymentsService: this.paymentsService,
        paymentServiceService: this.paymentServiceService,
        paymentSettingsService: this.paymentSettingsService,
        mailService: this.mailService,
        smsService: this.smsService,
        communicationDispatch: this.communicationDispatch,
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
        description: 'Books an appointment for a contact. Automatically cancels any active follow-up sequences.',
        input_schema: {
          type: 'object',
          properties: {
            contact_id: { type: 'string', description: 'The contact ID' },
            calendar_id: { type: 'string', description: 'The calendar ID to book on' },
            title: { type: 'string', description: 'Appointment title' },
            starts_at: { type: 'string', description: 'Start time (ISO 8601)' },
            duration_minutes: { type: 'number', description: 'Duration in minutes' },
          },
          required: ['contact_id', 'calendar_id', 'starts_at'],
        },
      },
      {
        name: 'get_available_slots',
        description: 'Gets available time slots for booking',
        input_schema: {
          type: 'object',
          properties: {
            calendar_id: { type: 'string', description: 'The calendar ID' },
            start_date: { type: 'string', description: 'Start date (ISO 8601)' },
            end_date: { type: 'string', description: 'End date (ISO 8601)' },
          },
          required: ['calendar_id', 'start_date', 'end_date'],
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
            appointment_id: { type: 'string', description: 'The follow-up appointment ID' },
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
