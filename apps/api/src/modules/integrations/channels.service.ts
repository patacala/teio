import { Injectable, NotFoundException, Inject, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IsString, IsNotEmpty, IsOptional, IsBoolean, IsObject } from 'class-validator';
import type { Redis } from 'ioredis';
import { ChannelType } from '@crm/shared';
import { ChannelEntity } from './channel.entity';
import { REDIS_CLIENT } from '../../infrastructure/redis/redis.module';
import { WahaService } from '../../infrastructure/waha/waha.service';

const CHANNEL_CACHE_TTL = 300; // seconds
const SENSITIVE_KEYS = ['api_key', 'password', 'access_token', 'api_secret', 'auth_token', 'hmac_secret'];

export class CreateChannelDto {
  @IsString() @IsNotEmpty()
  type: string;

  @IsString() @IsNotEmpty()
  provider: string;

  @IsString() @IsNotEmpty()
  external_identifier: string;

  @IsOptional() @IsObject()
  config?: Record<string, unknown>;
}

export class UpdateChannelDto {
  @IsOptional() @IsObject()
  config?: Record<string, unknown>;

  @IsOptional() @IsBoolean()
  is_active?: boolean;

  @IsOptional() @IsString()
  external_identifier?: string;
}

export interface TestConnectionResult {
  success: boolean;
  message: string;
}

@Injectable()
export class ChannelsService {
  private readonly logger = new Logger(ChannelsService.name);

  constructor(
    @InjectRepository(ChannelEntity)
    private readonly channelRepo: Repository<ChannelEntity>,
    @Inject(REDIS_CLIENT)
    private readonly redis: Redis,
    private readonly waha: WahaService,
  ) {}

  private maskConfig(config: Record<string, unknown>): Record<string, unknown> {
    const masked = { ...config };
    for (const key of SENSITIVE_KEYS) {
      if (typeof masked[key] === 'string' && (masked[key] as string).length > 0) {
        masked[key] = '***';
      }
    }
    return masked;
  }

  async findAll(organizationId: string): Promise<ChannelEntity[]> {
    const channels = await this.channelRepo.find({
      where: { organization_id: organizationId },
      order: { created_at: 'DESC' },
    });
    return channels.map((ch) => {
      ch.config = this.maskConfig(ch.config);
      return ch;
    });
  }

  async create(organizationId: string, dto: CreateChannelDto): Promise<ChannelEntity> {
    const channel = this.channelRepo.create({
      organization_id: organizationId,
      type: dto.type,
      provider: dto.provider,
      external_identifier: dto.external_identifier,
      config: dto.config ?? {},
    });
    return this.channelRepo.save(channel);
  }

  async findById(channelId: string): Promise<ChannelEntity | null> {
    const cacheKey = `channel:id:${channelId}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached) as ChannelEntity;
    }

    const channel = await this.channelRepo.findOne({ where: { id: channelId } });
    if (channel) {
      await this.redis.setex(cacheKey, CHANNEL_CACHE_TTL, JSON.stringify(channel));
    }
    return channel ?? null;
  }

  // Lookup by widget_id stored in config JSONB — used by webchat ingestion
  async findByWidgetId(widgetId: string): Promise<ChannelEntity | null> {
    const cacheKey = `channel:widget:${widgetId}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached) as ChannelEntity;
    }

    const channel = await this.channelRepo
      .createQueryBuilder('c')
      .where(`c.config->>'widget_id' = :widgetId`, { widgetId })
      .getOne();

    if (channel) {
      await this.redis.setex(cacheKey, CHANNEL_CACHE_TTL, JSON.stringify(channel));
    }
    return channel ?? null;
  }

  async findByIdScoped(id: string, organizationId: string): Promise<ChannelEntity> {
    const channel = await this.channelRepo.findOne({
      where: { id, organization_id: organizationId },
    });
    if (!channel) throw new NotFoundException(`Channel ${id} not found`);
    channel.config = this.maskConfig(channel.config);
    return channel;
  }

  async update(id: string, organizationId: string, dto: UpdateChannelDto): Promise<ChannelEntity> {
    const channel = await this.channelRepo.findOne({
      where: { id, organization_id: organizationId },
    });
    if (!channel) throw new NotFoundException(`Channel ${id} not found`);

    if (dto.config) {
      const merged = { ...channel.config };
      for (const [key, value] of Object.entries(dto.config)) {
        if (value !== '' && value !== '***') {
          merged[key] = value;
        }
      }
      channel.config = merged;
    }

    if (dto.is_active !== undefined) {
      channel.is_active = dto.is_active;
    }

    if (dto.external_identifier) {
      channel.external_identifier = dto.external_identifier;
    }

    const saved = await this.channelRepo.save(channel);
    await this.invalidateCache(id);
    saved.config = this.maskConfig(saved.config);
    return saved;
  }

  async remove(id: string, organizationId: string): Promise<void> {
    const channel = await this.channelRepo.findOne({
      where: { id, organization_id: organizationId },
    });
    if (!channel) throw new NotFoundException(`Channel ${id} not found`);

    // Drop the remote WAHA session too, otherwise it lingers holding a WhatsApp
    // link. Best-effort: a WAHA outage must not block deleting the channel.
    if (channel.provider === 'waha') {
      try {
        await this.waha.deleteSession(channel.external_identifier);
      } catch (err) {
        this.logger.warn(
          `Failed to delete WAHA session ${channel.external_identifier}: ${(err as Error).message}`,
        );
      }
    }

    await this.channelRepo.remove(channel);
    await this.invalidateCache(id);
  }

  async deactivate(channelId: string, organizationId: string): Promise<ChannelEntity> {
    const channel = await this.channelRepo.findOne({
      where: { id: channelId, organization_id: organizationId },
    });
    if (!channel) throw new NotFoundException(`Channel ${channelId} not found`);
    channel.is_active = false;
    const saved = await this.channelRepo.save(channel);
    await this.invalidateCache(channelId);
    return saved;
  }

  async testConnection(id: string, organizationId: string): Promise<TestConnectionResult> {
    const channel = await this.channelRepo.findOne({
      where: { id, organization_id: organizationId },
    });
    if (!channel) throw new NotFoundException(`Channel ${id} not found`);

    const cfg = channel.config as Record<string, string>;

    try {
      if (channel.type === 'whatsapp') {
        const session = await this.waha.findSession(channel.external_identifier);
        if (!session) {
          return { success: false, message: 'Session not found in WAHA — re-link the number' };
        }
        if (session.status === 'WORKING') {
          const phone = WahaService.toPhoneNumber(session.me?.id);
          return { success: true, message: `Connected${phone ? ` as +${phone}` : ''}` };
        }
        return { success: false, message: `Session is ${session.status} — not connected` };
      }

      if (channel.type === 'facebook') {
        const res = await fetch(
          `https://graph.facebook.com/v24.0/me?access_token=${cfg.page_access_token}`,
        );
        return res.ok
          ? { success: true, message: 'Connection successful' }
          : { success: false, message: `Graph API returned ${res.status}` };
      }

      if (channel.type === 'instagram') {
        // Instagram is connected via "Instagram API with Instagram Login"
        // (IGAA-prefixed token, tied to the IG account itself), a different
        // product from the Page-linked flow used for `facebook` above —
        // graph.facebook.com doesn't recognize this token type. See
        // outbound-dispatch.processor.ts for the same distinction on send.
        const res = await fetch(
          `https://graph.instagram.com/v21.0/me?access_token=${cfg.page_access_token}`,
        );
        return res.ok
          ? { success: true, message: 'Connection successful' }
          : { success: false, message: `Graph API returned ${res.status}` };
      }

      if (channel.type === 'sms' && channel.provider === 'twilio') {
        const creds = Buffer.from(`${cfg.account_sid}:${cfg.api_key}`).toString('base64');
        const res = await fetch(
          `https://api.twilio.com/2010-04-01/Accounts/${cfg.account_sid}.json`,
          { headers: { Authorization: `Basic ${creds}` } },
        );
        return res.ok
          ? { success: true, message: 'Connection successful' }
          : { success: false, message: `Twilio returned ${res.status}` };
      }

      if (channel.type === 'sms' && channel.provider === 'telnyx') {
        const res = await fetch('https://api.telnyx.com/v2/messaging_profiles', {
          headers: { Authorization: `Bearer ${cfg.api_key}` },
        });
        return res.ok
          ? { success: true, message: 'Connection successful' }
          : { success: false, message: `Telnyx returned ${res.status}` };
      }

      if (channel.type === 'email' && channel.provider === 'sendgrid') {
        const res = await fetch('https://api.sendgrid.com/v3/user/profile', {
          headers: { Authorization: `Bearer ${cfg.api_key}` },
        });
        return res.ok
          ? { success: true, message: 'Connection successful' }
          : { success: false, message: `SendGrid returned ${res.status}` };
      }

      if (channel.type === 'email' && channel.provider === 'resend') {
        const res = await fetch('https://api.resend.com/domains', {
          headers: { Authorization: `Bearer ${cfg.api_key}` },
        });
        return res.ok
          ? { success: true, message: 'Connection successful' }
          : { success: false, message: `Resend returned ${res.status}` };
      }

      if (channel.type === 'voice' && channel.provider === 'retell') {
        return this.testRetell(cfg);
      }

      return { success: true, message: 'Cannot test automatically. Verify credentials manually.' };
    } catch (err) {
      return { success: false, message: `Connection failed: ${(err as Error).message}` };
    }
  }

  // Generic config JSONB lookup — used by webhook handlers to resolve org from channel config
  async findByConfigValue(
    type: string,
    key: string,
    value: string,
  ): Promise<ChannelEntity | null> {
    return this.channelRepo
      .createQueryBuilder('c')
      .where('c.type = :type', { type })
      .andWhere(`c.config->>'${key}' = :value`, { value })
      .andWhere('c.is_active = true')
      .getOne();
  }

  async findByExternalIdentifier(
    externalId: string,
    type: string,
    provider: string,
  ): Promise<ChannelEntity | null> {
    return this.channelRepo.findOne({
      where: { external_identifier: externalId, type, provider, is_active: true },
    });
  }

  /**
   * One voice channel can carry two Retell agents (inbound number and outbound
   * number). Match either the dialed phone or a Retell agent id, including the
   * legacy shape where external_identifier itself was the agent id.
   */
  async findVoiceChannel(match: { number?: string; agentId?: string }): Promise<ChannelEntity | null> {
    const qb = this.channelRepo
      .createQueryBuilder('c')
      .where('c.type = :type', { type: 'voice' })
      .andWhere('c.provider = :provider', { provider: 'retell' })
      .andWhere('c.is_active = true');

    // Agent id is the primary key: the Retell agent that answered is the one
    // configured on the org's voice channel. The dialed number is a fallback.
    if (match.agentId) {
      qb.andWhere(
        `(c.external_identifier = :agentId
          OR c.config->>'inbound_agent_id' = :agentId
          OR c.config->>'outbound_agent_id' = :agentId
          OR c.config->>'agent_id' = :agentId)`,
        { agentId: match.agentId },
      );
    } else if (match.number) {
      const variants = phoneVariants(match.number);
      if (variants.length === 0) return null;
      qb.andWhere(
        `(c.external_identifier IN (:...variants)
          OR c.config->>'inbound_number' IN (:...variants)
          OR c.config->>'outbound_number' IN (:...variants))`,
        { variants },
      );
    } else {
      return null;
    }

    return qb.getOne();
  }

  // Returns the first active channel of the given type for an org — used for outbound dispatch
  async findActiveByType(orgId: string, type: string): Promise<ChannelEntity | null> {
    return this.channelRepo.findOne({
      where: { organization_id: orgId, type, is_active: true },
    });
  }

  async fetchSenderProfile(
    channelType: string,
    senderId: string,
    accessToken: string,
  ): Promise<{ name?: string; username?: string }> {
    if (channelType !== ChannelType.FACEBOOK && channelType !== ChannelType.INSTAGRAM) {
      return {};
    }

    try {
      const baseUrl = channelType === ChannelType.INSTAGRAM
        ? 'https://graph.instagram.com'
        : 'https://graph.facebook.com';
      const fields = channelType === ChannelType.INSTAGRAM ? 'name,username' : 'name';
      const res = await fetch(
        `${baseUrl}/${senderId}?fields=${fields}&access_token=${accessToken}`,
      );
      if (!res.ok) return {};
      return (await res.json()) as { name?: string; username?: string };
    } catch (err) {
      this.logger.warn(`Failed to fetch sender profile for ${channelType}/${senderId}: ${err}`);
      return {};
    }
  }

  async invalidateCache(channelId: string): Promise<void> {
    await this.redis.del(`channel:id:${channelId}`);
  }

  private async testRetell(cfg: Record<string, string>): Promise<TestConnectionResult> {
    if (!cfg.api_key) {
      return { success: false, message: 'Falta la API key de Retell' };
    }
    const agentIds = [cfg.inbound_agent_id, cfg.outbound_agent_id, cfg.agent_id]
      .filter((id): id is string => Boolean(id))
      .filter((id, index, all) => all.indexOf(id) === index);

    if (agentIds.length === 0) {
      const res = await fetch('https://api.retellai.com/list-agents', {
        headers: { Authorization: `Bearer ${cfg.api_key}` },
      });
      return res.ok
        ? { success: true, message: 'API key válida. Falta el agent id de inbound o de outbound.' }
        : { success: false, message: `Retell returned ${res.status}` };
    }

    for (const agentId of agentIds) {
      const res = await fetch(`https://api.retellai.com/get-agent/${agentId}`, {
        headers: { Authorization: `Bearer ${cfg.api_key}` },
      });
      if (!res.ok) {
        return { success: false, message: `Agente ${agentId}: Retell returned ${res.status}` };
      }
    }
    return { success: true, message: `Conexión ok (${agentIds.join(', ')})` };
  }
}

function phoneVariants(number: string): string[] {
  const trimmed = number.trim();
  const digits = trimmed.replace(/\D/g, '');
  const variants = new Set<string>();
  if (trimmed) variants.add(trimmed);
  if (digits) {
    variants.add(digits);
    variants.add(`+${digits}`);
  }
  return [...variants];
}
