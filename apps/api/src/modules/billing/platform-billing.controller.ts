import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { TenantContext } from '@crm/shared';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { PlatformAdmin } from '../../common/decorators/platform-admin.decorator';
import { SkipBillingCheck } from './billing-access.decorators';
import { DemoLimitsService } from './demo-limits.service';
import { DemoLimitsDto, DemoPeriodDto, ListDemoOrganizationsQueryDto, UpdateDemoDefaultsDto } from './dto/billing.dto';

/** Platform-admin management of demo (free plan) organizations. */
@ApiTags('platform-billing')
@ApiBearerAuth()
@PlatformAdmin()
@SkipBillingCheck()
@Controller({ path: 'platform/billing/demo', version: '1' })
export class PlatformBillingController {
  constructor(private readonly demoLimits: DemoLimitsService) {}

  @Get('defaults')
  @ApiOperation({ summary: 'Default limits for every demo organization' })
  getDefaults() {
    return this.demoLimits.getDefaults();
  }

  @Patch('defaults')
  @ApiOperation({ summary: 'Change the default demo limits and/or demo length (omitted fields are unchanged)' })
  updateDefaults(@Body() dto: UpdateDemoDefaultsDto) {
    const { demo_duration_days, ...limits } = dto;
    return this.demoLimits.updateDefaults(limits, demo_duration_days);
  }

  @Get('organizations')
  @ApiOperation({ summary: 'Demo organizations with their usage and limits' })
  listOrganizations(@Query() query: ListDemoOrganizationsQueryDto) {
    return this.demoLimits.listOrganizations(query.search, query.page ?? 1, query.limit ?? 20);
  }

  @Put('organizations/:organizationId/limits')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Set an organization's demo limits (omitted metrics use the defaults)" })
  @ApiResponse({ status: 409, description: 'Organization is on a paid plan' })
  setOverrides(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Body() dto: DemoLimitsDto,
    @CurrentTenant() tenant: TenantContext,
  ) {
    return this.demoLimits.setOverrides(organizationId, { ...dto }, tenant.user_id);
  }

  @Put('organizations/:organizationId/period')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Set when an organization's demo ends; null = no end date (free forever)" })
  @ApiResponse({ status: 409, description: 'Organization is on a paid plan' })
  setDemoPeriod(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Body() dto: DemoPeriodDto,
    @CurrentTenant() tenant: TenantContext,
  ) {
    return this.demoLimits.setDemoPeriod(organizationId, dto.ends_at ? new Date(dto.ends_at) : null, tenant.user_id);
  }

  @Delete('organizations/:organizationId/limits')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Reset an organization's demo limits to the defaults" })
  clearOverrides(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @CurrentTenant() tenant: TenantContext,
  ) {
    return this.demoLimits.clearOverrides(organizationId, tenant.user_id);
  }
}
