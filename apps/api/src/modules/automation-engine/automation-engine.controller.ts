import {
  Controller, Get, Post, Patch, Put, Delete, Param, Body, Query,
  NotFoundException, HttpCode, HttpStatus,
} from '@nestjs/common';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import type { TenantContext } from '@crm/shared';
import { AutomatedAppointmentService } from './automated-appointment.service';
import { AutomationSequenceService } from './automation-sequence.service';
import type { CreateAutomatedAppointmentInput, CreateSequenceInput } from '@crm/shared';

@Controller('automation')
export class AutomationEngineController {
  constructor(
    private readonly service: AutomatedAppointmentService,
    private readonly sequenceService: AutomationSequenceService,
  ) {}

  // ── Sequences (BEFORE follow-ups/:id to avoid route conflicts) ──

  @Post('sequences')
  async createSequence(@CurrentTenant() tenant: TenantContext, @Body() body: CreateSequenceInput) {
    return this.sequenceService.create(tenant.organization_id, body);
  }

  @Get('sequences')
  async listSequences(
    @CurrentTenant() tenant: TenantContext,
    @Query('status') status?: string,
    @Query('contact_id') contact_id?: string,
    @Query('sequence_type') sequence_type?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.sequenceService.findAll(tenant.organization_id, {
      status,
      contact_id,
      sequence_type,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }

  // ── Sequence templates (MUST precede sequences/:id) ──

  @Get('sequences/templates')
  async listTemplates(@CurrentTenant() tenant: TenantContext) {
    return this.sequenceService.listTemplates(tenant.organization_id);
  }

  @Get('sequences/templates/:id')
  async getTemplate(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.sequenceService.getTemplate(tenant.organization_id, id);
  }

  @Post('sequences/templates/:id/duplicate')
  async duplicateTemplate(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body() body: { name?: string },
  ) {
    return this.sequenceService.duplicateTemplate(tenant.organization_id, id, body?.name);
  }

  @Patch('sequences/templates/:id')
  async updateTemplate(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body() body: { name?: string; description?: string; is_active?: boolean },
  ) {
    return this.sequenceService.updateTemplate(tenant.organization_id, id, body);
  }

  @Put('sequences/templates/:id/steps')
  async replaceTemplateSteps(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body() body: { steps: Array<{ action: string; channel_strategy: string; delay_hours: number; config?: Record<string, unknown> }> },
  ) {
    return this.sequenceService.replaceTemplateSteps(tenant.organization_id, id, body?.steps ?? []);
  }

  @Delete('sequences/templates/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteTemplate(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    await this.sequenceService.deleteTemplate(tenant.organization_id, id);
  }

  @Get('sequences/:id/steps')
  async getSequenceSteps(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.sequenceService.getSequenceSteps(tenant.organization_id, id);
  }

  @Get('sequences/:id')
  async getSequence(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    const seq = await this.sequenceService.findById(tenant.organization_id, id);
    if (!seq) throw new NotFoundException(`Sequence ${id} not found`);
    return seq;
  }

  @Patch('sequences/:id/cancel')
  async cancelSequence(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    await this.sequenceService.cancel(tenant.organization_id, id);
    return { success: true };
  }

  @Patch('sequences/contact/:contactId/cancel-all')
  async cancelAllSequencesForContact(
    @CurrentTenant() tenant: TenantContext,
    @Param('contactId') contactId: string,
  ) {
    const count = await this.sequenceService.cancelAllForContact(tenant.organization_id, contactId, 'manual');
    return { success: true, cancelled: count };
  }

  // ── Follow-up completion (for n8n) ──

  @Post('follow-ups/:id/complete')
  async completeFollowUp(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    await this.service.completeFollowUp(tenant.organization_id, id, this.sequenceService);
    return { success: true };
  }

  // ── Follow-ups ──

  @Post('follow-ups')
  async create(@CurrentTenant() tenant: TenantContext, @Body() body: CreateAutomatedAppointmentInput) {
    return this.service.create(tenant.organization_id, body);
  }

  @Get('follow-ups')
  async list(
    @CurrentTenant() tenant: TenantContext,
    @Query('status') status?: string,
    @Query('action') action?: string,
    @Query('contact_id') contact_id?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.service.findAllFollowUps(tenant.organization_id, {
      status,
      action,
      contact_id,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }

  @Get('follow-ups/contact/:contactId')
  async byContact(
    @CurrentTenant() tenant: TenantContext,
    @Param('contactId') contactId: string,
    @Query('status') status?: string,
    @Query('action') action?: string,
  ) {
    return this.service.findByContact(tenant.organization_id, contactId, { status, action });
  }

  @Get('follow-ups/:id')
  async findOne(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    const appt = await this.service.findById(id, tenant.organization_id);
    if (!appt) throw new NotFoundException(`Follow-up ${id} not found`);
    return appt;
  }

  @Patch('follow-ups/:id/cancel')
  async cancel(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    await this.service.cancel(id, tenant.organization_id);
    return { success: true };
  }
}
