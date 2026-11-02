import {
  Controller, Get, Post, Patch, Body, Param, Query,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import {
  ConversationManagementService,
  CreateConversationDto,
  SendMessageDto,
} from './conversation-management.service';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import type { TenantContext, PaginationQuery } from '@crm/shared';

@ApiTags('conversations')
@ApiBearerAuth()
@Controller({ path: 'conversations', version: '1' })
export class ConversationManagementController {
  constructor(private readonly service: ConversationManagementService) {}

  @Get()
  findAll(
    @Query() query: PaginationQuery & { status?: string; channel?: string; assigned_to?: 'ai' | 'human' },
    @CurrentTenant() tenant: TenantContext,
  ) {
    return this.service.findAll(tenant.organization_id, query);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentTenant() tenant: TenantContext) {
    return this.service.findById(id, tenant.organization_id);
  }

  @Get(':id/messages')
  getMessages(@Param('id') id: string, @CurrentTenant() tenant: TenantContext) {
    return this.service.getMessages(id, tenant.organization_id);
  }

  @Post()
  create(@Body() dto: CreateConversationDto, @CurrentTenant() tenant: TenantContext) {
    return this.service.create(tenant.organization_id, dto);
  }

  @Post(':id/messages')
  sendMessage(
    @Param('id') id: string,
    @Body() dto: SendMessageDto,
    @CurrentTenant() tenant: TenantContext,
  ) {
    return this.service.sendMessage(id, tenant.organization_id, dto);
  }

  @Patch(':id/resolve')
  resolve(@Param('id') id: string, @CurrentTenant() tenant: TenantContext) {
    return this.service.resolve(id, tenant.organization_id);
  }

  @Post(':id/handoff')
  handoff(@Param('id') id: string, @CurrentTenant() tenant: TenantContext) {
    return this.service.handoff(id, tenant.organization_id);
  }

  @Patch(':id/pin')
  setPinned(
    @Param('id') id: string,
    @Body() dto: { pinned: boolean },
    @CurrentTenant() tenant: TenantContext,
  ) {
    return this.service.setPinned(id, tenant.organization_id, dto.pinned);
  }
}
