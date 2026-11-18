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
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { TenantContext } from '@crm/shared';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { SchedulingService } from './scheduling.service';
import { AvailabilityService } from './availability.service';
import { actorFromTenant } from './scheduling.types';
import {
  AvailabilityQueryDto,
  CalendarScopeQueryDto,
  CancelAppointmentDto,
  CreateAppointmentDto,
  ListAppointmentsQueryDto,
  RescheduleAppointmentDto,
  UpdateAppointmentDto,
} from './dto/appointment.dto';

const ID = new ParseUUIDPipe();

@ApiTags('Appointments')
@ApiBearerAuth()
@Controller({ path: 'appointments', version: '1' })
export class SchedulingController {
  constructor(
    private readonly service: SchedulingService,
    private readonly availability: AvailabilityService,
  ) {}

  // ── Static routes (MUST precede :id) ─────────────────────────────────────

  @Get('metrics')
  @ApiOperation({ summary: 'Today / this week / awaiting / completed / needs-outcome counts, in the calendar time zone' })
  getMetrics(@Query() query: CalendarScopeQueryDto, @CurrentTenant() tenant: TenantContext) {
    return this.service.getMetrics(tenant.organization_id, query.calendar_id);
  }

  @Get('availability')
  @ApiOperation({ summary: 'Free slots between two local dates of the calendar (inclusive), as UTC instants' })
  @ApiResponse({ status: 200, description: 'Array of { starts_at, ends_at }' })
  async getAvailability(@Query() query: AvailabilityQueryDto, @CurrentTenant() tenant: TenantContext) {
    const result = await this.availability.getAvailability(tenant.organization_id, query);
    return result.slots;
  }

  // ── Collection routes ─────────────────────────────────────────────────────

  @Get()
  @ApiOperation({ summary: 'List appointments' })
  findAll(@Query() query: ListAppointmentsQueryDto, @CurrentTenant() tenant: TenantContext) {
    return this.service.findAll(tenant.organization_id, query);
  }

  @Post()
  @ApiOperation({
    summary:
      'Book an appointment (awaiting the contact confirmation) or schedule a follow-up step. ' +
      'Rejected with 409 SLOT_NOT_AVAILABLE outside the calendar rules unless an admin sends `override`.',
  })
  @ApiResponse({ status: 409, description: 'SLOT_NOT_AVAILABLE or PAYMENT_REQUIRED' })
  create(@Body() dto: CreateAppointmentDto, @CurrentTenant() tenant: TenantContext) {
    return this.service.createBooking(tenant.organization_id, dto, actorFromTenant(tenant));
  }

  // ── Param routes (MUST be last) ───────────────────────────────────────────

  @Get(':id')
  @ApiParam({ name: 'id', description: 'Appointment UUID' })
  findOne(@Param('id', ID) id: string, @CurrentTenant() tenant: TenantContext) {
    return this.service.findById(id, tenant.organization_id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Edit descriptive fields. Use /reschedule for time and the action routes for status.' })
  update(@Param('id', ID) id: string, @Body() dto: UpdateAppointmentDto, @CurrentTenant() tenant: TenantContext) {
    return this.service.updateDetails(tenant.organization_id, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a follow-up step, or (admins) a past/cancelled unpaid booking' })
  delete(@Param('id', ID) id: string, @CurrentTenant() tenant: TenantContext) {
    return this.service.delete(tenant.organization_id, id, actorFromTenant(tenant));
  }

  @Post(':id/confirm')
  @ApiOperation({ summary: 'Confirm on behalf of the contact (recorded as staff confirmation)' })
  confirm(@Param('id', ID) id: string, @CurrentTenant() tenant: TenantContext) {
    return this.service.confirmByStaff(tenant.organization_id, id, actorFromTenant(tenant));
  }

  @Post(':id/resend-confirmation')
  @ApiOperation({ summary: 'Send the contact a new confirmation link' })
  resendConfirmation(@Param('id', ID) id: string, @CurrentTenant() tenant: TenantContext) {
    return this.service.resendConfirmation(tenant.organization_id, id);
  }

  @Post(':id/cancel')
  @ApiOperation({ summary: 'Cancel (the contact is notified by the booking automations).' })
  cancel(@Param('id', ID) id: string, @Body() dto: CancelAppointmentDto, @CurrentTenant() tenant: TenantContext) {
    return this.service.cancel(tenant.organization_id, id, actorFromTenant(tenant), dto.reason);
  }

  @Patch(':id/cancel')
  @ApiOperation({ summary: '[Legacy] Same as POST /:id/cancel' })
  cancelLegacy(@Param('id', ID) id: string, @CurrentTenant() tenant: TenantContext) {
    return this.service.cancel(tenant.organization_id, id, actorFromTenant(tenant));
  }

  @Post(':id/complete')
  @ApiOperation({ summary: 'Record that the appointment happened' })
  complete(@Param('id', ID) id: string, @CurrentTenant() tenant: TenantContext) {
    return this.service.complete(tenant.organization_id, id, actorFromTenant(tenant));
  }

  @Post(':id/no-show')
  @ApiOperation({ summary: 'Record that the contact did not show up' })
  noShow(@Param('id', ID) id: string, @CurrentTenant() tenant: TenantContext) {
    return this.service.markNoShow(tenant.organization_id, id, actorFromTenant(tenant));
  }

  @Post(':id/reschedule')
  @ApiOperation({ summary: 'Move to a new time (same rules as booking). The contact confirms the new time unless it is paid.' })
  reschedule(
    @Param('id', ID) id: string,
    @Body() dto: RescheduleAppointmentDto,
    @CurrentTenant() tenant: TenantContext,
  ) {
    return this.service.reschedule(tenant.organization_id, id, dto, actorFromTenant(tenant));
  }
}
