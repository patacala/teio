import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  ParseUUIDPipe,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional } from 'class-validator';
import { CallsService } from './calls.service';
import { TranscriptService } from './transcript.service';
import { ProsalesClientService } from '../ai-agents/prosales-client.service';
import { ClientManagementService } from '../client-management/client-management.service';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import type { TenantContext } from '@crm/shared';

class RespondDto {
  @IsString()
  @IsNotEmpty()
  call_id: string;

  @IsString()
  @IsNotEmpty()
  response_text: string;
}

class StartCallDto {
  // Either a contact to call (its phone is looked up) or an explicit number.
  @IsString()
  @IsOptional()
  contact_id?: string;

  @IsString()
  @IsOptional()
  to_number?: string;
}

@ApiTags('voice')
@ApiBearerAuth()
@Controller({ path: 'voice', version: '1' })
export class VoiceController {
  constructor(
    private readonly callsService: CallsService,
    private readonly transcriptService: TranscriptService,
    private readonly prosales: ProsalesClientService,
    private readonly contacts: ClientManagementService,
  ) {}

  // POST /voice/respond — declared BEFORE param routes
  @Post('respond')
  respond(@Body() dto: RespondDto, @CurrentTenant() tenant: TenantContext) {
    return this.callsService.respond(dto.call_id, tenant.organization_id, dto.response_text);
  }

  // POST /voice/calls — start an outbound Retell call through ProSales. ProSales
  // pulls this org's Retell credentials per-call and never stores them.
  @Post('calls')
  async startCall(@Body() dto: StartCallDto, @CurrentTenant() tenant: TenantContext) {
    let toNumber = dto.to_number;
    if (!toNumber && dto.contact_id) {
      const contact = await this.contacts.findById(dto.contact_id, tenant.organization_id);
      toNumber = contact?.phone ?? undefined;
    }
    if (!toNumber) {
      throw new BadRequestException('Provide to_number, or a contact_id that has a phone');
    }
    return this.prosales.startOutboundCall(tenant.organization_id, toNumber);
  }

  // Static route — must stay above `calls/:id` or ParseUUIDPipe rejects it.
  @Get('calls/stats')
  getStats(@CurrentTenant() tenant: TenantContext) {
    return this.callsService.getStats(tenant.organization_id);
  }

  @Get('calls')
  async findAll(
    @Query('limit') limit: string | undefined,
    @Query('offset') offset: string | undefined,
    @CurrentTenant() tenant: TenantContext,
  ) {
    const l = limit ? +limit : 20;
    const o = offset ? +offset : 0;
    const [items, total] = await this.callsService.findByOrg(tenant.organization_id, l, o);
    return { items, meta: { total, limit: l, offset: o } };
  }

  @Get('calls/:id')
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentTenant() tenant: TenantContext,
  ) {
    return this.callsService.findById(id, tenant.organization_id);
  }

  @Get('calls/:id/transcripts')
  getTranscripts(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentTenant() tenant: TenantContext,
  ) {
    return this.transcriptService.getTranscript(id, tenant.organization_id);
  }
}
