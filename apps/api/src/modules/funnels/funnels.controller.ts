import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import {
  FunnelsService,
  CreateFunnelDto,
  CreateFunnelStageDto,
  UpdateFunnelStageDto,
} from './funnels.service';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import type { TenantContext } from '@crm/shared';

@ApiTags('funnels')
@ApiBearerAuth()
@Controller({ path: 'funnels', version: '1' })
export class FunnelsController {
  constructor(private readonly service: FunnelsService) {}

  // ── Templates (static routes MUST come before /:id) ─────────────────────

  @Get('templates')
  getTemplates() {
    return this.service.getTemplates();
  }

  @Post('templates/apply')
  applyTemplate(
    @Body('template_id') templateId: string,
    @CurrentTenant() tenant: TenantContext,
  ) {
    return this.service.applyTemplate(tenant.organization_id, templateId);
  }

  // ── Funnels ──────────────────────────────────────────────────────────────

  @Get()
  getFunnels(@CurrentTenant() tenant: TenantContext) {
    return this.service.getFunnels(tenant.organization_id);
  }

  @Post()
  createFunnel(@Body() dto: CreateFunnelDto, @CurrentTenant() tenant: TenantContext) {
    return this.service.createFunnel(tenant.organization_id, dto);
  }

  // ── Stages ───────────────────────────────────────────────────────────────

  @Get('stages')
  getAllStages(@CurrentTenant() tenant: TenantContext) {
    return this.service.getAllStagesForOrg(tenant.organization_id);
  }

  @Get(':id/stages')
  getStages(@Param('id') id: string, @CurrentTenant() tenant: TenantContext) {
    return this.service.getStages(id, tenant.organization_id);
  }

  @Post(':id/stages/reorder')
  reorderStages(
    @Param('id') id: string,
    @Body('orderedIds') orderedIds: string[],
    @CurrentTenant() tenant: TenantContext,
  ) {
    return this.service.reorderStages(id, tenant.organization_id, orderedIds);
  }

  @Post(':id/stages')
  createStage(
    @Param('id') id: string,
    @Body() dto: CreateFunnelStageDto,
    @CurrentTenant() tenant: TenantContext,
  ) {
    return this.service.createStage(id, tenant.organization_id, dto);
  }

  @Patch(':id/stages/:stageId')
  updateStage(
    @Param('id') id: string,
    @Param('stageId') stageId: string,
    @Body() dto: UpdateFunnelStageDto,
    @CurrentTenant() tenant: TenantContext,
  ) {
    return this.service.updateStage(id, stageId, tenant.organization_id, dto);
  }

  @Delete(':id/stages/:stageId')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteStage(
    @Param('id') id: string,
    @Param('stageId') stageId: string,
    @CurrentTenant() tenant: TenantContext,
  ) {
    return this.service.deleteStage(id, stageId, tenant.organization_id);
  }
}
