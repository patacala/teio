import { Module, Global, Logger } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { AppointmentEntity } from '../scheduling/appointment.entity';
import { WorkScheduleEntity } from '../scheduling/work-schedule.entity';
import { ContactEntity } from '../client-management/contact.entity';
import { ConversationEntity } from '../conversation-management/conversation.entity';
import { OrganizationEntity } from '../organizations/organization.entity';
import { ConversationManagementModule } from '../conversation-management/conversation-management.module';
import { ClientManagementModule } from '../client-management/client-management.module';
import { CommunicationsModule } from '../communications/communications.module';
import { IntegrationsModule } from '../integrations/integrations.module';
import { PaymentsModule } from '../payments/payments.module';
import { AIAgentsModule } from '../ai-agents/ai-agents.module';
import { ACTION_EXECUTION_QUEUE, ACTION_EXECUTION_QUEUE_NAME } from './automation-engine.constants';
import { AutomatedAppointmentService } from './automated-appointment.service';
import { ChannelStrategyResolverService } from './channel-strategy-resolver.service';
import { ActionExecutionService } from './action-execution.service';
import { ActionExecutionProcessor } from './action-execution.processor';
import { ActionSchedulerCron } from './action-scheduler.cron';
import { AutomationEngineController } from './automation-engine.controller';
import { SendMessageHandler } from './handlers/send-message.handler';
import { SendEmailHandler } from './handlers/send-email.handler';
import { NotifyAgentHandler } from './handlers/notify-agent.handler';
import { CreateTaskHandler } from './handlers/create-task.handler';
import { CallHandler } from './handlers/call.handler';
import { AutomationSequenceEntity } from './automation-sequence.entity';
import { AutomationSequenceService } from './automation-sequence.service';
import { SequenceTemplateEntity } from './sequence-template.entity';
import { SequenceTemplateStepEntity } from './sequence-template-step.entity';
import { SequenceStepEntity } from './sequence-step.entity';
import { FollowUpContextBuilder } from './handlers/context-builder.service';
import { OutboundMessageConsumer } from './outbound-message.consumer';
import { MessageEntity } from '../conversation-management/message.entity';

const logger = new Logger('AutomationEngineModule');

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([
      AppointmentEntity,
      WorkScheduleEntity,
      ContactEntity,
      ConversationEntity,
      OrganizationEntity,
      AutomationSequenceEntity,
      SequenceTemplateEntity,
      SequenceTemplateStepEntity,
      SequenceStepEntity,
      MessageEntity,
    ]),
    ConfigModule,
    ConversationManagementModule,
    ClientManagementModule,
    CommunicationsModule,
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
    // Services
    AutomationSequenceService,
    AutomatedAppointmentService,
    ChannelStrategyResolverService,
    ActionExecutionService,
    // Processor (Phase 2: BullMQ worker, only active when Redis is available)
    ActionExecutionProcessor,
    // Scheduler
    ActionSchedulerCron,
    // Handlers
    FollowUpContextBuilder,
    SendMessageHandler,
    SendEmailHandler,
    NotifyAgentHandler,
    CreateTaskHandler,
    CallHandler,
  ],
  controllers: [AutomationEngineController, OutboundMessageConsumer],
  exports: [AutomatedAppointmentService, AutomationSequenceService, ACTION_EXECUTION_QUEUE],
})
export class AutomationEngineModule {}
