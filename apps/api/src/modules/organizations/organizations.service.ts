import { Injectable, NotFoundException, ConflictException, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OrganizationEntity } from './organization.entity';
import { CalendarService } from '../scheduling/calendar.service';
import { BillingAccessService } from '../billing/billing-access.service';
import { SubscriptionService } from '../billing/subscription.service';
import type { CreateOrganizationDto, UpdateOrganizationDto } from './dto/organization.dto';

@Injectable()
export class OrganizationsService {
  constructor(
    @InjectRepository(OrganizationEntity)
    private readonly repo: Repository<OrganizationEntity>,
    @Optional() private readonly calendarService?: CalendarService,
    @Optional() private readonly billingAccess?: BillingAccessService,
    @Optional() private readonly subscriptions?: SubscriptionService,
  ) {}

  async findAll(): Promise<OrganizationEntity[]> {
    return this.repo.find({ order: { name: 'ASC' } });
  }

  async findById(id: string): Promise<OrganizationEntity> {
    const org = await this.repo.findOne({ where: { id } });
    if (!org) throw new NotFoundException(`Organization ${id} not found`);
    return org;
  }

  async findBySlug(slug: string): Promise<OrganizationEntity> {
    const org = await this.repo.findOne({ where: { slug } });
    if (!org) throw new NotFoundException(`Organization with slug '${slug}' not found`);
    return org;
  }

  async create(dto: CreateOrganizationDto): Promise<OrganizationEntity> {
    const existing = await this.repo.findOne({ where: { slug: dto.slug } });
    if (existing) throw new ConflictException(`Slug '${dto.slug}' is already taken`);

    const org = this.repo.create({
      name: dto.name,
      slug: dto.slug,
      plan: 'free',
      settings: dto.settings ?? {},
    });
    const saved = await this.repo.save(org);

    // Eager-seed default calendars for the new org
    await this.calendarService?.seedDefaultCalendars(saved.id).catch(() => {});
    // Start the demo now so its end date is fixed from the day of signup.
    await this.subscriptions?.getOrCreateForOrg(saved.id).catch(() => {});

    return saved;
  }

  async update(id: string, dto: UpdateOrganizationDto): Promise<OrganizationEntity> {
    const org = await this.findById(id);
    if (dto.name !== undefined) org.name = dto.name;
    if (dto.settings !== undefined) org.settings = dto.settings;
    const activeChanged = dto.is_active !== undefined && dto.is_active !== org.is_active;
    if (dto.is_active !== undefined) org.is_active = dto.is_active;
    if (dto.is_internal !== undefined) org.is_internal = dto.is_internal;
    const saved = await this.repo.save(org);
    if (activeChanged) await this.billingAccess?.invalidate(id);
    return saved;
  }

  /** Credentials to call ProSales' Management API (identity/personality/rules/
   * strategies/knowledge) for this org's single agent. See ai-agents module,
   * which is now a thin proxy over these calls. */
  async updateProsalesIntegration(
    orgId: string,
    integration: { base_url?: string; api_key?: string; agent_version_id?: string },
  ): Promise<OrganizationEntity> {
    const org = await this.findById(orgId);
    const settings = (org.settings ?? {}) as Record<string, unknown>;
    settings.prosales = {
      ...((settings.prosales as Record<string, unknown>) ?? {}),
      ...integration,
    };
    org.settings = settings;
    return this.repo.save(org);
  }

  async getProsalesIntegration(
    orgId: string,
  ): Promise<{ base_url?: string; api_key?: string; agent_version_id?: string }> {
    const org = await this.findById(orgId);
    const settings = (org.settings ?? {}) as Record<string, unknown>;
    return (settings.prosales as Record<string, string>) ?? {};
  }

  async updateSequenceSettings(orgId: string, enabled: boolean): Promise<OrganizationEntity> {
    const org = await this.findById(orgId);
    const settings = (org.settings ?? {}) as Record<string, unknown>;
    settings.sequences_enabled = enabled;
    org.settings = settings;
    return this.repo.save(org);
  }
}
