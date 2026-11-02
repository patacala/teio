import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { AutomationAgentEntity } from './entities/automation-agent.entity';
import { AgentToolEntity } from './entities/agent-tool.entity';
import { AgentToolExecutionEntity } from './entities/agent-tool-execution.entity';
import { AgentLogEntity } from './entities/agent-log.entity';
import { AgentTriggerService } from './agent-trigger.service';
import { ToolExecutionService } from './tool-execution.service';
import { AgentTriggerProcessor, AGENT_TRIGGER_QUEUE_NAME } from './agent-trigger.processor';
import { ToolExecutionProcessor, TOOL_EXECUTION_QUEUE_NAME } from './tool-execution.processor';
import { AutomationAgentsController, AutomationToolsController } from './automation-agents.controller';
import { AIToolsExecuteController } from './ai-tools-execute.controller';
import { ClientManagementModule } from '../client-management/client-management.module';
import { ConversationManagementModule } from '../conversation-management/conversation-management.module';
import { SchedulingModule } from '../scheduling/scheduling.module';
import { PaymentsModule } from '../payments/payments.module';
import { CommunicationsModule } from '../communications/communications.module';
import { AGENT_TRIGGER_QUEUE, TOOL_EXECUTION_QUEUE } from './ai-automation.constants';

export { AGENT_TRIGGER_QUEUE, TOOL_EXECUTION_QUEUE };

function redisConnectionFactory(config: ConfigService) {
  const host = config.get<string>('redis.host', 'localhost');
  const port = config.get<number>('redis.port', 6379);
  const password = config.get<string>('redis.password', '');
  return { host, port, password: password || undefined };
}

@Global()
@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([
      AutomationAgentEntity,
      AgentToolEntity,
      AgentToolExecutionEntity,
      AgentLogEntity,
    ]),
    ClientManagementModule,
    ConversationManagementModule,
    SchedulingModule,
    PaymentsModule,
    CommunicationsModule,
  ],
  providers: [
    {
      provide: AGENT_TRIGGER_QUEUE,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new Queue(AGENT_TRIGGER_QUEUE_NAME, { connection: redisConnectionFactory(config) }),
    },
    {
      provide: TOOL_EXECUTION_QUEUE,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new Queue(TOOL_EXECUTION_QUEUE_NAME, { connection: redisConnectionFactory(config) }),
    },
    AgentTriggerService,
    ToolExecutionService,
    AgentTriggerProcessor,
    ToolExecutionProcessor,
  ],
  controllers: [AutomationAgentsController, AutomationToolsController, AIToolsExecuteController],
  exports: [
    AgentTriggerService,
    ToolExecutionService,
    AGENT_TRIGGER_QUEUE,
    TOOL_EXECUTION_QUEUE,
  ],
})
export class AIAutomationModule {}
