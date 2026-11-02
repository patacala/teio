import { Controller, Logger } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { RABBITMQ_QUEUES } from '../../infrastructure/rabbitmq/rabbitmq.constants';
import { AnalyticsService } from '../analytics/analytics.service';

interface AgentToolExecutedPayload {
  organization_id: string;
  agent_id: string;
  tool_name: string;
  execution_id?: string;
  conversation_id?: string;
  success?: boolean;
}

@Controller()
export class AIEventConsumer {
  private readonly logger = new Logger(AIEventConsumer.name);

  constructor(private readonly analyticsService: AnalyticsService) {}

  @EventPattern(RABBITMQ_QUEUES.AGENT_TOOL_EXECUTED)
  async handleAgentToolExecuted(@Payload() data: AgentToolExecutedPayload): Promise<void> {
    try {
      await this.analyticsService.track(data.organization_id, {
        event_type: 'agent.tool.executed',
        actor_id: data.agent_id,
        actor_type: 'ai_agent',
        resource_id: data.execution_id,
        resource_type: 'tool_execution',
        properties: {
          tool_name: data.tool_name,
          conversation_id: data.conversation_id,
          success: data.success,
        },
      });
      this.logger.debug(`Tracked agent.tool.executed: ${data.tool_name} by agent ${data.agent_id}`);
    } catch (err) {
      this.logger.warn(`Failed to handle agent.tool.executed: ${(err as Error).message}`);
    }
  }
}
