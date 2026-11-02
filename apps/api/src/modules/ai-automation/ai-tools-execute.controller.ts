import { Controller, Post, Body } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ToolExecutionService } from './tool-execution.service';
import { AgentTriggerService } from './agent-trigger.service';
import { ExecuteToolDto } from './dto/execute-tool.dto';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import type { TenantContext } from '@crm/shared';

@ApiTags('ai-automation')
@ApiBearerAuth()
@Controller({ path: 'ai/tools', version: '1' })
export class AIToolsExecuteController {
  constructor(
    private readonly toolExecutionService: ToolExecutionService,
    private readonly agentTriggerService: AgentTriggerService,
  ) {}

  @Post('execute')
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  async execute(@CurrentTenant() tenant: TenantContext, @Body() dto: ExecuteToolDto) {
    // Validate agent belongs to tenant (prevent cross-tenant abuse)
    await this.agentTriggerService.findAgentById(dto.agent_id, tenant.organization_id);

    return this.toolExecutionService.execute(
      tenant.organization_id,
      dto.agent_id,
      dto.tool,
      dto.input,
      dto.conversation_id,
    );
  }
}
