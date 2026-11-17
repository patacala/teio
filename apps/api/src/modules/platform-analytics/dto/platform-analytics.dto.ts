import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import {
  PLATFORM_LEAD_SOURCES,
  PLATFORM_ORGANIZATION_FILTERS,
  PLATFORM_ORGANIZATION_SORTS,
  PLATFORM_RANGES,
} from '@crm/shared';
import type {
  PlatformLeadSourceFilter,
  PlatformOrganizationFilter,
  PlatformOrganizationSort,
  PlatformRange,
} from '@crm/shared';

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export class PlatformOverviewQueryDto {
  @ApiPropertyOptional({ enum: PLATFORM_RANGES, default: '30d' })
  @IsOptional()
  @IsIn(PLATFORM_RANGES)
  range?: PlatformRange;

  /** Custom period start (UTC day, inclusive); requires `to`. Overrides `range`. */
  @ApiPropertyOptional({ example: '2026-05-01' })
  @IsOptional()
  @Matches(DAY, { message: 'from must be a date (YYYY-MM-DD)' })
  from?: string;

  /** Custom period end (UTC day, inclusive); requires `from`. */
  @ApiPropertyOptional({ example: '2026-05-31' })
  @IsOptional()
  @Matches(DAY, { message: 'to must be a date (YYYY-MM-DD)' })
  to?: string;
}

class PageQueryDto {
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

  @ApiPropertyOptional({ maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
}

export class ListPlatformLeadsQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ enum: PLATFORM_LEAD_SOURCES, default: 'all' })
  @IsOptional()
  @IsIn(PLATFORM_LEAD_SOURCES)
  source?: PlatformLeadSourceFilter;
}

export class ListPlatformOrganizationsQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ enum: PLATFORM_ORGANIZATION_FILTERS, default: 'all' })
  @IsOptional()
  @IsIn(PLATFORM_ORGANIZATION_FILTERS)
  filter?: PlatformOrganizationFilter;

  @ApiPropertyOptional({ enum: PLATFORM_ORGANIZATION_SORTS, default: 'mrr' })
  @IsOptional()
  @IsIn(PLATFORM_ORGANIZATION_SORTS)
  sort?: PlatformOrganizationSort;
}
