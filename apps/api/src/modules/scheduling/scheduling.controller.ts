import { Controller, Get, Post, Put, Patch, Delete, Body, Param, Query, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse, ApiParam, ApiQuery } from '@nestjs/swagger';
import {
  SchedulingService,
  CreateAppointmentDto,
  UpdateAppointmentDto,
  UpdateWorkScheduleDto,
  AppointmentFilters,
  AvailabilityQuery,
} from './scheduling.service';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import type { TenantContext } from '@crm/shared';

@ApiTags('Appointments')
@ApiBearerAuth()
@Controller({ path: 'appointments', version: '1' })
export class SchedulingController {
  constructor(private readonly service: SchedulingService) {}

  // ── Static routes (MUST precede :id) ─────────────────────────────────────

  @Get('metrics')
  @ApiOperation({ summary: 'Get appointment metrics: today count, week count, pending and completed totals' })
  @ApiQuery({ name: 'calendar_id', required: false, description: 'Filter metrics to a specific calendar' })
  @ApiResponse({ status: 200, description: 'AppointmentMetrics object' })
  getMetrics(
    @Query('calendar_id') calendarId: string | undefined,
    @CurrentTenant() tenant: TenantContext,
  ) {
    return this.service.getMetrics(tenant.organization_id, calendarId);
  }

  @Get('config')
  @ApiOperation({ summary: '[Legacy] Get the first active calendar schedule config (use GET /calendars/:id instead)' })
  @ApiResponse({ status: 200, description: 'Work schedule config of the first calendar' })
  getWorkSchedule(@CurrentTenant() tenant: TenantContext) {
    return this.service.getWorkSchedule(tenant.organization_id);
  }

  @Put('config')
  @ApiOperation({ summary: '[Legacy] Update the first calendar schedule config (use PUT /calendars/:id/config instead)' })
  @ApiResponse({ status: 200, description: 'Updated work schedule' })
  upsertWorkSchedule(
    @Body() dto: UpdateWorkScheduleDto,
    @CurrentTenant() tenant: TenantContext,
  ) {
    return this.service.upsertWorkSchedule(tenant.organization_id, dto);
  }

  @Get('availability')
  @ApiOperation({ summary: 'Get available appointment slots for a date range' })
  @ApiQuery({ name: 'from', required: true, description: 'Start date (ISO 8601)', example: '2026-03-23' })
  @ApiQuery({ name: 'to', required: true, description: 'End date (ISO 8601)', example: '2026-03-27' })
  @ApiQuery({ name: 'duration_minutes', required: false, description: 'Slot duration in minutes (defaults to calendar slot_duration_minutes)', example: 30 })
  @ApiQuery({ name: 'calendar_id', required: false, description: 'Calendar UUID whose schedule rules to use (defaults to first calendar)' })
  @ApiResponse({ status: 200, description: 'Array of { starts_at, ends_at } slots excluding existing appointments and buffer time' })
  @ApiResponse({ status: 400, description: 'Missing or invalid from/to dates' })
  getAvailability(
    @Query() query: AvailabilityQuery,
    @Body() body: Partial<AvailabilityQuery>,
    @CurrentTenant() tenant: TenantContext,
  ) {
    const merged: AvailabilityQuery = {
      from: query.from ?? body.from,
      to: query.to ?? body.to,
      duration_minutes: query.duration_minutes ?? body.duration_minutes,
      calendar_id: query.calendar_id ?? body.calendar_id,
    };
    return this.service.getAvailableSlots(tenant.organization_id, merged);
  }

  // ── Collection routes ─────────────────────────────────────────────────────

  @Get()
  @ApiOperation({ summary: 'List appointments for the organization' })
  @ApiQuery({ name: 'from', required: false, description: 'Filter by start date (ISO 8601)' })
  @ApiQuery({ name: 'to', required: false, description: 'Filter by end date (ISO 8601)' })
  @ApiQuery({ name: 'status', required: false, description: 'Filter by status', enum: ['pending', 'scheduled', 'confirmed', 'completed', 'cancelled', 'no_show'] })
  @ApiQuery({ name: 'calendar_id', required: false, description: 'Filter by calendar UUID' })
  @ApiQuery({ name: 'contact_id', required: false, description: 'Filter by contact UUID' })
  @ApiQuery({ name: 'limit', required: false, description: 'Page size (default 50, max 200)', example: 50 })
  @ApiQuery({ name: 'offset', required: false, description: 'Rows to skip (default 0)', example: 0 })
  @ApiQuery({ name: 'sort', required: false, description: 'starts_at order (default desc)', enum: ['asc', 'desc'] })
  @ApiQuery({ name: 'cursor', required: false, description: 'Cursor for pagination (starts_at of last item)' })
  @ApiResponse({ status: 200, description: '{ items, meta: { total, limit, offset } } with contact data' })
  findAll(@Query() filters: AppointmentFilters, @CurrentTenant() tenant: TenantContext) {
    return this.service.findAll(tenant.organization_id, filters);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new appointment. ends_at is computed from starts_at + duration_minutes' })
  @ApiResponse({ status: 201, description: 'Appointment created' })
  @ApiResponse({ status: 400, description: 'Invalid payload' })
  create(@Body() dto: CreateAppointmentDto, @CurrentTenant() tenant: TenantContext) {
    return this.service.create(tenant.organization_id, {
      ...dto,
      created_by: dto.created_by ?? tenant.user_id,
    });
  }

  // ── Param routes (MUST be last) ───────────────────────────────────────────

  @Get(':id')
  @ApiOperation({ summary: 'Get an appointment by ID' })
  @ApiParam({ name: 'id', description: 'Appointment UUID' })
  @ApiResponse({ status: 200, description: 'Appointment with contact data' })
  @ApiResponse({ status: 404, description: 'Appointment not found' })
  findOne(@Param('id') id: string, @CurrentTenant() tenant: TenantContext) {
    return this.service.findById(id, tenant.organization_id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update an appointment' })
  @ApiParam({ name: 'id', description: 'Appointment UUID' })
  @ApiResponse({ status: 200, description: 'Updated appointment' })
  @ApiResponse({ status: 404, description: 'Appointment not found' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateAppointmentDto,
    @CurrentTenant() tenant: TenantContext,
  ) {
    return this.service.update(id, tenant.organization_id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete an appointment' })
  @ApiParam({ name: 'id', description: 'Appointment UUID' })
  @ApiResponse({ status: 204, description: 'Appointment deleted' })
  @ApiResponse({ status: 404, description: 'Appointment not found' })
  delete(@Param('id') id: string, @CurrentTenant() tenant: TenantContext) {
    return this.service.delete(id, tenant.organization_id);
  }

  @Post(':id/complete')
  @ApiOperation({ summary: 'Mark an appointment as completed' })
  @ApiParam({ name: 'id', description: 'Appointment UUID' })
  @ApiResponse({ status: 201, description: 'Appointment marked as completed' })
  complete(@Param('id') id: string, @CurrentTenant() tenant: TenantContext) {
    return this.service.complete(id, tenant.organization_id);
  }

  @Post(':id/reschedule')
  @ApiOperation({ summary: 'Reschedule an appointment to a new start time. Duration is preserved.' })
  @ApiParam({ name: 'id', description: 'Appointment UUID' })
  @ApiResponse({ status: 201, description: 'Appointment rescheduled' })
  @ApiResponse({ status: 404, description: 'Appointment not found' })
  reschedule(
    @Param('id') id: string,
    @Body('new_start_time') newStartTime: string,
    @CurrentTenant() tenant: TenantContext,
  ) {
    return this.service.reschedule(id, tenant.organization_id, newStartTime);
  }

  @Patch(':id/cancel')
  @ApiOperation({ summary: 'Cancel an appointment (sets status to "cancelled")' })
  @ApiParam({ name: 'id', description: 'Appointment UUID' })
  @ApiResponse({ status: 200, description: 'Appointment cancelled' })
  cancel(@Param('id') id: string, @CurrentTenant() tenant: TenantContext) {
    return this.service.cancel(id, tenant.organization_id);
  }
}
