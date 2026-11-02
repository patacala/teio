import {
  Controller, Get, Post, Param, Body, ParseUUIDPipe, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import {
  WahaChannelService,
  CreateWhatsAppSessionDto,
  RequestPairingCodeDto,
} from './waha-channel.service';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import type { TenantContext } from '@crm/shared';

/**
 * WhatsApp linking via WAHA.
 *
 * Registered BEFORE ChannelsController in IntegrationsModule so `channels/whatsapp/*`
 * is matched before the `channels/:id` param routes.
 */
@ApiTags('channels')
@ApiBearerAuth()
@Controller({ path: 'channels/whatsapp', version: '1' })
export class WahaChannelController {
  constructor(private readonly wahaChannels: WahaChannelService) {}

  @Post('sessions')
  @ApiOperation({ summary: 'Create a WhatsApp channel and start a WAHA session' })
  @ApiResponse({ status: 201, description: 'Session created, awaiting QR scan' })
  @ApiResponse({ status: 400, description: 'WAHA unreachable or rejected the session' })
  createSession(
    @CurrentTenant() tenant: TenantContext,
    @Body() dto: CreateWhatsAppSessionDto,
  ) {
    return this.wahaChannels.createSession(tenant.organization_id, dto);
  }

  @Get(':id/status')
  @ApiOperation({ summary: 'Get live link state of a WhatsApp channel' })
  @ApiParam({ name: 'id', description: 'Channel UUID' })
  @ApiResponse({ status: 200, description: 'Session state (synced from WAHA)' })
  getStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentTenant() tenant: TenantContext,
  ) {
    return this.wahaChannels.getStatus(id, tenant.organization_id);
  }

  @Get(':id/qr')
  @ApiOperation({ summary: 'Get the pairing QR code as a PNG data URI' })
  @ApiParam({ name: 'id', description: 'Channel UUID' })
  @ApiResponse({ status: 200, description: 'Session state plus `qr` when scannable' })
  getQr(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentTenant() tenant: TenantContext,
  ) {
    return this.wahaChannels.getQr(id, tenant.organization_id);
  }

  @Post(':id/pairing-code')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request a pairing code as an alternative to the QR' })
  @ApiParam({ name: 'id', description: 'Channel UUID' })
  @ApiResponse({ status: 200, description: 'Code to enter in the WhatsApp app' })
  requestPairingCode(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RequestPairingCodeDto,
    @CurrentTenant() tenant: TenantContext,
  ) {
    return this.wahaChannels.requestPairingCode(id, tenant.organization_id, dto.phone_number);
  }

  @Post(':id/relink')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Restart a stopped session to link a new number' })
  @ApiParam({ name: 'id', description: 'Channel UUID' })
  @ApiResponse({ status: 200, description: 'Session state after restart' })
  relink(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentTenant() tenant: TenantContext,
  ) {
    return this.wahaChannels.relink(id, tenant.organization_id);
  }

  @Post(':id/unlink')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Log out the linked number, keeping the channel' })
  @ApiParam({ name: 'id', description: 'Channel UUID' })
  @ApiResponse({ status: 200, description: 'Session state after logout' })
  unlink(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentTenant() tenant: TenantContext,
  ) {
    return this.wahaChannels.unlink(id, tenant.organization_id);
  }
}
