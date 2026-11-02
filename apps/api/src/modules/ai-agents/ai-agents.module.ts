import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AIAgentEntity } from './ai-agent.entity';
import { AgentCaptureFieldEntity } from './agent-capture-field.entity';
import { OrganizationsModule } from '../organizations/organizations.module';
import { AIAutomationModule } from '../ai-automation/ai-automation.module';
import { IntegrationsModule } from '../integrations/integrations.module';
import { AIAgentsService } from './ai-agents.service';
import { AIAgentsController } from './ai-agents.controller';
import { ProsalesClientService } from './prosales-client.service';
import { VoiceResolveController } from '../integrations/voice-resolve.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([AIAgentEntity, AgentCaptureFieldEntity]),
    OrganizationsModule,
    AIAutomationModule,
    IntegrationsModule,
  ],
  providers: [AIAgentsService, ProsalesClientService],
  controllers: [AIAgentsController, VoiceResolveController],
  exports: [AIAgentsService, ProsalesClientService],
})
export class AIAgentsModule {}
