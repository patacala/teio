import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AnalyticsService } from './analytics.service';
import type { DashboardRange } from './analytics.service';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import type { TenantContext } from '@crm/shared';

@ApiTags('analytics')
@ApiBearerAuth()
@Controller({ path: 'analytics', version: '1' })
export class AnalyticsController {
  constructor(private readonly service: AnalyticsService) {}

  @Get('dashboard')
  getDashboard(
    @CurrentTenant() tenant: TenantContext,
    @Query('range') range?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const validRanges: DashboardRange[] = ['7d', '30d', '90d'];
    const safeRange: DashboardRange = validRanges.includes(range as DashboardRange)
      ? (range as DashboardRange)
      : '30d';

    const customFrom = from ? new Date(from) : undefined;
    const customTo = to ? new Date(to) : undefined;
    const validCustomRange = customFrom && customTo
      && !isNaN(customFrom.getTime()) && !isNaN(customTo.getTime())
      && customFrom <= customTo;

    return this.service.getDashboardStats(
      tenant.organization_id,
      safeRange,
      validCustomRange ? customFrom : undefined,
      validCustomRange ? customTo : undefined,
    );
  }

  @Get('overview')
  getOverview(@CurrentTenant() tenant: TenantContext) {
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - 30);
    return this.service.getEventCounts(tenant.organization_id, { from, to });
  }
}
