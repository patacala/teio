import { Controller, Get, Post, Put, Patch, Delete, Body, Param, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import {
  SchedulingService,
  CreateCalendarDto,
  UpdateCalendarDto,
  UpdateWorkScheduleDto,
} from './scheduling.service';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import type { TenantContext } from '@crm/shared';

@ApiTags('Calendars')
@ApiBearerAuth()
@Controller({ path: 'calendars', version: '1' })
export class CalendarsController {
  constructor(private readonly service: SchedulingService) {}

  @Get()
  @ApiOperation({ summary: 'List all calendars for the organization (auto-seeds defaults if none)' })
  @ApiResponse({ status: 200, description: 'Array of calendars with their schedule config' })
  listCalendars(@CurrentTenant() tenant: TenantContext) {
    return this.service.listCalendars(tenant.organization_id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new calendar' })
  @ApiResponse({ status: 201, description: 'Calendar created' })
  createCalendar(@Body() dto: CreateCalendarDto, @CurrentTenant() tenant: TenantContext) {
    return this.service.createCalendar(tenant.organization_id, dto);
  }

  @Get(':calendarId')
  @ApiOperation({ summary: 'Get a specific calendar by ID' })
  @ApiParam({ name: 'calendarId', description: 'Calendar UUID' })
  @ApiResponse({ status: 200, description: 'Calendar with schedule config' })
  @ApiResponse({ status: 404, description: 'Calendar not found' })
  getCalendar(@Param('calendarId') calendarId: string, @CurrentTenant() tenant: TenantContext) {
    return this.service.getCalendarById(tenant.organization_id, calendarId);
  }

  @Patch(':calendarId')
  @ApiOperation({ summary: 'Update calendar name, color or active state' })
  @ApiParam({ name: 'calendarId', description: 'Calendar UUID' })
  @ApiResponse({ status: 200, description: 'Updated calendar' })
  updateCalendar(
    @Param('calendarId') calendarId: string,
    @Body() dto: UpdateCalendarDto,
    @CurrentTenant() tenant: TenantContext,
  ) {
    return this.service.updateCalendar(tenant.organization_id, calendarId, dto);
  }

  @Put(':calendarId/config')
  @ApiOperation({ summary: 'Update schedule config (work days, hours, slots, buffer, timezone, blocked dates)' })
  @ApiParam({ name: 'calendarId', description: 'Calendar UUID' })
  @ApiResponse({ status: 200, description: 'Updated calendar config' })
  updateCalendarConfig(
    @Param('calendarId') calendarId: string,
    @Body() dto: UpdateWorkScheduleDto,
    @CurrentTenant() tenant: TenantContext,
  ) {
    return this.service.updateCalendarConfig(tenant.organization_id, calendarId, dto);
  }

  @Delete(':calendarId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a calendar (cannot delete the last one)' })
  @ApiParam({ name: 'calendarId', description: 'Calendar UUID' })
  @ApiResponse({ status: 204, description: 'Calendar deleted' })
  @ApiResponse({ status: 400, description: 'Cannot delete the last calendar' })
  async deleteCalendar(@Param('calendarId') calendarId: string, @CurrentTenant() tenant: TenantContext) {
    await this.service.deleteCalendar(tenant.organization_id, calendarId);
  }
}
