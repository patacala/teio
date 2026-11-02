import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, Query, HttpCode, HttpStatus,
} from '@nestjs/common';

import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import {
  ClientManagementService,
  CreateContactDto,
  UpdateContactDto,
} from './client-management.service';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import type { TenantContext, PaginationQuery } from '@crm/shared';

@ApiTags('contacts')
@ApiBearerAuth()
@Controller({ path: 'contacts', version: '1' })
export class ClientManagementController {
  constructor(private readonly service: ClientManagementService) {}

  @Get()
  findAll(
    @Query() query: PaginationQuery,
    @Query('stage_id') stageId: string | undefined,
    @Query('field') field: string | undefined,
    @Query('value') value: string | undefined,
    @CurrentTenant() tenant: TenantContext,
  ) {
    return this.service.findAll(tenant.organization_id, { ...query, stage_id: stageId, field, value });
  }

  @Get('stats')
  getStats(@CurrentTenant() tenant: TenantContext) {
    return this.service.getStats(tenant.organization_id);
  }

  @Get('export')
  exportContacts(@CurrentTenant() tenant: TenantContext) {
    return this.service.exportContacts(tenant.organization_id);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentTenant() tenant: TenantContext) {
    return this.service.findById(id, tenant.organization_id);
  }

  @Post()
  create(@Body() dto: CreateContactDto, @CurrentTenant() tenant: TenantContext) {
    return this.service.create(tenant.organization_id, dto, tenant.user_id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateContactDto,
    @CurrentTenant() tenant: TenantContext,
  ) {
    return this.service.update(id, tenant.organization_id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(@Param('id') id: string, @CurrentTenant() tenant: TenantContext) {
    return this.service.delete(id, tenant.organization_id);
  }

  // ── Activity timeline ────────────────────────────────────────────────
  @Get(':id/activity')
  getActivity(
    @Param('id') id: string,
    @Query('cursor') cursor: string | undefined,
    @Query('limit') limit: string | undefined,
    @CurrentTenant() tenant: TenantContext,
  ) {
    return this.service.getActivity(id, tenant.organization_id, cursor, limit ? +limit : 50);
  }

  // ── Tags ─────────────────────────────────────────────────────────────
  @Post(':id/tags')
  addTag(
    @Param('id') id: string,
    @Body('tag') tag: string,
    @CurrentTenant() tenant: TenantContext,
  ) {
    return this.service.addTag(id, tenant.organization_id, tag);
  }

  @Delete(':id/tags/:tagId')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeTag(
    @Param('id') id: string,
    @Param('tagId') tagId: string,
    @CurrentTenant() tenant: TenantContext,
  ) {
    return this.service.removeTag(id, tenant.organization_id, tagId);
  }

  // ── Captured data ────────────────────────────────────────────────────
  @Get(':id/captured-data')
  getCapturedData(@Param('id') id: string, @CurrentTenant() tenant: TenantContext) {
    return this.service.getCapturedData(id, tenant.organization_id);
  }

  @Patch(':id/captured-data')
  updateCapturedData(
    @Param('id') id: string,
    @Body('fields') fields: Record<string, string>,
    @CurrentTenant() tenant: TenantContext,
  ) {
    return this.service.updateCapturedData(id, tenant.organization_id, fields);
  }

  // ── Contact sub-resources ─────────────────────────────────────────────
  @Get(':id/messages')
  getContactConversations(@Param('id') id: string, @CurrentTenant() tenant: TenantContext) {
    return this.service.getContactConversations(id, tenant.organization_id);
  }

  @Get(':id/calls')
  getContactCalls(@Param('id') id: string, @CurrentTenant() tenant: TenantContext) {
    return this.service.getContactCalls(id, tenant.organization_id);
  }

  @Get(':id/appointments')
  getContactAppointments(@Param('id') id: string, @CurrentTenant() tenant: TenantContext) {
    return this.service.getContactAppointments(id, tenant.organization_id);
  }

  // ── Lead stage ───────────────────────────────────────────────────────
  @Patch(':id/stage')
  updateStage(
    @Param('id') id: string,
    @Body('stage_id') stageId: string,
    @CurrentTenant() tenant: TenantContext,
  ) {
    return this.service.updateStage(id, tenant.organization_id, stageId, tenant.user_id);
  }
}
