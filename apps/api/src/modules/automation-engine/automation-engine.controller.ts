import {
  Controller, Get, Post, Patch, Delete, Param, Body, Query, HttpCode, HttpStatus, ParseUUIDPipe,
} from '@nestjs/common';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import type { TenantContext } from '@crm/shared';
import { ScheduledActionService } from './scheduled-action.service';
import {
  CompleteFollowUpDto,
  CreateFollowUpDto,
  FollowUpMetricsQueryDto,
  ListFollowUpsQueryDto,
  UpdateFollowUpDto,
} from './dto/follow-up.dto';

const ID = new ParseUUIDPipe();

/** The follow-up agenda: steps people schedule or that automations hand to the team. */
@Controller('automation')
export class AutomationEngineController {
  constructor(
    private readonly actions: ScheduledActionService,
  ) {}

  // ── Follow-ups (static routes first) ──

  @Get('follow-ups/metrics')
  async metrics(@CurrentTenant() tenant: TenantContext, @Query() query: FollowUpMetricsQueryDto) {
    return this.actions.getMetrics(tenant.organization_id, query.calendar_id);
  }

  @Get('follow-ups/contact/:contactId')
  async byContact(
    @CurrentTenant() tenant: TenantContext,
    @Param('contactId', ID) contactId: string,
    @Query() query: ListFollowUpsQueryDto,
  ) {
    return this.actions.findByContact(tenant.organization_id, contactId, { status: query.status, action: query.action });
  }

  @Post('follow-ups')
  async create(@CurrentTenant() tenant: TenantContext, @Body() body: CreateFollowUpDto) {
    const byPerson = tenant.role !== 'api_key';
    return this.actions.create(tenant.organization_id, body, {
      createdBy: byPerson ? tenant.user_id ?? null : null,
      origin: byPerson ? 'human' : 'automation',
    });
  }

  @Get('follow-ups')
  async list(@CurrentTenant() tenant: TenantContext, @Query() query: ListFollowUpsQueryDto) {
    return this.actions.findAll(tenant.organization_id, query);
  }

  @Get('follow-ups/:id')
  async findOne(@CurrentTenant() tenant: TenantContext, @Param('id', ID) id: string) {
    return this.actions.findById(id, tenant.organization_id);
  }

  @Patch('follow-ups/:id')
  async update(@CurrentTenant() tenant: TenantContext, @Param('id', ID) id: string, @Body() body: UpdateFollowUpDto) {
    const { due_at, ...details } = body;
    if (due_at) await this.actions.reschedule(tenant.organization_id, id, new Date(due_at));
    if (Object.keys(details).length) return this.actions.updateDetails(tenant.organization_id, id, details);
    return this.actions.findById(id, tenant.organization_id);
  }

  /** Done by the person the step was handed to (or the integration that did it). */
  @Post('follow-ups/:id/complete')
  async completeFollowUp(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ID) id: string,
    @Body() body: CompleteFollowUpDto,
  ) {
    return this.actions.complete(tenant.organization_id, id, {
      resolvedChannel: body?.channel,
      completedBy: tenant.role === 'api_key' ? null : tenant.user_id ?? null,
    });
  }

  /** Skips the step; an automation waiting for it continues. */
  @Patch('follow-ups/:id/cancel')
  async cancel(@CurrentTenant() tenant: TenantContext, @Param('id', ID) id: string) {
    return this.actions.skip(tenant.organization_id, id);
  }

  @Delete('follow-ups/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@CurrentTenant() tenant: TenantContext, @Param('id', ID) id: string) {
    await this.actions.remove(tenant.organization_id, id);
  }
}
