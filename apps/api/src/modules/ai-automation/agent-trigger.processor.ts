import { Injectable, Logger, OnModuleDestroy, OnModuleInit, Inject, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Worker, Job } from 'bullmq';
import { AgentTriggerService } from './agent-trigger.service';
import { SchedulingService } from '../scheduling/scheduling.service';
import { ClientManagementService } from '../client-management/client-management.service';
import { PaymentServiceService } from '../payments/payment-service.service';
import { PaymentSettingsService } from '../payments/payment-settings.service';
import { AGENT_TRIGGER_QUEUE } from './ai-automation.constants';
import type { AgentTriggerJobData } from '@crm/shared';

export const AGENT_TRIGGER_QUEUE_NAME = 'agent_trigger';

// Payment events have no dedicated agent row; they fall back to the active
// message.received agent so the conversational agent can acknowledge the
// payment and continue. The POST still carries the original event_type.
const PAYMENT_EVENTS = new Set(['payment.received', 'payment.expired']);

@Injectable()
export class AgentTriggerProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AgentTriggerProcessor.name);
  private worker: Worker;

  constructor(
    private readonly agentTriggerService: AgentTriggerService,
    private readonly configService: ConfigService,
    @Optional() private readonly schedulingService: SchedulingService,
    @Optional() private readonly clientService: ClientManagementService,
    @Optional() private readonly paymentServiceService: PaymentServiceService,
    @Optional() private readonly paymentSettingsService: PaymentSettingsService,
    @Inject(AGENT_TRIGGER_QUEUE) private readonly _queue: unknown, // ensure queue provider is initialized
  ) {}

  onModuleInit() {
    const host = this.configService.get<string>('redis.host', 'localhost');
    const port = this.configService.get<number>('redis.port', 6379);
    const password = this.configService.get<string>('redis.password', '');

    this.worker = new Worker(
      AGENT_TRIGGER_QUEUE_NAME,
      async (job: Job<AgentTriggerJobData>) => this.process(job),
      {
        connection: { host, port, password: password || undefined },
        concurrency: 5,
      },
    );

    this.worker.on('failed', (job, err) => {
      this.logger.error(`AgentTrigger job ${job?.id} failed: ${err.message}`, err.stack);
    });
  }

  async onModuleDestroy() {
    await this.worker?.close();
  }

  private async process(job: Job<AgentTriggerJobData>): Promise<void> {
    const { event_type, organization_id, conversation_id, contact_id, payload } = job.data;

    this.logger.debug(`Processing agent trigger: ${event_type} for org ${organization_id}`);

    let agents = await this.agentTriggerService.findAgentsForEvent(organization_id, event_type);

    if (agents.length === 0 && PAYMENT_EVENTS.has(event_type)) {
      this.logger.debug(
        `No agent for payment event '${event_type}' in org ${organization_id}; routing to the message.received agent`,
      );
      agents = await this.agentTriggerService.findAgentsForEvent(organization_id, 'message.received');
    }

    if (agents.length === 0) {
      this.logger.debug(`No active agents for event '${event_type}' in org ${organization_id}`);
      return;
    }

    for (const agent of agents) {
      try {
        // Log trigger
        await this.agentTriggerService.log(
          organization_id,
          agent.id,
          conversation_id ?? null,
          'agent_triggered',
          { event_type, contact_id, payload },
        );

        // Enrich payload with contact context + upcoming appointments + payment catalog
        let contactContext: Record<string, unknown> | null = null;
        let upcomingAppointments: unknown[] = [];
        let paymentServices: unknown[] = [];
        let paymentCurrency = 'usd';

        if (contact_id) {
          try {
            if (this.clientService) {
              const contact = await this.clientService.findById(contact_id, organization_id);
              contactContext = {
                id: contact.id,
                first_name: contact.first_name,
                last_name: contact.last_name,
                email: contact.email,
                phone: contact.phone,
                lead_stage: contact.lead_stage,
                tags: contact.tags,
              };
            }
            if (this.schedulingService) {
              const appointments = await this.schedulingService.findUpcomingForContact(organization_id, contact_id);
              upcomingAppointments = appointments.map((a) => ({
                id: a.id,
                title: a.title,
                starts_at: a.starts_at,
                ends_at: a.ends_at,
                status: a.status,
                location: a.location,
                meeting_url: a.meeting_url,
              }));
            }
          } catch {
            // Non-critical enrichment — continue without context
          }
        }

        try {
          if (this.paymentSettingsService) {
            const settings = await this.paymentSettingsService.getRaw(organization_id);
            paymentCurrency = settings.currency ?? 'usd';
          }
          if (this.paymentServiceService) {
            const services = await this.paymentServiceService.findAll(organization_id, true);
            paymentServices = services.map((s) => ({
              id: s.id,
              name: s.name,
              description: s.description,
              amount: s.amount,
              currency: paymentCurrency,
            }));
          }
        } catch {
          // Non-critical enrichment — continue without payment catalog
        }

        // Build n8n payload
        const n8nPayload = {
          organization_id,
          event_type,
          conversation_id: conversation_id ?? null,
          contact_id: contact_id ?? null,
          agent_id: agent.id,
          payload,
          contact: contactContext,
          upcoming_appointments: upcomingAppointments,
          payment_services: paymentServices,
          payment_currency: paymentCurrency,
        };

        // POST to the workflow endpoint (n8n, ProSales, or whatever's configured
        // as the single active agent for this event — only one is ever active
        // at a time by convention, switched manually from the web).
        const response = await fetch(agent.workflow_endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(agent.auth_header_value ? { 'X-API-Key': agent.auth_header_value } : {}),
          },
          body: JSON.stringify(n8nPayload),
          signal: AbortSignal.timeout(30_000),
        });

        if (!response.ok) {
          throw new Error(`workflow endpoint responded with ${response.status}: ${await response.text()}`);
        }

        await this.agentTriggerService.log(
          organization_id,
          agent.id,
          conversation_id ?? null,
          'workflow_called',
          { status: response.status, endpoint: agent.workflow_endpoint },
        );
      } catch (err: unknown) {
        const error = err as Error;
        this.logger.error(
          `Agent ${agent.id} workflow call failed: ${error.message}`,
          error.stack,
        );

        // Log failure but don't throw — continue to next agent
        await this.agentTriggerService
          .log(
            organization_id,
            agent.id,
            conversation_id ?? null,
            'workflow_failed',
            { error: error.message, endpoint: agent.workflow_endpoint },
          )
          .catch(() => {/* ignore log errors */});
      }
    }
  }
}
