/**
 * The automation engine on a real PostgreSQL, with everything that leaves the
 * system (chat messages, email, SMS, AI, calls, in-app alerts) captured
 * instead of sent. Runs are queued in memory and executed by `drain()`, so
 * tests decide exactly when time moves.
 */
import 'reflect-metadata';
import { randomUUID } from 'crypto';
import { ConfigModule } from '@nestjs/config';
import { type INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import type { NextFunction, Request, Response } from 'express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { PlatformAdminGuard } from '../common/guards/platform-admin.guard';
import { GlobalExceptionFilter } from '../common/filters/global-exception.filter';
import { TransformInterceptor } from '../common/interceptors/transform.interceptor';
import { AutomationsController } from '../modules/automation-engine/workflows/automations.controller';
import { RunsService } from '../modules/automation-engine/workflows/runs.service';
import { Test, type TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { of } from 'rxjs';
import type { AutomationDefinition } from '@crm/shared';
import { RABBITMQ_SERVICE } from '../infrastructure/rabbitmq/rabbitmq.constants';
import { ProcessedEventsService } from '../infrastructure/outbox/processed-events.service';
import { MailService } from '../infrastructure/mail/mail.service';
import { SmsService } from '../infrastructure/sms/sms.service';
import { RealtimeBroadcastService } from '../infrastructure/realtime/realtime-broadcast.service';
import { ClientManagementService } from '../modules/client-management/client-management.service';
import { CompaniesService } from '../modules/client-management/companies.service';
import { ConversationManagementService } from '../modules/conversation-management/conversation-management.service';
import { ProsalesClientService } from '../modules/ai-agents/prosales-client.service';
import { AGENT_TRIGGER_QUEUE } from '../modules/ai-automation/ai-automation.constants';
import { ACTION_EXECUTION_QUEUE } from '../modules/automation-engine/automation-engine.constants';
import { ChannelStrategyResolverService } from '../modules/automation-engine/channel-strategy-resolver.service';
import { ScheduledActionService } from '../modules/automation-engine/scheduled-action.service';
import { ActionGuardService } from '../modules/automation-engine/core/action-guard.service';
import { TaskHooksService } from '../modules/automation-engine/core/task-hooks.service';
import { OrgTimeService } from '../modules/automation-engine/workflows/time/org-time.service';
import { RunStoreService } from '../modules/automation-engine/workflows/runtime/run-store.service';
import { AutomationRuntimeService, AUTOMATION_RUN_JOB } from '../modules/automation-engine/workflows/runtime/automation-runtime.service';
import { RecipientsService } from '../modules/automation-engine/workflows/nodes/recipients.service';
import { DeliveryRunner } from '../modules/automation-engine/workflows/nodes/delivery-runner.service';
import { NODE_EXECUTORS } from '../modules/automation-engine/workflows/nodes/node-executor';
import { ConditionNode, EndNode, WaitForEventNode, WaitNode } from '../modules/automation-engine/workflows/nodes/logic.nodes';
import { AddTagNode, MoveStageNode, RemoveTagNode, SetAiNode, UpdateContactNode } from '../modules/automation-engine/workflows/nodes/contact.nodes';
import { ChatSender, SendEmailNode, SendMessageNode, SendSmsNode } from '../modules/automation-engine/workflows/nodes/messaging.nodes';
import { CallNode, CreateTaskNode, NotifyTeamNode } from '../modules/automation-engine/workflows/nodes/team.nodes';
import { AiConnectionsService, SendToAiNode } from '../modules/automation-engine/workflows/nodes/ai.nodes';
import { EnrollmentService } from '../modules/automation-engine/workflows/triggers/enrollment.service';
import { ScheduleTriggerService } from '../modules/automation-engine/workflows/triggers/schedule-trigger.service';
import { AutomationEventConsumer } from '../modules/automation-engine/workflows/triggers/automation-event.consumer';
import { AutomationsService } from '../modules/automation-engine/workflows/automations.service';
import { AutomationInstallerService } from '../modules/automation-engine/workflows/system/automation-installer.service';
import type { AutomationEntity } from '../modules/automation-engine/workflows/entities/automation.entity';

const EXECUTORS = [
  SendMessageNode, SendEmailNode, SendSmsNode, SendToAiNode, SetAiNode, NotifyTeamNode, CreateTaskNode, CallNode,
  AddTagNode, RemoveTagNode, UpdateContactNode, MoveStageNode, WaitNode, WaitForEventNode, ConditionNode, EndNode,
];

export interface Captured {
  chat: Array<{ conversation_id: string; contact_id: string; channel: string; content: string; metadata: Record<string, unknown> }>;
  emails: Array<{ to: string; subject: string; html: string; attachments?: Array<{ filename: string; content: string; contentType: string }> }>;
  sms: Array<{ to: string; text: string }>;
  aiJobs: Array<{ name: string; data: Record<string, unknown>; opts: Record<string, unknown> }>;
  calls: Array<{ org: string; phone: string }>;
  notifications: Array<Record<string, unknown>>;
  events: Array<{ topic: string; data: Record<string, unknown> }>;
  /** Emails and SMS in the order they were sent. */
  outbound: Array<{ channel: 'email' | 'sms'; message: Record<string, unknown> }>;
}

export interface AutomationHarness {
  moduleRef: TestingModule;
  ds: DataSource;
  org: string;
  captured: Captured;
  automations: AutomationsService;
  runtime: AutomationRuntimeService;
  enrollment: EnrollmentService;
  store: RunStoreService;
  schedules: ScheduleTriggerService;
  consumer: AutomationEventConsumer;
  tasks: ScheduledActionService;
  installer: AutomationInstallerService;
  /** Which channel the fake resolver picks for chat messages. */
  chatChannel: { value: string | null };
  /** Makes the next chat sends throw (to test retries). */
  failChat: { times: number; message: string };
  createContact(fields?: Record<string, unknown>): Promise<string>;
  createConversation(contactId: string, channel?: string, botActive?: boolean): Promise<string>;
  createAiConnection(fields?: Record<string, unknown>): Promise<string>;
  publish(definition: AutomationDefinition, name?: string): Promise<AutomationEntity>;
  /** Delivers a published event to the automations consumer. */
  emit(topic: string, payload: Record<string, unknown>): Promise<void>;
  /** Executes queued and due runs until nothing is left (time does not move). */
  drain(maxRounds?: number): Promise<number>;
  /** Makes a waiting run due now (as if its wait were over) and drains. */
  fastForward(runId: string): Promise<void>;
  runs(automationId: string): Promise<Array<Record<string, unknown>>>;
  steps(runId: string): Promise<Array<Record<string, unknown>>>;
  /** With `{ http: true }`: call the API as a role (`x-test-role`), like a browser would. */
  call(role: string | null, method: string, path: string, body?: unknown): Promise<{ status: number; body: any }>;
  close(): Promise<void>;
}

export async function createAutomationHarness(url: string, opts: { http?: boolean } = {}): Promise<AutomationHarness> {
  const org = randomUUID();
  const captured: Captured = { chat: [], emails: [], sms: [], aiJobs: [], calls: [], notifications: [], events: [], outbound: [] };
  const queued: string[] = [];
  const chatChannel = { value: 'whatsapp' as string | null };
  const failChat = { times: 0, message: 'provider down' };

  const conversationService = {
    findOrCreateActiveConversation: async (orgId: string, contactId: string, _c: string, channel: string) => {
      const rows = (await ds.query(
        `SELECT id FROM conversations.conversations WHERE organization_id = $1 AND contact_id = $2 AND channel = $3 AND status = 'open' LIMIT 1`,
        [orgId, contactId, channel],
      )) as Array<{ id: string }>;
      if (rows[0]) return { conversation: { id: rows[0].id, channel }, created: false };
      const id = randomUUID();
      await ds.query(`INSERT INTO conversations.conversations (id, organization_id, contact_id, channel, status) VALUES ($1, $2, $3, $4, 'open')`, [
        id, orgId, contactId, channel,
      ]);
      return { conversation: { id, channel }, created: true };
    },
    sendMessage: async (conversationId: string, _org: string, dto: { content: string; metadata?: Record<string, unknown> }) => {
      if (failChat.times > 0) {
        failChat.times -= 1;
        throw new Error(failChat.message);
      }
      const [conv] = (await ds.query(`SELECT contact_id, channel FROM conversations.conversations WHERE id = $1`, [conversationId])) as Array<{
        contact_id: string;
        channel: string;
      }>;
      captured.chat.push({ conversation_id: conversationId, contact_id: conv.contact_id, channel: conv.channel, content: dto.content, metadata: dto.metadata ?? {} });
      return { id: randomUUID() };
    },
    setBotActive: async (id: string, orgId: string, active: boolean) => {
      const r = (await ds.query(
        `UPDATE conversations.conversations SET bot_active = $3 WHERE id = $1 AND organization_id = $2 AND bot_active = $4 RETURNING id`,
        [id, orgId, active, !active],
      )) as unknown[];
      return (Array.isArray(r[0]) ? r[0] : r).length > 0;
    },
  };

  const moduleRef = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true, load: [() => ({})] }),
      TypeOrmModule.forRoot({ type: 'postgres', url, entities: [`${__dirname}/../**/*.entity.ts`] }),
      TypeOrmModule.forFeature([
        ...(await import('../modules/automation-engine/workflows/entities')).AUTOMATION_ENTITIES,
        (await import('../modules/client-management/contact.entity')).ContactEntity,
        (await import('../modules/client-management/contact-data-update.entity')).ContactDataUpdateEntity,
        (await import('../modules/conversation-management/conversation.entity')).ConversationEntity,
        (await import('../modules/conversation-management/message.entity')).MessageEntity,
        (await import('../modules/voice/call.entity')).CallEntity,
        (await import('../modules/scheduling/appointment.entity')).AppointmentEntity,
        (await import('../modules/funnels/contact-funnel-history.entity')).ContactFunnelHistoryEntity,
        (await import('../modules/funnels/funnel-stage.entity')).FunnelStageEntity,
        (await import('../modules/funnels/funnel.entity')).FunnelEntity,
        (await import('../modules/organizations/organization.entity')).OrganizationEntity,
        (await import('../modules/users/user.entity')).UserEntity,
        (await import('../modules/scheduling/work-schedule.entity')).WorkScheduleEntity,
        (await import('../modules/automation-engine/scheduled-action.entity')).ScheduledActionEntity,
        (await import('../modules/ai-automation/entities/automation-agent.entity')).AutomationAgentEntity,
      ]),
    ],
    controllers: [AutomationEventConsumer, ...(opts.http ? [AutomationsController] : [])],
    providers: [
      RunsService,
      ...(opts.http
        ? [
            { provide: APP_GUARD, useClass: JwtAuthGuard },
            { provide: APP_GUARD, useClass: RolesGuard },
            { provide: APP_GUARD, useClass: PlatformAdminGuard },
          ]
        : []),
      ActionGuardService,
      TaskHooksService,
      OrgTimeService,
      RunStoreService,
      AutomationRuntimeService,
      RecipientsService,
      DeliveryRunner,
      ChatSender,
      AiConnectionsService,
      ...EXECUTORS,
      { provide: NODE_EXECUTORS, inject: EXECUTORS, useFactory: (...e: unknown[]) => e },
      EnrollmentService,
      ScheduleTriggerService,
      AutomationsService,
      AutomationInstallerService,
      ProcessedEventsService,
      ClientManagementService,
      ScheduledActionService,
      { provide: CompaniesService, useValue: {} },
      { provide: ConversationManagementService, useValue: conversationService },
      {
        provide: ChannelStrategyResolverService,
        useValue: {
          resolve: async (contact: { email?: string; phone?: string }) => {
            const channel = chatChannel.value;
            if (!channel) return null;
            return { channel, recipientId: channel === 'email' ? contact.email : contact.phone ?? 'id' };
          },
        },
      },
      {
        provide: MailService,
        useValue: {
          send: async (m: Captured['emails'][number]) => {
            captured.emails.push(m);
            captured.outbound.push({ channel: 'email', message: m as never });
          },
        },
      },
      {
        provide: SmsService,
        useValue: {
          send: async (m: Captured['sms'][number]) => {
            captured.sms.push(m);
            captured.outbound.push({ channel: 'sms', message: m as never });
            return { providerId: 'sms-1' };
          },
        },
      },
      { provide: RealtimeBroadcastService, useValue: { notifyOrg: async (_o: string, n: Record<string, unknown>) => void captured.notifications.push(n) } },
      { provide: ProsalesClientService, useValue: { startOutboundCall: async (o: string, phone: string) => void captured.calls.push({ org: o, phone }) } },
      {
        provide: AGENT_TRIGGER_QUEUE,
        useValue: { add: async (name: string, data: Record<string, unknown>, opts: Record<string, unknown>) => void captured.aiJobs.push({ name, data, opts }) },
      },
      {
        provide: ACTION_EXECUTION_QUEUE,
        useValue: {
          add: async (name: string, data: { runId: string }) => {
            if (name === AUTOMATION_RUN_JOB) queued.push(data.runId);
          },
        },
      },
      {
        provide: RABBITMQ_SERVICE,
        useValue: {
          emit: (topic: string, data: Record<string, unknown>) => {
            captured.events.push({ topic, data });
            return of(undefined);
          },
        },
      },
    ],
  }).compile();

  let app: INestApplication | null = null;
  let baseUrl = '';
  if (opts.http) {
    app = moduleRef.createNestApplication();
    app.use((req: Request, _res: Response, next: NextFunction) => {
      const role = req.headers['x-test-role'] as string | undefined;
      if (role) {
        const platform = role === 'platform_admin';
        req.user = { id: 'u1', auth_user_id: 'a1', email: null, organization_id: org, role: platform ? 'owner' : role, is_platform_admin: platform } as never;
        (req as unknown as Record<string, unknown>).tenant = { organization_id: org, user_id: null, role: platform ? 'owner' : role };
      }
      next();
    });
    app.setGlobalPrefix('api');
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true, transformOptions: { enableImplicitConversion: true } }));
    app.useGlobalFilters(new GlobalExceptionFilter());
    app.useGlobalInterceptors(new TransformInterceptor());
    await app.listen(0);
    baseUrl = `http://127.0.0.1:${(app.getHttpServer().address() as { port: number }).port}/api/v1`;
  } else {
    await moduleRef.init();
  }

  const ds = moduleRef.get(DataSource);
  const runtime = moduleRef.get(AutomationRuntimeService);
  const store = moduleRef.get(RunStoreService);
  const automations = moduleRef.get(AutomationsService);
  // Marked as installed: engine tests publish their own automations; parity tests call installer.install().
  await ds.query(`INSERT INTO core.organizations (id, name, slug, settings) VALUES ($1, 'Clínica Sol', $2, '{"automations_installed": 999}')`, [
    org,
    `auto-${org}`,
  ]);

  const rows = <T>(r: unknown): T[] => (Array.isArray(r) && Array.isArray(r[0]) ? (r[0] as T[]) : (r as T[]));

  const harness: AutomationHarness = {
    moduleRef,
    ds,
    org,
    captured,
    automations,
    runtime,
    store,
    enrollment: moduleRef.get(EnrollmentService),
    schedules: moduleRef.get(ScheduleTriggerService),
    consumer: moduleRef.get(AutomationEventConsumer),
    tasks: moduleRef.get(ScheduledActionService),
    installer: moduleRef.get(AutomationInstallerService),
    chatChannel,
    failChat,
    async createContact(fields = {}) {
      const id = randomUUID();
      const f: Record<string, unknown> = { first_name: 'Ana', last_name: 'García', email: 'ana@example.com', phone: '+5215550001', tags: [] as string[], ...fields };
      await ds.query(
        `INSERT INTO clients.contacts (id, organization_id, first_name, last_name, email, phone, tags, custom_fields, channel_ids)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [id, org, f.first_name, f.last_name, f.email, f.phone, f.tags, JSON.stringify(f.custom_fields ?? {}), JSON.stringify(f.channel_ids ?? {})],
      );
      return id;
    },
    async createConversation(contactId, channel = 'whatsapp', botActive = true) {
      const id = randomUUID();
      await ds.query(
        `INSERT INTO conversations.conversations (id, organization_id, contact_id, channel, status, bot_active) VALUES ($1, $2, $3, $4, 'open', $5)`,
        [id, org, contactId, channel, botActive],
      );
      return id;
    },
    async createAiConnection(fields = {}) {
      const id = randomUUID();
      const f = { name: 'ProSales', trigger_event: 'message.received', workflow_endpoint: 'https://prosales.test/crm/inbound', is_active: true, ...fields };
      await ds.query(
        `INSERT INTO ai_agents.agents (id, organization_id, name, trigger_event, workflow_endpoint, auth_header_value, is_active)
         VALUES ($1, $2, $3, $4, $5, 'key', $6)`,
        [id, org, f.name, f.trigger_event, f.workflow_endpoint, f.is_active],
      );
      return id;
    },
    async publish(definition, name = 'Test automation') {
      const created = await automations.create(org, { name, draft: definition }, null);
      return automations.publish(org, created.id, null);
    },
    async emit(topic, payload) {
      await harness.consumer.handle(topic, { organization_id: org, event_id: randomUUID(), ...payload });
    },
    async drain(maxRounds = 50) {
      let executed = 0;
      for (let round = 0; round < maxRounds; round++) {
        // Only this harness's organization: other suites share the database.
        const due = rows<{ id: string }>(
          await ds.query(
            `SELECT id FROM automation.automation_runs WHERE organization_id = $1 AND status = 'waiting' AND resume_at <= NOW()`,
            [org],
          ),
        );
        const ids = [...new Set([...queued.splice(0), ...due.map((d) => d.id)])];
        if (!ids.length) return executed;
        for (const id of ids) {
          await runtime.execute(id);
          executed += 1;
        }
      }
      throw new Error('drain(): runs keep becoming due — a loop?');
    },
    async fastForward(runId) {
      await ds.query(`UPDATE automation.automation_runs SET resume_at = NOW() - INTERVAL '1 second' WHERE id = $1 AND status = 'waiting'`, [runId]);
      await harness.drain();
    },
    async runs(automationId) {
      return rows(await ds.query(`SELECT * FROM automation.automation_runs WHERE automation_id = $1 ORDER BY created_at`, [automationId]));
    },
    async steps(runId) {
      return rows(
        await ds.query(`SELECT step_no, node_key, node_type, status, branch, output, error FROM automation.automation_run_steps WHERE run_id = $1 ORDER BY step_no`, [runId]),
      );
    },
    async call(role, method, path, body) {
      if (!baseUrl) throw new Error('createAutomationHarness(url, { http: true }) to call the API');
      const res = await fetch(`${baseUrl}${path}`, {
        method,
        headers: { 'content-type': 'application/json', ...(role ? { 'x-test-role': role } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const text = await res.text();
      return { status: res.status, body: text ? JSON.parse(text) : null };
    },
    async close() {
      if (app) await app.close();
      else await moduleRef.close();
    },
  };
  return harness;
}
