import { Controller, Get, Post, Patch, Body, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { OrganizationsService } from './organizations.service';
import { CreateOrganizationDto, UpdateOrganizationDto } from './dto/organization.dto';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { PlatformAdmin } from '../../common/decorators/platform-admin.decorator';
import { SkipBillingCheck } from '../billing/billing-access.decorators';
import { UpdateProsalesIntegrationDto } from './dto/update-prosales-integration.dto';
import type { TenantContext } from '@crm/shared';

@ApiTags('organizations')
@ApiBearerAuth()
@Controller({ path: 'organizations', version: '1' })
export class OrganizationsController {
  constructor(private readonly service: OrganizationsService) {}

  @Get()
  @PlatformAdmin()
  findAll() {
    return this.service.findAll();
  }

  @Get('me')
  @SkipBillingCheck()
  async getMyOrganization(@CurrentTenant() tenant: TenantContext) {
    const org = await this.service.findById(tenant.organization_id);
    // settings.prosales.api_key is a secret used server-side only (ai-agents
    // module calls ProSales with it) — never let it reach the browser, even
    // for org admins. Everything else in settings.prosales (base_url,
    // agent_version_id) is fine to expose.
    const settings = (org.settings ?? {}) as Record<string, unknown>;
    const prosales = settings.prosales as Record<string, unknown> | undefined;
    if (prosales?.api_key) {
      return {
        ...org,
        settings: { ...settings, prosales: { ...prosales, api_key: undefined } },
      };
    }
    return org;
  }

  @Patch('me/prosales-integration')
  updateProsalesIntegration(
    @CurrentTenant() tenant: TenantContext,
    @Body() dto: UpdateProsalesIntegrationDto,
  ) {
    return this.service.updateProsalesIntegration(tenant.organization_id, dto);
  }

  @Post()
  @PlatformAdmin()
  create(@Body() dto: CreateOrganizationDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  @PlatformAdmin()
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateOrganizationDto) {
    return this.service.update(id, dto);
  }
}
