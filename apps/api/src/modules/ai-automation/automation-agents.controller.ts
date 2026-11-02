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
import {
  CreateAutomationAgentDto,
  UpdateAutomationAgentDto,
  CreateAgentToolDto,
} from './dto/create-automation-agent.dto';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import type { TenantContext } from '@crm/shared';

@ApiTags('ai-automation')
@ApiBearerAuth()
@Controller({ path: 'ai/agents', version: '1' })
export class AutomationAgentsController {
  constructor(private readonly agentTriggerService: AgentTriggerService) {}

  @Get()
  findAll(@CurrentTenant() tenant: TenantContext) {
    return this.agentTriggerService.findAll(tenant.organization_id);
  }

  @Post()
  create(@Body() dto: CreateAutomationAgentDto, @CurrentTenant() tenant: TenantContext) {
    return this.agentTriggerService.create(tenant.organization_id, dto);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateAutomationAgentDto,
    @CurrentTenant() tenant: TenantContext,
  ) {
    return this.agentTriggerService.update(id, tenant.organization_id, dto);
  }

  @Delete(':id')
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
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { ToolExecutionService } = require('./tool-execution.service');
    return ToolExecutionService.getAvailableTools();
  }

  @Post()
  create(@Body() dto: CreateAgentToolDto, @CurrentTenant() tenant: TenantContext) {
    return this.agentTriggerService.createTool(tenant.organization_id, dto);
  }
}
