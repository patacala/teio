import { Module, Global, Logger } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { WorkScheduleEntity } from '../scheduling/work-schedule.entity';
import { ContactEntity } from '../client-management/contact.entity';
import { ConversationEntity } from '../conversation-management/conversation.entity';
import { OrganizationEntity } from '../organizations/organization.entity';
import { ConversationManagementModule } from '../conversation-management/conversation-management.module';
import { ClientManagementModule } from '../client-management/client-management.module';
import { IntegrationsModule } from '../integrations/integrations.module';
import { PaymentsModule } from '../payments/payments.module';
import { AIAgentsModule } from '../ai-agents/ai-agents.module';
import { ACTION_EXECUTION_QUEUE, ACTION_EXECUTION_QUEUE_NAME } from './automation-engine.constants';
import { ScheduledActionService } from './scheduled-action.service';
import { ScheduledActionEntity } from './scheduled-action.entity';
import { ChannelStrategyResolverService } from './channel-strategy-resolver.service';
import { ActionExecutionService } from './action-execution.service';
import { ActionExecutionProcessor } from './action-execution.processor';
import { ActionSchedulerCron } from './action-scheduler.cron';
import { AutomationEngineController } from './automation-engine.controller';
import { AgendaCallConsumer } from './agenda-call.consumer';
import { SendMessageHandler } from './handlers/send-message.handler';
import { SendEmailHandler } from './handlers/send-email.handler';
import { NotifyAgentHandler } from './handlers/notify-agent.handler';
import { CallHandler } from './handlers/call.handler';
import { MessageEntity } from '../conversation-management/message.entity';
import { FunnelStageEntity } from '../funnels/funnel-stage.entity';
import { UserEntity } from '../users/user.entity';
import { AutomationAgentEntity } from '../ai-automation/entities/automation-agent.entity';
import { AUTOMATION_ENTITIES } from './workflows/entities';
import { ActionGuardService } from './core/action-guard.service';
import { TaskHooksService } from './core/task-hooks.service';
import { OrgTimeService } from './workflows/time/org-time.service';
import { RunStoreService } from './workflows/runtime/run-store.service';
import { AutomationRuntimeService } from './workflows/runtime/automation-runtime.service';
import { RunSchedulerCron } from './workflows/runtime/run-scheduler.cron';
import { RecipientsService } from './workflows/nodes/recipients.service';
import { DeliveryRunner } from './workflows/nodes/delivery-runner.service';
import { NODE_EXECUTORS } from './workflows/nodes/node-executor';
import { ConditionNode, EndNode, WaitForEventNode, WaitNode } from './workflows/nodes/logic.nodes';
import { AddTagNode, MoveStageNode, RemoveTagNode, SetAiNode, UpdateContactNode } from './workflows/nodes/contact.nodes';
import { ChatSender, SendEmailNode, SendMessageNode, SendSmsNode } from './workflows/nodes/messaging.nodes';
import { CallNode, CreateTaskNode, NotifyTeamNode } from './workflows/nodes/team.nodes';
import { AiConnectionsService, SendToAiNode } from './workflows/nodes/ai.nodes';
import { EnrollmentService } from './workflows/triggers/enrollment.service';
import { ScheduleTriggerService } from './workflows/triggers/schedule-trigger.service';
import { AutomationEventConsumer } from './workflows/triggers/automation-event.consumer';
import { AutomationsService } from './workflows/automations.service';
import { AutomationInstallerService } from './workflows/system/automation-installer.service';
import { AutomationsController } from './workflows/automations.controller';
import { RunsService } from './workflows/runs.service';

/** Every step type's executor; the runtime looks them up by type. */
const NODE_EXECUTOR_CLASSES = [
  SendMessageNode,
  SendEmailNode,
  SendSmsNode,
  SendToAiNode,
  SetAiNode,
  NotifyTeamNode,
  CreateTaskNode,
  CallNode,
  AddTagNode,
  RemoveTagNode,
  UpdateContactNode,
  MoveStageNode,
  WaitNode,
  WaitForEventNode,
  ConditionNode,
  EndNode,
];

const logger = new Logger('AutomationEngineModule');

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([
      ScheduledActionEntity,
      WorkScheduleEntity,
      ContactEntity,
      ConversationEntity,
      OrganizationEntity,
      MessageEntity,
      FunnelStageEntity,
      UserEntity,
      AutomationAgentEntity,
      ...AUTOMATION_ENTITIES,
    ]),
    ConfigModule,
    ConversationManagementModule,
    ClientManagementModule,
    AIAgentsModule,
    IntegrationsModule,
    PaymentsModule,
  ],
  providers: [
    // Queue: try to create, return null if Redis unreachable
    {
      provide: ACTION_EXECUTION_QUEUE,
      inject: [ConfigService],
      useFactory: async (config: ConfigService): Promise<Queue | null> => {
        const host = config.get<string>('redis.host', 'localhost');
        const port = config.get<number>('redis.port', 6379);
        const password = config.get<string>('redis.password', '');
        try {
          const queue = new Queue(ACTION_EXECUTION_QUEUE_NAME, {
            connection: { host, port, password: password || undefined },
          });
          // Test connectivity
          const client = await queue.client;
          await client.ping();
          logger.log(`✓ BullMQ queue '${ACTION_EXECUTION_QUEUE_NAME}' connected to Redis at ${host}:${port}`);
          return queue;
        } catch (err) {
          logger.warn(
            `⚠ Cannot connect to Redis at ${host}:${port} — BullMQ queue disabled. ` +
            `Automation engine will run in direct mode. Error: ${err instanceof Error ? err.message : err}`,
          );
          return null;
        }
      },
    },
    // Follow-up agenda
    ScheduledActionService,
    ChannelStrategyResolverService,
    ActionExecutionService,
    // Processor (Phase 2: BullMQ worker, only active when Redis is available)
    ActionExecutionProcessor,
    // Scheduler
    ActionSchedulerCron,
    // Agenda step handlers
    SendMessageHandler,
    SendEmailHandler,
    NotifyAgentHandler,
    CallHandler,
    // Shared by the agenda and automations
    ActionGuardService,
    TaskHooksService,
    // Automations (workflows)
    OrgTimeService,
    RunStoreService,
    AutomationRuntimeService,
    RunSchedulerCron,
    RecipientsService,
    DeliveryRunner,
    ChatSender,
    AiConnectionsService,
    ...NODE_EXECUTOR_CLASSES,
    {
      provide: NODE_EXECUTORS,
      inject: NODE_EXECUTOR_CLASSES,
      useFactory: (...executors: unknown[]) => executors,
    },
    EnrollmentService,
    ScheduleTriggerService,
    AutomationsService,
    AutomationInstallerService,
    RunsService,
  ],
  controllers: [AutomationEngineController, AutomationsController, AgendaCallConsumer, AutomationEventConsumer],
  exports: [
    ScheduledActionService,
    ACTION_EXECUTION_QUEUE,
    AutomationsService,
    AutomationRuntimeService,
    EnrollmentService,
    AiConnectionsService,
    AutomationInstallerService,
  ],
})
export class AutomationEngineModule {}
