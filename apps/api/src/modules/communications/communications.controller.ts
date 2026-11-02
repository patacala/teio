import {
  Controller, Get, Post, Patch, Delete,
  Param, Body, Query, ParseUUIDPipe, HttpCode,
} from '@nestjs/common';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { PlatformAdmin } from '../../common/decorators/platform-admin.decorator';
import { ORG_COMMUNICATION_EVENTS, PLATFORM_COMMUNICATION_EVENTS } from '@crm/shared';
import { CommunicationTemplateService } from './communication-template.service';
import { CommunicationDispatchService } from './communication-dispatch.service';
import { SmsService } from '../../infrastructure/sms/sms.service';
import { CreateTemplateDto } from './dto/create-template.dto';
import { UpdateTemplateDto } from './dto/update-template.dto';

@Controller('communications')
export class CommunicationsController {
  constructor(
    private readonly templateService: CommunicationTemplateService,
    private readonly dispatchService: CommunicationDispatchService,
    private readonly smsService: SmsService,
  ) {}

  // --- Static routes first ---

  @Get('templates/events')
  getEventTypes() {
    return ORG_COMMUNICATION_EVENTS;
  }

  @Get('templates/events/platform')
  @PlatformAdmin()
  getPlatformEventTypes() {
    return PLATFORM_COMMUNICATION_EVENTS;
  }

  // --- System template routes (platform admin only) ---

  @Get('templates/system')
  @PlatformAdmin()
  findAllSystemTemplates(
    @Query('event_type') eventType?: string,
    @Query('channel_type') channelType?: string,
  ) {
    return this.templateService.findAllSystem({
      event_type: eventType,
      channel_type: channelType,
    });
  }

  @Post('templates/system')
  @PlatformAdmin()
  createSystemTemplate(@Body() dto: CreateTemplateDto) {
    return this.templateService.createSystem(dto);
  }

  @Get('templates/system/:id')
  @PlatformAdmin()
  findSystemTemplate(@Param('id', ParseUUIDPipe) id: string) {
    return this.templateService.findSystemById(id);
  }

  @Patch('templates/system/:id')
  @PlatformAdmin()
  updateSystemTemplate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTemplateDto,
  ) {
    return this.templateService.updateSystem(id, dto);
  }

  @Delete('templates/system/:id')
  @PlatformAdmin()
  @HttpCode(204)
  async deleteSystemTemplate(@Param('id', ParseUUIDPipe) id: string) {
    await this.templateService.removeSystem(id);
  }

  // --- SMS test ---

  @Post('sms/test')
  async testSms(
    @Body() body: { to: string; text: string },
  ) {
    try {
      const result = await this.smsService.send({
        to: body.to,
        text: body.text,
      });
      return { success: true, providerId: result.providerId };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }

  // --- Org-scoped routes ---

  @Get('templates')
  findAllTemplates(
    @CurrentTenant() tenant: { organization_id: string },
    @Query('event_type') eventType?: string,
    @Query('channel_type') channelType?: string,
  ) {
    return this.templateService.findAll(tenant.organization_id, {
      event_type: eventType,
      channel_type: channelType,
    });
  }

  @Post('templates')
  createTemplate(
    @CurrentTenant() tenant: { organization_id: string },
    @Body() dto: CreateTemplateDto,
  ) {
    return this.templateService.create(tenant.organization_id, dto);
  }

  @Get('deliveries')
  async findDeliveries(
    @CurrentTenant() tenant: { organization_id: string },
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const p = Math.max(1, parseInt(page ?? '1', 10) || 1);
    const l = Math.min(100, Math.max(1, parseInt(limit ?? '20', 10) || 20));
    const { items, total } = await this.dispatchService.findDeliveries(tenant.organization_id, p, l);
    return {
      items,
      meta: {
        total,
        page: p,
        limit: l,
        totalPages: Math.ceil(total / l),
      },
    };
  }

  // --- Param routes ---

  @Get('templates/:id')
  findTemplate(
    @CurrentTenant() tenant: { organization_id: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.templateService.findByIdScoped(id, tenant.organization_id);
  }

  @Patch('templates/:id')
  updateTemplate(
    @CurrentTenant() tenant: { organization_id: string },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTemplateDto,
  ) {
    return this.templateService.update(id, tenant.organization_id, dto);
  }

  @Delete('templates/:id')
  async deleteTemplate(
    @CurrentTenant() tenant: { organization_id: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.templateService.remove(id, tenant.organization_id);
    return { deleted: true };
  }
}
