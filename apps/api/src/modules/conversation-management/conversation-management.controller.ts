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
import { CheckPlanLimit } from '../billing/billing-access.decorators';

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
  @CheckPlanLimit('conversations')
  async create(@Body() dto: CreateConversationDto, @CurrentTenant() tenant: TenantContext) {
    // Reuses the contact's open conversation on this channel instead of
    // blindly inserting — an agent starting a conversation that's already
    // open (e.g. a second click, or a message arrived in between) must land
    // on that one conversation, not fork a duplicate thread.
    const { conversation } = await this.service.findOrCreateActiveConversation(
      tenant.organization_id,
      dto.contact_id,
      '',
      dto.channel,
    );
    return conversation;
  }

  @Post(':id/messages')
  @CheckPlanLimit('messages')
  sendMessage(
    @Param('id') id: string,
    @Body() dto: SendMessageDto,
    @CurrentTenant() tenant: TenantContext,
  ) {
    // Who sent it is decided here, not by the request body: a person in the
    // inbox, or an integration calling with an API key.
    return this.service.sendMessage(id, tenant.organization_id, {
      ...dto,
      sender_type: tenant.role === 'api_key' ? 'api' : 'agent',
    });
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
