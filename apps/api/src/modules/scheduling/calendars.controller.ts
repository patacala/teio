import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@crm/shared';
import type { TenantContext } from '@crm/shared';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { CalendarService } from './calendar.service';
import {
  CreateCalendarDto,
  DeleteCalendarQueryDto,
  UpdateCalendarConfigDto,
  UpdateCalendarDto,
} from './dto/calendar.dto';

const ID = new ParseUUIDPipe();

@ApiTags('Calendars')
@ApiBearerAuth()
@Controller({ path: 'calendars', version: '1' })
export class CalendarsController {
  constructor(private readonly service: CalendarService) {}

  @Get()
  @ApiOperation({ summary: 'List calendars (creates the default ones for a new organization)' })
  listCalendars(@CurrentTenant() tenant: TenantContext) {
    return this.service.listCalendars(tenant.organization_id);
  }

  @Post()
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Create a calendar (inherits the organization time zone)' })
  createCalendar(@Body() dto: CreateCalendarDto, @CurrentTenant() tenant: TenantContext) {
    return this.service.createCalendar(tenant.organization_id, dto);
  }

  @Get(':calendarId')
  @ApiParam({ name: 'calendarId', description: 'Calendar UUID' })
  getCalendar(@Param('calendarId', ID) calendarId: string, @CurrentTenant() tenant: TenantContext) {
    return this.service.getCalendarById(tenant.organization_id, calendarId);
  }

  @Patch(':calendarId')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Update name, color, active state or the service charged at booking' })
  updateCalendar(
    @Param('calendarId', ID) calendarId: string,
    @Body() dto: UpdateCalendarDto,
    @CurrentTenant() tenant: TenantContext,
  ) {
    return this.service.updateCalendar(tenant.organization_id, calendarId, dto);
  }

  @Put(':calendarId/config')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Update rules: work days, hours, slots, buffer, time zone, blocked dates, hold length' })
  updateCalendarConfig(
    @Param('calendarId', ID) calendarId: string,
    @Body() dto: UpdateCalendarConfigDto,
    @CurrentTenant() tenant: TenantContext,
  ) {
    return this.service.updateCalendarConfig(tenant.organization_id, calendarId, dto);
  }

  @Delete(':calendarId')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary:
      'Delete a calendar. Refused while it has upcoming bookings; its past appointments move to `move_to`.',
  })
  @ApiResponse({ status: 409, description: 'CALENDAR_HAS_UPCOMING_BOOKINGS, CALENDAR_MOVE_TARGET_REQUIRED or CALENDAR_IS_SYSTEM' })
  async deleteCalendar(
    @Param('calendarId', ID) calendarId: string,
    @Query() query: DeleteCalendarQueryDto,
    @CurrentTenant() tenant: TenantContext,
  ) {
    await this.service.deleteCalendar(tenant.organization_id, calendarId, query.move_to);
  }
}
