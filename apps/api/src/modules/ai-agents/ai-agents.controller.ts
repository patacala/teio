import { Controller, Get, Post, Put, Patch, Delete, Body, Param, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import {
  AIAgentsService,
  CreateAIAgentDto,
  UpdateAIAgentDto,
  CreateCaptureFieldDto,
  UpdateCaptureFieldDto,
} from './ai-agents.service';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import type { TenantContext } from '@crm/shared';

@ApiTags('ai-agents')
@ApiBearerAuth()
@Controller({ path: 'ai-agents', version: '1' })
export class AIAgentsController {
  constructor(private readonly service: AIAgentsService) {}

  // --- ProSales-backed agent config (the real thing — one agent per org).
  // Static "config" routes MUST be declared before the ":id" routes below,
  // otherwise Express/Nest would match "config" as an :id. ---

  @Post('config/provision')
  provisionAgent(
    @CurrentTenant() tenant: TenantContext,
    @Body() body: { agent_type?: string },
  ) {
    return this.service.provisionAgent(tenant.organization_id, body?.agent_type);
  }

  @Get('config')
  getConfig(@CurrentTenant() tenant: TenantContext) {
    return this.service.getConfig(tenant.organization_id);
  }

  // Generate the whole config from a plain-language brief (ProSales LLM
  // extractor). Returns the generated config for a read-only summary; the
  // config/* PUT routes above still allow fine edits afterwards.
  @Post('config/from-brief')
  configureFromBrief(@CurrentTenant() tenant: TenantContext, @Body() body: { brief: string }) {
    return this.service.configureFromBrief(tenant.organization_id, body.brief);
  }

  @Put('config/identity')
  updateIdentity(@CurrentTenant() tenant: TenantContext, @Body() body: unknown) {
    return this.service.updateIdentity(tenant.organization_id, body);
  }

  @Put('config/personality')
  updatePersonality(@CurrentTenant() tenant: TenantContext, @Body() body: unknown) {
    return this.service.updatePersonality(tenant.organization_id, body);
  }

  @Put('config/rules')
  updateRules(@CurrentTenant() tenant: TenantContext, @Body() body: unknown) {
    return this.service.updateRules(tenant.organization_id, body);
  }

  @Put('config/strategies')
  updateStrategies(@CurrentTenant() tenant: TenantContext, @Body() body: unknown) {
    return this.service.updateStrategies(tenant.organization_id, body);
  }

  @Put('config/qualification')
  updateQualification(@CurrentTenant() tenant: TenantContext, @Body() body: unknown) {
    return this.service.updateQualification(tenant.organization_id, body);
  }

  // Knowledge is NOT managed here — see modules/knowledge/*. That module is
  // the real CRUD (with local tracking + status), and mirrors into ProSales
  // itself via ProsalesClientService. Routes used to live here too as a
  // thinner passthrough; removed to avoid two disconnected write paths into
  // the same ProSales store.

  // --- Legacy (agents.ai_agents) — kept only for useCaptureFieldLabels
  // (contacts/Kanban field labeling). Not exposed in the /config/agents UI
  // anymore. See ai-agents.service.ts note. ---

  @Get()
  findAll(@CurrentTenant() tenant: TenantContext) {
    return this.service.findAll(tenant.organization_id);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentTenant() tenant: TenantContext) {
    return this.service.findById(id, tenant.organization_id);
  }

  @Post()
  create(@Body() dto: CreateAIAgentDto, @CurrentTenant() tenant: TenantContext) {
    return this.service.create(tenant.organization_id, tenant.user_id, dto);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateAIAgentDto,
    @CurrentTenant() tenant: TenantContext,
  ) {
    return this.service.update(id, tenant.organization_id, dto);
  }

  @Patch(':id/activate')
  activate(@Param('id') id: string, @CurrentTenant() tenant: TenantContext) {
    return this.service.activate(id, tenant.organization_id);
  }

  @Patch(':id/deactivate')
  deactivate(@Param('id') id: string, @CurrentTenant() tenant: TenantContext) {
    return this.service.deactivate(id, tenant.organization_id);
  }

  @Get(':id/capture-fields')
  getCaptureFields(@Param('id') id: string, @CurrentTenant() tenant: TenantContext) {
    return this.service.getCaptureFields(id, tenant.organization_id);
  }

  @Post(':id/capture-fields/reorder')
  reorderCaptureFields(
    @Param('id') id: string,
    @Body() body: { orderedIds: string[] },
    @CurrentTenant() tenant: TenantContext,
  ) {
    return this.service.reorderCaptureFields(id, tenant.organization_id, body.orderedIds);
  }

  @Post(':id/capture-fields')
  createCaptureField(
    @Param('id') id: string,
    @Body() dto: CreateCaptureFieldDto,
    @CurrentTenant() tenant: TenantContext,
  ) {
    return this.service.createCaptureField(id, tenant.organization_id, dto);
  }

  @Patch(':id/capture-fields/:fieldId')
  updateCaptureField(
    @Param('fieldId') fieldId: string,
    @Body() dto: UpdateCaptureFieldDto,
    @CurrentTenant() tenant: TenantContext,
  ) {
    return this.service.updateCaptureField(fieldId, tenant.organization_id, dto);
  }

  @Delete(':id/capture-fields/:fieldId')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteCaptureField(
    @Param('fieldId') fieldId: string,
    @CurrentTenant() tenant: TenantContext,
  ) {
    return this.service.deleteCaptureField(fieldId, tenant.organization_id);
  }
}
