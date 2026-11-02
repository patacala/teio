import {
  Controller, Get, Post, Patch, Delete,
  Param, Body, ParseUUIDPipe, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { ChannelsService, CreateChannelDto, UpdateChannelDto } from './channels.service';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import type { TenantContext } from '@crm/shared';

@ApiTags('channels')
@ApiBearerAuth()
@Controller({ path: 'channels', version: '1' })
export class ChannelsController {
  constructor(private readonly channelsService: ChannelsService) {}

  @Get()
  @ApiOperation({ summary: 'List all channels for the organization' })
  @ApiResponse({ status: 200, description: 'Array of channels (config fields masked)' })
  findAll(@CurrentTenant() tenant: TenantContext) {
    return this.channelsService.findAll(tenant.organization_id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new channel integration' })
  @ApiResponse({ status: 201, description: 'Channel created' })
  @ApiResponse({ status: 400, description: 'Invalid payload' })
  create(@CurrentTenant() tenant: TenantContext, @Body() dto: CreateChannelDto) {
    return this.channelsService.create(tenant.organization_id, dto);
  }

  // Static sub-routes MUST be declared before /:id dynamic routes

  @Get(':id')
  @ApiOperation({ summary: 'Get a channel by ID' })
  @ApiParam({ name: 'id', description: 'Channel UUID' })
  @ApiResponse({ status: 200, description: 'Channel detail (sensitive config masked)' })
  @ApiResponse({ status: 404, description: 'Channel not found' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentTenant() tenant: TenantContext,
  ) {
    return this.channelsService.findByIdScoped(id, tenant.organization_id);
  }

  @Post(':id/test')
  @ApiOperation({ summary: 'Test the connection for a channel' })
  @ApiParam({ name: 'id', description: 'Channel UUID' })
  @ApiResponse({ status: 201, description: 'Connection test result' })
  @ApiResponse({ status: 400, description: 'Test failed or unsupported channel type' })
  testConnection(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentTenant() tenant: TenantContext,
  ) {
    return this.channelsService.testConnection(id, tenant.organization_id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update channel configuration' })
  @ApiParam({ name: 'id', description: 'Channel UUID' })
  @ApiResponse({ status: 200, description: 'Updated channel (config masked)' })
  @ApiResponse({ status: 404, description: 'Channel not found' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateChannelDto,
    @CurrentTenant() tenant: TenantContext,
  ) {
    return this.channelsService.update(id, tenant.organization_id, dto);
  }

  @Patch(':id/deactivate')
  @ApiOperation({ summary: 'Deactivate a channel' })
  @ApiParam({ name: 'id', description: 'Channel UUID' })
  @ApiResponse({ status: 200, description: 'Channel deactivated' })
  deactivate(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentTenant() tenant: TenantContext,
  ) {
    return this.channelsService.deactivate(id, tenant.organization_id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a channel' })
  @ApiParam({ name: 'id', description: 'Channel UUID' })
  @ApiResponse({ status: 204, description: 'Channel deleted' })
  @ApiResponse({ status: 404, description: 'Channel not found' })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentTenant() tenant: TenantContext,
  ) {
    return this.channelsService.remove(id, tenant.organization_id);
  }
}
