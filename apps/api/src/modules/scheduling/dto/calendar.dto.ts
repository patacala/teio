import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsTimeZone,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { StrictBoolean } from '../../../common/decorators/strict-boolean.decorator';

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const HH_MM = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export const SLOT_DURATIONS = [15, 30, 60] as const;
export const CREATABLE_CALENDAR_TYPES = ['appointments', 'custom'] as const;

export class CreateCalendarDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @IsOptional()
  @Matches(HEX_COLOR)
  color?: string;

  @ApiPropertyOptional({ enum: CREATABLE_CALENDAR_TYPES })
  @IsOptional()
  @IsIn(CREATABLE_CALENDAR_TYPES)
  type?: string;
}

export class UpdateCalendarDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @Matches(HEX_COLOR)
  color?: string;

  @IsOptional()
  @StrictBoolean()
  is_active?: boolean;

  @ApiPropertyOptional({ description: 'Service charged when booking here; null clears it', nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  payment_service_id?: string | null;

  @ApiPropertyOptional({ description: 'Staff member this calendar belongs to; null clears it', nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  owner_user_id?: string | null;
}

export class UpdateCalendarConfigDto {
  // ── Identity (optional here so the settings screen saves everything at once) ──
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @Matches(HEX_COLOR)
  color?: string;

  @IsOptional()
  @StrictBoolean()
  is_active?: boolean;

  @ApiPropertyOptional({ description: 'Service charged when booking here; null clears it', nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  payment_service_id?: string | null;

  @ApiPropertyOptional({ description: 'Staff member this calendar belongs to; null clears it', nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  owner_user_id?: string | null;

  // ── Rules ──
  @ApiPropertyOptional({ description: '0 = Sunday … 6 = Saturday', type: [Number] })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(7)
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  work_days?: number[];

  @ApiPropertyOptional({ example: '09:00' })
  @IsOptional()
  @Matches(HH_MM)
  start_time?: string;

  @ApiPropertyOptional({ example: '18:00' })
  @IsOptional()
  @Matches(HH_MM)
  end_time?: string;

  @ApiPropertyOptional({ enum: SLOT_DURATIONS })
  @IsOptional()
  @Type(() => Number)
  @IsIn(SLOT_DURATIONS)
  slot_duration_minutes?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(240)
  buffer_minutes?: number;

  @ApiPropertyOptional({ example: 'America/Mexico_City' })
  @IsOptional()
  @IsTimeZone()
  timezone?: string;

  @ApiPropertyOptional({ type: [String], example: ['2026-12-25'] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(366)
  @Matches(DATE_ONLY, { each: true })
  blocked_dates?: string[];

  @ApiPropertyOptional({ description: 'Minutes a slot stays reserved while the contact pays (30–1440)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(30)
  @Max(1440)
  hold_minutes?: number;

  @ApiPropertyOptional({ description: 'How soon a slot can be booked, in minutes (0 = any future time)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(43200)
  min_notice_minutes?: number;

  @ApiPropertyOptional({ description: 'How far ahead a slot can be booked, in days; null = no limit', nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(730)
  max_advance_days?: number | null;

  @ApiPropertyOptional({ description: 'Days of free times a contact sees when changing a booking from their link (1–60)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(60)
  contact_reschedule_days?: number;

  @ApiPropertyOptional({ description: 'Reminders before the start, in minutes (e.g. [1440, 120])', type: [Number] })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(5)
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(5, { each: true })
  @Max(20160, { each: true })
  reminder_offsets_minutes?: number[];
}

export class DeleteCalendarQueryDto {
  @ApiPropertyOptional({ description: 'Calendar that receives the past appointments of the deleted one' })
  @IsOptional()
  @IsUUID()
  move_to?: string;
}
