import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { randomBytes, randomUUID } from 'crypto';
import { IsString, IsOptional, IsNotEmpty, MaxLength } from 'class-validator';
import { ChannelType } from '@crm/shared';
import type {
  WhatsAppSessionState,
  WhatsAppQrResponse,
  WhatsAppSessionStatus,
} from '@crm/shared';
import { ChannelEntity } from './channel.entity';
import { ChannelsService } from './channels.service';
import { WahaService } from '../../infrastructure/waha/waha.service';

export const WAHA_PROVIDER = 'waha';

export class CreateWhatsAppSessionDto {
  /** Optional human label shown in the UI (e.g. "Ventas", "Soporte"). */
  @IsOptional() @IsString() @MaxLength(100)
  label?: string;
}

export class RequestPairingCodeDto {
  /** Phone number in international format, digits only (e.g. 5215512345678). */
  @IsString() @IsNotEmpty() @MaxLength(20)
  phone_number: string;
}

@Injectable()
export class WahaChannelService {
  private readonly logger = new Logger(WahaChannelService.name);

  constructor(
    @InjectRepository(ChannelEntity)
    private readonly channelRepo: Repository<ChannelEntity>,
    private readonly channelsService: ChannelsService,
    private readonly waha: WahaService,
    private readonly config: ConfigService,
  ) {}

  /**
   * WAHA only needs to reach us, not the public internet, so this prefers the
   * internal address when WAHA is co-located (same Docker network). Falls back
   * to the public BASE_URL when WAHA_WEBHOOK_BASE_URL is unset.
   */
  private webhookUrl(): string {
    const base =
      this.config.get<string>('waha.webhookBaseUrl') ||
      this.config.get<string>('webhooks.baseUrl', 'http://localhost:3001');
    return `${base}/api/v1/webhooks/channel/${ChannelType.WHATSAPP}`;
  }

  private toState(channel: ChannelEntity): WhatsAppSessionState {
    const cfg = channel.config as Record<string, unknown>;
    const status = (cfg.session_status as WhatsAppSessionStatus) ?? 'STOPPED';
    return {
      channel_id: channel.id,
      session_name: channel.external_identifier,
      status,
      phone_number: (cfg.phone_number as string) || null,
      push_name: (cfg.push_name as string) || null,
      connected: status === 'WORKING',
    };
  }

  /**
   * Resolves a channel by WAHA session name, **ignoring `is_active`**.
   *
   * Deliberately not `ChannelsService.findByExternalIdentifier`, which filters
   * on `is_active = true`: a channel is inactive until it reaches WORKING, so
   * filtering here would make the `session.status` webhook unable to find the
   * very channel it is meant to activate.
   */
  async findBySessionName(sessionName: string): Promise<ChannelEntity | null> {
    return this.channelRepo.findOne({
      where: {
        external_identifier: sessionName,
        type: ChannelType.WHATSAPP,
        provider: WAHA_PROVIDER,
      },
    });
  }

  private async loadScoped(id: string, orgId: string): Promise<ChannelEntity> {
    const channel = await this.channelRepo.findOne({
      where: { id, organization_id: orgId },
    });
    if (!channel) throw new NotFoundException(`Channel ${id} not found`);
    if (channel.provider !== WAHA_PROVIDER) {
      throw new BadRequestException('Channel is not a WAHA WhatsApp channel');
    }
    return channel;
  }

  /**
   * Creates the channel row first, then the WAHA session. The channel starts
   * inactive: `is_active` tracks link state, so an unlinked channel is never
   * returned by `findActiveByType` for outbound dispatch.
   */
  async createSession(
    orgId: string,
    dto: CreateWhatsAppSessionDto,
  ): Promise<WhatsAppSessionState> {
    const sessionName = `waha_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
    const hmacSecret = randomBytes(32).toString('hex');

    const channel = await this.channelRepo.save(
      this.channelRepo.create({
        organization_id: orgId,
        type: ChannelType.WHATSAPP,
        provider: WAHA_PROVIDER,
        external_identifier: sessionName,
        config: {
          session_name: sessionName,
          session_status: 'STARTING' satisfies WhatsAppSessionStatus,
          hmac_secret: hmacSecret,
          label: dto.label ?? '',
          phone_number: '',
          push_name: '',
        },
        is_active: false,
      }),
    );

    try {
      await this.waha.createSession(sessionName, this.webhookUrl(), hmacSecret, {
        'crm.organization_id': orgId,
        'crm.channel_id': channel.id,
      });
    } catch (err) {
      // Roll back the row so a WAHA outage does not leave a dead channel behind
      await this.channelRepo.remove(channel);
      throw new BadRequestException(
        `Could not start WhatsApp session: ${(err as Error).message}`,
      );
    }

    return this.toState(channel);
  }

  /**
   * Reads live state from WAHA and persists it.
   *
   * Deliberately not webhook-only: polling this endpoint makes linking work
   * even when WAHA cannot reach our webhook URL (typical in local dev). The
   * `session.status` webhook is the fast path, not the only one.
   */
  async syncFromWaha(channel: ChannelEntity): Promise<WhatsAppSessionState> {
    const session = await this.waha.findSession(channel.external_identifier);
    if (!session) {
      return this.toState(channel);
    }
    return this.applySessionState(
      channel,
      session.status,
      session.me?.id,
      session.me?.pushName,
    );
  }

  /**
   * Single writer for WAHA session state — used by both the status endpoint and
   * the `session.status` webhook, so both paths stay consistent.
   */
  async applySessionState(
    channel: ChannelEntity,
    status: WhatsAppSessionStatus,
    meId?: string | null,
    pushName?: string | null,
  ): Promise<WhatsAppSessionState> {
    const phone = WahaService.toPhoneNumber(meId);
    const cfg = { ...(channel.config as Record<string, unknown>) };

    cfg.session_status = status;
    if (phone) cfg.phone_number = phone;
    if (pushName) cfg.push_name = pushName;
    // Losing the link clears the number so the UI never shows a stale one
    if (status === 'STOPPED' || status === 'FAILED') {
      cfg.phone_number = '';
      cfg.push_name = '';
    }

    channel.config = cfg;
    channel.is_active = status === 'WORKING';

    const saved = await this.channelRepo.save(channel);
    await this.channelsService.invalidateCache(saved.id);
    return this.toState(saved);
  }

  async getStatus(id: string, orgId: string): Promise<WhatsAppSessionState> {
    return this.syncFromWaha(await this.loadScoped(id, orgId));
  }

  async getQr(id: string, orgId: string): Promise<WhatsAppQrResponse> {
    const channel = await this.loadScoped(id, orgId);
    const state = await this.syncFromWaha(channel);

    if (state.status !== 'SCAN_QR_CODE') {
      return { ...state, qr: null };
    }

    try {
      return { ...state, qr: await this.waha.getQrImage(channel.external_identifier) };
    } catch (err) {
      // QR rotates every 20-60s — a momentary miss is expected, not an error
      this.logger.warn(`QR unavailable for session ${channel.external_identifier}: ${err}`);
      return { ...state, qr: null };
    }
  }

  async requestPairingCode(
    id: string,
    orgId: string,
    phoneNumber: string,
  ): Promise<{ code: string }> {
    const channel = await this.loadScoped(id, orgId);
    const digits = phoneNumber.replace(/\D/g, '');
    if (!digits) throw new BadRequestException('phone_number must contain digits');

    try {
      return { code: await this.waha.requestPairingCode(channel.external_identifier, digits) };
    } catch (err) {
      throw new BadRequestException(
        `Could not request pairing code: ${(err as Error).message}`,
      );
    }
  }

  /** Unlinks the number but keeps the channel + session so it can be re-linked. */
  async unlink(id: string, orgId: string): Promise<WhatsAppSessionState> {
    const channel = await this.loadScoped(id, orgId);

    try {
      await this.waha.logout(channel.external_identifier);
    } catch (err) {
      this.logger.warn(`WAHA logout failed for ${channel.external_identifier}: ${err}`);
    }

    return this.applySessionState(channel, 'STOPPED');
  }

  /** Puts a logged-out session back into SCAN_QR_CODE so a new number can be linked. */
  async relink(id: string, orgId: string): Promise<WhatsAppSessionState> {
    const channel = await this.loadScoped(id, orgId);

    try {
      await this.waha.startSession(channel.external_identifier);
    } catch (err) {
      // Already-running sessions return an error we can safely ignore
      this.logger.warn(`WAHA start failed for ${channel.external_identifier}: ${err}`);
    }

    return this.syncFromWaha(channel);
  }
}
