import { Injectable, Logger, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Redis } from 'ioredis';
import { REDIS_CLIENT } from '../redis/redis.module';

export type WahaSessionStatus =
  | 'STOPPED'
  | 'STARTING'
  | 'SCAN_QR_CODE'
  | 'PASSKEY_REQUIRED'
  | 'PASSKEY_CONFIRMATION_REQUIRED'
  | 'WORKING'
  | 'FAILED';

export interface WahaSession {
  name: string;
  status: WahaSessionStatus;
  me?: { id?: string; pushName?: string } | null;
}

/**
 * Events the CRM subscribes to when creating a session.
 *
 * `message.any` is deliberately excluded: it also fires for messages the CRM
 * itself sends, which would be re-ingested as inbound and create an echo loop.
 */
const SUBSCRIBED_EVENTS = ['message', 'session.status'];

/** lid→phone mappings are stable, so they can be cached aggressively. */
const LID_CACHE_TTL = 86_400; // 24h

@Injectable()
export class WahaService {
  private readonly logger = new Logger(WahaService.name);

  constructor(
    private readonly config: ConfigService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  private get baseUrl(): string {
    return this.config.get<string>('waha.baseUrl', 'http://localhost:3000');
  }

  private get apiKey(): string {
    return this.config.get<string>('waha.apiKey', '');
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': this.apiKey,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      this.logger.warn(`WAHA ${method} ${path} → ${res.status}: ${detail}`);
      throw new Error(`WAHA ${method} ${path} returned ${res.status}: ${detail}`);
    }

    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  async createSession(
    name: string,
    webhookUrl: string,
    hmacKey: string,
    metadata?: Record<string, string>,
  ): Promise<WahaSession> {
    return this.request<WahaSession>('POST', '/api/sessions', {
      name,
      start: true,
      config: {
        metadata,
        webhooks: [
          {
            url: webhookUrl,
            events: SUBSCRIBED_EVENTS,
            hmac: { key: hmacKey },
          },
        ],
      },
    });
  }

  async getSession(name: string): Promise<WahaSession> {
    return this.request<WahaSession>('GET', `/api/sessions/${encodeURIComponent(name)}`);
  }

  /** Returns null when the session does not exist in WAHA (e.g. wiped container). */
  async findSession(name: string): Promise<WahaSession | null> {
    try {
      return await this.getSession(name);
    } catch {
      return null;
    }
  }

  async startSession(name: string): Promise<void> {
    await this.request('POST', `/api/sessions/${encodeURIComponent(name)}/start`, {});
  }

  /**
   * Fetches the pairing QR already rendered as a PNG and returns it as a data
   * URI, so the frontend needs no QR-rendering dependency.
   */
  async getQrImage(name: string): Promise<string> {
    const res = await fetch(
      `${this.baseUrl}/api/${encodeURIComponent(name)}/auth/qr?format=image`,
      { headers: { 'X-Api-Key': this.apiKey } },
    );

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`WAHA QR fetch returned ${res.status}: ${detail}`);
    }

    const contentType = res.headers.get('content-type') ?? 'image/png';
    const buffer = Buffer.from(await res.arrayBuffer());
    return `data:${contentType};base64,${buffer.toString('base64')}`;
  }

  async requestPairingCode(name: string, phoneNumber: string): Promise<string> {
    const data = await this.request<{ code?: string }>(
      'POST',
      `/api/${encodeURIComponent(name)}/auth/request-code`,
      { phoneNumber },
    );
    return data?.code ?? '';
  }

  async logout(name: string): Promise<void> {
    await this.request('POST', `/api/sessions/${encodeURIComponent(name)}/logout`, {});
  }

  async deleteSession(name: string): Promise<void> {
    await this.request('DELETE', `/api/sessions/${encodeURIComponent(name)}`);
  }

  async sendText(session: string, chatId: string, text: string): Promise<{ id?: string }> {
    return this.request<{ id?: string }>('POST', '/api/sendText', {
      session,
      chatId,
      text,
    });
  }

  /**
   * Resolves a WhatsApp Linked ID to the real phone number.
   *
   * WhatsApp increasingly addresses users by `<id>@lid` instead of
   * `<phone>@c.us` to hide their number. Returns null when the mapping is
   * unknown — WAHA can only resolve numbers already in the account's contacts.
   */
  async resolveLidToPhone(session: string, lid: string): Promise<string | null> {
    const bareLid = WahaService.toPhoneNumber(lid);
    const cacheKey = `waha:lid:${session}:${bareLid}`;

    const cached = await this.redis.get(cacheKey);
    if (cached !== null) return cached || null;

    let phone: string | null = null;
    try {
      const res = await this.request<{ lid: string; pn: string | null }>(
        'GET',
        `/api/${encodeURIComponent(session)}/lids/${encodeURIComponent(bareLid)}`,
      );
      phone = res?.pn ? WahaService.toPhoneNumber(res.pn) : null;
    } catch (err) {
      this.logger.warn(`LID lookup failed for ${bareLid}: ${(err as Error).message}`);
      return null; // Do not cache transport failures
    }

    // Cache misses too ('' sentinel) — an unknown lid stays unknown
    await this.redis.setex(cacheKey, LID_CACHE_TTL, phone ?? '');
    return phone;
  }

  /** `5215512345678@c.us` → `5215512345678`. Safe to call on already-bare ids. */
  static toPhoneNumber(chatId: string | undefined | null): string {
    return (chatId ?? '').split('@')[0] ?? '';
  }

  /** `5215512345678` → `5215512345678@c.us`. Safe to call on already-suffixed ids. */
  static toChatId(waId: string): string {
    return waId.includes('@') ? waId : `${waId}@c.us`;
  }
}
