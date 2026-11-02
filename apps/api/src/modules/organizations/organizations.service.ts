import { Injectable, NotFoundException, ConflictException, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OrganizationEntity } from './organization.entity';
import { SchedulingService } from '../scheduling/scheduling.service';

export interface CreateOrganizationDto {
  name: string;
  slug: string;
  plan?: string;
  settings?: Record<string, unknown>;
}

export interface UpdateOrganizationDto {
  name?: string;
  settings?: Record<string, unknown>;
  is_active?: boolean;
}

@Injectable()
export class OrganizationsService {
  constructor(
    @InjectRepository(OrganizationEntity)
    private readonly repo: Repository<OrganizationEntity>,
    @Optional() private readonly schedulingService?: SchedulingService,
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
      plan: dto.plan ?? 'free',
      settings: dto.settings ?? {},
    });
    const saved = await this.repo.save(org);

    // Eager-seed default calendars for the new org
    await this.schedulingService?.seedDefaultCalendars(saved.id).catch(() => {});

    return saved;
  }

  async update(id: string, dto: UpdateOrganizationDto): Promise<OrganizationEntity> {
    const org = await this.findById(id);
    Object.assign(org, dto);
    return this.repo.save(org);
  }

  async updateBranding(orgId: string, branding: Record<string, unknown>): Promise<OrganizationEntity> {
    const org = await this.findById(orgId);
    const settings = (org.settings ?? {}) as Record<string, unknown>;
    settings.branding = { ...((settings.branding as Record<string, unknown>) ?? {}), ...branding };
    org.settings = settings;
    return this.repo.save(org);
  }

  async updateNotificationPreferences(
    orgId: string,
    preferences: Record<string, { enabled: boolean }>,
  ): Promise<OrganizationEntity> {
    const org = await this.findById(orgId);
    const settings = (org.settings ?? {}) as Record<string, unknown>;
    settings.notification_preferences = {
      ...((settings.notification_preferences as Record<string, unknown>) ?? {}),
      ...preferences,
    };
    org.settings = settings;
    return this.repo.save(org);
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
