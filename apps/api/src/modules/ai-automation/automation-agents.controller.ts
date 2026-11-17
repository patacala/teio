import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AgentTriggerService } from './agent-trigger.service';
import { ToolExecutionService } from './tool-execution.service';
import {
  CreateAutomationAgentDto,
  UpdateAutomationAgentDto,
  CreateAgentToolDto,
} from './dto/create-automation-agent.dto';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import type { TenantContext } from '@crm/shared';
import { AdminOnly } from '../../common/decorators/admin-only.decorator';
import { toPublicAutomationAgent } from './automation-agent.presenter';

@ApiTags('ai-automation')
@ApiBearerAuth()
@Controller({ path: 'ai/agents', version: '1' })
export class AutomationAgentsController {
  constructor(private readonly agentTriggerService: AgentTriggerService) {}

  @Get()
  async findAll(@CurrentTenant() tenant: TenantContext) {
    const agents = await this.agentTriggerService.findAll(tenant.organization_id);
    return agents.map(toPublicAutomationAgent);
  }

  @Post()
  @AdminOnly()
  async create(@Body() dto: CreateAutomationAgentDto, @CurrentTenant() tenant: TenantContext) {
    return toPublicAutomationAgent(await this.agentTriggerService.create(tenant.organization_id, dto));
  }

  @Patch(':id')
  @AdminOnly()
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateAutomationAgentDto,
    @CurrentTenant() tenant: TenantContext,
  ) {
    return toPublicAutomationAgent(await this.agentTriggerService.update(id, tenant.organization_id, dto));
  }

  @Delete(':id')
  @AdminOnly()
  @HttpCode(HttpStatus.NO_CONTENT)
  deactivate(@Param('id') id: string, @CurrentTenant() tenant: TenantContext) {
    return this.agentTriggerService.deactivate(id, tenant.organization_id);
  }
}

@ApiTags('ai-automation')
@ApiBearerAuth()
@Controller({ path: 'ai/tools', version: '1' })
export class AutomationToolsController {
  constructor(private readonly agentTriggerService: AgentTriggerService) {}

  @Get()
  findAll(@CurrentTenant() tenant: TenantContext) {
    return this.agentTriggerService.findTools(tenant.organization_id);
  }

  @Get('built-in')
  getBuiltInTools() {
    return ToolExecutionService.getAvailableTools();
  }

  @Post()
  @AdminOnly()
  create(@Body() dto: CreateAgentToolDto, @CurrentTenant() tenant: TenantContext) {
    return this.agentTriggerService.createTool(tenant.organization_id, dto);
  }
}
