import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsISO8601, IsOptional, IsString, IsUUID, Max, MaxLength, Min, ValidateIf } from 'class-validator';
import { BILLING_PERIODS } from '@crm/shared';
import type { BillingPeriod } from '@crm/shared';

export class StartCheckoutDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  plan_id: string;

  @ApiProperty({ enum: BILLING_PERIODS })
  @IsIn(BILLING_PERIODS)
  period: BillingPeriod;
}

export class ChangePlanDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  plan_id: string;

  @ApiProperty({ enum: BILLING_PERIODS })
  @IsIn(BILLING_PERIODS)
  period: BillingPeriod;
}

export class ListInvoicesQueryDto {
  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

const MAX_LIMIT = 1_000_000_000;

/** Limits per metric: -1 = unlimited, 0 = not allowed. Omitted metrics keep their default. */
export class DemoLimitsDto {
  @ApiPropertyOptional({ minimum: -1 })
  @IsOptional()
  @IsInt()
  @Min(-1)
  @Max(MAX_LIMIT)
  conversations?: number;

  @ApiPropertyOptional({ minimum: -1 })
  @IsOptional()
  @IsInt()
  @Min(-1)
  @Max(MAX_LIMIT)
  messages?: number;

  @ApiPropertyOptional({ minimum: -1 })
  @IsOptional()
  @IsInt()
  @Min(-1)
  @Max(MAX_LIMIT)
  ai_calls?: number;

  @ApiPropertyOptional({ minimum: -1 })
  @IsOptional()
  @IsInt()
  @Min(-1)
  @Max(MAX_LIMIT)
  voice_minutes?: number;

  @ApiPropertyOptional({ minimum: -1 })
  @IsOptional()
  @IsInt()
  @Min(-1)
  @Max(MAX_LIMIT)
  agents?: number;
}

export class ListDemoOrganizationsQueryDto extends ListInvoicesQueryDto {
  @ApiPropertyOptional({ maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
}

export class UpdateDemoDefaultsDto extends DemoLimitsDto {
  /** Length of new demos in days; null = demos have no end date. */
  @ApiPropertyOptional({ minimum: 1, maximum: 365, nullable: true })
  @IsOptional()
  @ValidateIf((_dto, value) => value !== null)
  @IsInt()
  @Min(1)
  @Max(365)
  demo_duration_days?: number | null;
}

export class DemoPeriodDto {
  /** When the demo ends (ISO 8601); null = no end date ("free forever"). */
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  @ValidateIf((_dto, value) => value !== null)
  @IsISO8601({ strict: true })
  ends_at: string | null;
}
