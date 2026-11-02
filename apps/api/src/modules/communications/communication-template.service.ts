import { Injectable, Logger, Inject, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import type Redis from 'ioredis';
import { PLATFORM_COMMUNICATION_EVENTS } from '@crm/shared';
import { REDIS_CLIENT } from '../../infrastructure/redis/redis.module';
import { CommunicationTemplateEntity } from './communication-template.entity';

const CACHE_TTL = 300; // 5 minutes

@Injectable()
export class CommunicationTemplateService {
  private readonly logger = new Logger(CommunicationTemplateService.name);

  constructor(
    @InjectRepository(CommunicationTemplateEntity)
    private readonly repo: Repository<CommunicationTemplateEntity>,
    @Inject(REDIS_CLIENT)
    private readonly redis: Redis,
  ) {}

  async resolveTemplate(
    orgId: string,
    eventType: string,
    channelType: string,
  ): Promise<CommunicationTemplateEntity | null> {
    const cacheKey = `comm:tpl:${orgId}:${eventType}:${channelType}`;

    try {
      const cached = await this.redis.get(cacheKey);
      if (cached) return JSON.parse(cached);
    } catch {
      /* cache miss */
    }

    // 1. Org-level template
    let template = await this.repo.findOne({
      where: { organization_id: orgId, event_type: eventType, channel_type: channelType, is_active: true },
      order: { priority: 'DESC' },
    });

    // 2. Fallback to system template
    if (!template) {
      template = await this.repo.findOne({
        where: { is_system: true, organization_id: IsNull(), event_type: eventType, channel_type: channelType, is_active: true },
        order: { priority: 'DESC' },
      }) ?? null;
    }

    if (template) {
      try {
        await this.redis.set(cacheKey, JSON.stringify(template), 'EX', CACHE_TTL);
      } catch {
        /* non-critical */
      }
    }

    return template ?? null;
  }

  async findAll(
    orgId: string,
    filters?: { event_type?: string; channel_type?: string },
  ): Promise<CommunicationTemplateEntity[]> {
    const qb = this.repo.createQueryBuilder('t')
      .where('t.organization_id = :orgId', { orgId })
      .orderBy('t.event_type', 'ASC')
      .addOrderBy('t.priority', 'DESC');

    if (filters?.event_type) {
      qb.andWhere('t.event_type = :eventType', { eventType: filters.event_type });
    }
    if (filters?.channel_type) {
      qb.andWhere('t.channel_type = :channelType', { channelType: filters.channel_type });
    }

    return qb.getMany();
  }

  async findByIdScoped(id: string, orgId: string): Promise<CommunicationTemplateEntity> {
    const t = await this.repo.findOne({ where: { id, organization_id: orgId } });
    if (!t) throw new NotFoundException('Communication template not found');
    return t;
  }

  async create(
    orgId: string,
    dto: Partial<CommunicationTemplateEntity>,
  ): Promise<CommunicationTemplateEntity> {
    if (dto.event_type && PLATFORM_COMMUNICATION_EVENTS.includes(dto.event_type as any)) {
      throw new BadRequestException(`Event type "${dto.event_type}" is a platform event and cannot be configured at org level`);
    }
    const entity = this.repo.create({ ...dto, organization_id: orgId });
    const saved = await this.repo.save(entity);
    await this.invalidateCache(orgId, saved.event_type, saved.channel_type);
    return saved;
  }

  async update(
    id: string,
    orgId: string,
    dto: Partial<CommunicationTemplateEntity>,
  ): Promise<CommunicationTemplateEntity> {
    const existing = await this.findByIdScoped(id, orgId);
    // Invalidate old cache key if event/channel changed
    await this.invalidateCache(orgId, existing.event_type, existing.channel_type);
    Object.assign(existing, dto);
    const saved = await this.repo.save(existing);
    await this.invalidateCache(orgId, saved.event_type, saved.channel_type);
    return saved;
  }

  async remove(id: string, orgId: string): Promise<void> {
    const existing = await this.findByIdScoped(id, orgId);
    await this.repo.remove(existing);
    await this.invalidateCache(orgId, existing.event_type, existing.channel_type);
  }

  // ── System template CRUD (platform admin only) ───────────────────────────

  async findAllSystem(
    filters?: { event_type?: string; channel_type?: string },
  ): Promise<CommunicationTemplateEntity[]> {
    const qb = this.repo.createQueryBuilder('t')
      .where('t.is_system = true')
      .andWhere('t.organization_id IS NULL')
      .orderBy('t.event_type', 'ASC')
      .addOrderBy('t.priority', 'DESC');

    if (filters?.event_type) {
      qb.andWhere('t.event_type = :eventType', { eventType: filters.event_type });
    }
    if (filters?.channel_type) {
      qb.andWhere('t.channel_type = :channelType', { channelType: filters.channel_type });
    }

    return qb.getMany();
  }

  async findSystemById(id: string): Promise<CommunicationTemplateEntity> {
    const t = await this.repo.findOne({ where: { id, is_system: true } });
    if (!t) throw new NotFoundException('System template not found');
    return t;
  }

  async createSystem(dto: Partial<CommunicationTemplateEntity>): Promise<CommunicationTemplateEntity> {
    const entity = this.repo.create({ ...dto, organization_id: null, is_system: true });
    return this.repo.save(entity);
  }

  async updateSystem(id: string, dto: Partial<CommunicationTemplateEntity>): Promise<CommunicationTemplateEntity> {
    const existing = await this.findSystemById(id);
    Object.assign(existing, dto);
    existing.is_system = true;
    existing.organization_id = null;
    return this.repo.save(existing);
  }

  async removeSystem(id: string): Promise<void> {
    const existing = await this.findSystemById(id);
    await this.repo.remove(existing);
  }

  private async invalidateCache(orgId: string, eventType: string, channelType: string): Promise<void> {
    try {
      await this.redis.del(`comm:tpl:${orgId}:${eventType}:${channelType}`);
    } catch {
      /* non-critical */
    }
  }
}
