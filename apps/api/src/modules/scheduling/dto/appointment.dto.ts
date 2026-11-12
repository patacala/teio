import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsTimeZone,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { StrictBoolean } from '../../../common/decorators/strict-boolean.decorator';

export const APPOINTMENT_STATUS_FILTERS = ['held', 'scheduled', 'confirmed', 'completed', 'cancelled', 'no_show'] as const;

/** Admin-only: book even though the calendar rules or another booking say no. */
export class AppointmentOverrideDto {
  @ApiProperty({ description: 'Why the rules are being overridden (kept on the appointment)' })
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason: string;
}

export class CreateAppointmentDto {
  @IsUUID()
  contact_id: string;

  @ApiProperty({ description: 'Calendar to book on' })
  @IsUUID()
  calendar_id: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  title: string;

  @ApiProperty({ description: 'Start instant (ISO 8601 with offset)' })
  @IsISO8601({ strict: true })
  starts_at: string;

  @Type(() => Number)
  @IsInt()
  @Min(5)
  @Max(1440)
  duration_minutes: number;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @ApiPropertyOptional({ description: 'IANA zone used in notifications; defaults to the calendar zone' })
  @IsOptional()
  @IsTimeZone()
  timezone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  location?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  meeting_url?: string;

  @IsOptional()
  @IsUUID()
  assigned_to?: string;

  @IsOptional()
  @IsUUID()
  conversation_id?: string;

  @ApiPropertyOptional({
    deprecated: true,
    description: 'Ignored: the API sets the origin from who is calling (user, API key or AI agent)',
  })
  @IsOptional()
  @IsIn(['human', 'ai', 'webhook'])
  origin?: string;

  @ApiPropertyOptional({ type: AppointmentOverrideDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => AppointmentOverrideDto)
  override?: AppointmentOverrideDto;

  @ApiPropertyOptional({ description: 'Book on a charging calendar without asking for payment (recorded)' })
  @IsOptional()
  @StrictBoolean()
  waive_payment?: boolean;
}

/** Descriptive fields only — time changes go through /reschedule, status through the action endpoints. */
export class UpdateAppointmentDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  location?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  meeting_url?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  notes?: string;
}

export class RescheduleAppointmentDto {
  @ApiPropertyOptional({ description: 'New start instant (ISO 8601)' })
  @IsOptional()
  @IsISO8601({ strict: true })
  starts_at?: string;

  @ApiPropertyOptional({ description: 'Deprecated alias of starts_at' })
  @IsOptional()
  @IsISO8601({ strict: true })
  new_start_time?: string;

  @ApiPropertyOptional({ description: 'New duration; defaults to the current one' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(5)
  @Max(1440)
  duration_minutes?: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => AppointmentOverrideDto)
  override?: AppointmentOverrideDto;
}

export class CancelAppointmentDto {
  @ApiPropertyOptional({ enum: ['staff', 'contact'], description: 'Who asked for the cancellation' })
  @IsOptional()
  @IsIn(['staff', 'contact'])
  reason?: 'staff' | 'contact';
}

export class ListAppointmentsQueryDto {
  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;

  @IsOptional()
  @IsIn(APPOINTMENT_STATUS_FILTERS)
  status?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sort?: 'asc' | 'desc';

  @IsOptional()
  @IsISO8601()
  cursor?: string;

  @IsOptional()
  @IsUUID()
  calendar_id?: string;

  @IsOptional()
  @IsUUID()
  contact_id?: string;

  @ApiPropertyOptional({ description: 'Only ended bookings nobody marked completed/no-show' })
  @IsOptional()
  @Transform(({ obj }) => (obj as Record<string, unknown>).needs_outcome === 'true' || (obj as Record<string, unknown>).needs_outcome === true)
  needs_outcome?: boolean;
}

export class AvailabilityQueryDto {
  @ApiProperty({ description: 'First local date (YYYY-MM-DD) or an ISO timestamp', example: '2026-03-23' })
  @IsString()
  @IsNotEmpty()
  from: string;

  @ApiProperty({ description: 'Last local date (inclusive)', example: '2026-03-27' })
  @IsString()
  @IsNotEmpty()
  to: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(5)
  @Max(1440)
  duration_minutes?: number;

  @ApiPropertyOptional({ description: 'Defaults to the organization appointments calendar' })
  @IsOptional()
  @IsUUID()
  calendar_id?: string;

  @ApiPropertyOptional({ description: 'Ignore this booking (when choosing a new time for it)' })
  @IsOptional()
  @IsUUID()
  exclude_appointment_id?: string;
}

export class CalendarScopeQueryDto {
  @IsOptional()
  @IsUUID()
  calendar_id?: string;
}
