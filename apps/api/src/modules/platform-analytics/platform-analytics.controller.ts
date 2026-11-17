import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type {
  PaginatedResponse,
  PlatformAttention,
  PlatformLead,
  PlatformOrganizationsPage,
  PlatformOverview,
} from '@crm/shared';
import { PlatformAdmin } from '../../common/decorators/platform-admin.decorator';
import { SkipBillingCheck } from '../billing/billing-access.decorators';
import { PlatformAnalyticsService } from './platform-analytics.service';
import {
  ListPlatformLeadsQueryDto,
  ListPlatformOrganizationsQueryDto,
  PlatformOverviewQueryDto,
} from './dto/platform-analytics.dto';

/** Super admin dashboard: money, leads and organizations across the platform (internal orgs excluded). */
@ApiTags('platform-analytics')
@ApiBearerAuth()
@PlatformAdmin()
@SkipBillingCheck()
@Controller({ path: 'platform/analytics', version: '1' })
export class PlatformAnalyticsController {
  constructor(private readonly analytics: PlatformAnalyticsService) {}

  @Get('overview')
  @ApiOperation({ summary: 'Headline figures, lead funnel and revenue by month for a period' })
  getOverview(@Query() query: PlatformOverviewQueryDto): Promise<PlatformOverview> {
    return this.analytics.getOverview(query);
  }

  @Get('attention')
  @ApiOperation({ summary: 'Organizations and leads that need action now, most urgent first' })
  getAttention(): Promise<PlatformAttention> {
    return this.analytics.getAttention();
  }

  @Get('leads')
  @ApiOperation({ summary: 'Demo requests and signups, newest first' })
  listLeads(@Query() query: ListPlatformLeadsQueryDto): Promise<PaginatedResponse<PlatformLead>> {
    return this.analytics.listLeads(query);
  }

  @Get('organizations')
  @ApiOperation({ summary: 'Organizations with their commercial state, MRR, usage and activity' })
  listOrganizations(@Query() query: ListPlatformOrganizationsQueryDto): Promise<PlatformOrganizationsPage> {
    return this.analytics.listOrganizations(query);
  }
}
