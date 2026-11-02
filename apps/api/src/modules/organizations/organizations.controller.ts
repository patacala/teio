import { Controller, Get, Post, Patch, Body, Param } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { OrganizationsService, CreateOrganizationDto, UpdateOrganizationDto } from './organizations.service';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { PlatformAdmin } from '../../common/decorators/platform-admin.decorator';
import { UpdateBrandingDto } from './dto/update-branding.dto';
import { UpdateNotificationPreferencesDto } from './dto/update-notification-preferences.dto';
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

  @Patch('me/branding')
  updateBranding(@CurrentTenant() tenant: TenantContext, @Body() dto: UpdateBrandingDto) {
    return this.service.updateBranding(tenant.organization_id, dto as unknown as Record<string, unknown>);
  }

  @Patch('me/notifications')
  updateNotifications(
    @CurrentTenant() tenant: TenantContext,
    @Body() dto: UpdateNotificationPreferencesDto,
  ) {
    return this.service.updateNotificationPreferences(tenant.organization_id, dto.preferences);
  }

  @Patch('me/prosales-integration')
  updateProsalesIntegration(
    @CurrentTenant() tenant: TenantContext,
    @Body() dto: UpdateProsalesIntegrationDto,
  ) {
    return this.service.updateProsalesIntegration(tenant.organization_id, dto);
  }

  @Patch('me/sequences')
  updateSequenceSettings(
    @CurrentTenant() tenant: TenantContext,
    @Body() dto: { enabled: boolean },
  ) {
    return this.service.updateSequenceSettings(tenant.organization_id, dto.enabled);
  }

  @Post()
  create(@Body() dto: CreateOrganizationDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateOrganizationDto) {
    return this.service.update(id, dto);
  }
}
