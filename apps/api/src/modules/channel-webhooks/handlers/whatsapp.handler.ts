import { Injectable, ForbiddenException, Logger } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';
import { ChannelType } from '@crm/shared';
import type { WhatsAppSessionStatus } from '@crm/shared';
import { WahaChannelService } from '../../integrations/waha-channel.service';
import { WahaService } from '../../../infrastructure/waha/waha.service';
import type { IChannelWebhookHandler } from '../webhook-handler.interface';
import type { IngestMessageDto } from '../../conversation-management/ingest-message.dto';

interface WahaMessagePayload {
  id: string;
  timestamp: number;
  from: string;
  to?: string;
  fromMe: boolean;
  body?: string;
  hasMedia?: boolean;
  _data?: { notifyName?: string; pushName?: string };
}

interface WahaSessionStatusPayload {
  status: WhatsAppSessionStatus;
}

interface WahaWebhookEnvelope {
  event: string;
  session: string;
  me?: { id?: string; pushName?: string } | null;
  payload: WahaMessagePayload | WahaSessionStatusPayload;
}

/**
 * Inbound WhatsApp via WAHA (self-hosted, QR-linked).
 *
 * WAHA has no GET verification challenge, so `handleVerification` is omitted —
 * the controller answers 404 for GET, which is correct.
 */
@Injectable()
export class WhatsAppHandler implements IChannelWebhookHandler {
  readonly channelType = ChannelType.WHATSAPP;
  private readonly logger = new Logger(WhatsAppHandler.name);

  constructor(
    private readonly wahaChannels: WahaChannelService,
    private readonly waha: WahaService,
  ) {}

  async handle(
    body: unknown,
    headers: Record<string, string>,
    rawBody: Buffer | undefined,
  ): Promise<IngestMessageDto[]> {
    const envelope = body as WahaWebhookEnvelope;
    if (!envelope?.session || !envelope?.event) return [];

    // Resolved without an is_active filter on purpose — a channel is inactive
    // until WORKING, and session.status is the event that activates it.
    const channel = await this.wahaChannels.findBySessionName(envelope.session);
    if (!channel) {
      this.logger.warn(`No WAHA channel for session=${envelope.session}`);
      return [];
    }

    const hmacSecret = channel.config?.hmac_secret as string | undefined;
    if (hmacSecret) {
      this.validateSignature(headers['x-webhook-hmac'], rawBody, hmacSecret);
    }

    if (envelope.event === 'session.status') {
      const status = (envelope.payload as WahaSessionStatusPayload)?.status;
      if (status) {
        await this.wahaChannels.applySessionState(
          channel,
          status,
          envelope.me?.id,
          envelope.me?.pushName,
        );
        this.logger.log(`Session ${envelope.session} → ${status}`);
      }
      return [];
    }

    if (envelope.event !== 'message') return [];

    // Messages on an unlinked channel have nowhere to go (ingestMessage rejects
    // inactive channels anyway) — drop them quietly.
    if (!channel.is_active) {
      this.logger.warn(`Dropping message for inactive session=${envelope.session}`);
      return [];
    }

    const msg = envelope.payload as WahaMessagePayload;
    const dto = await this.toIngestDto(channel.id, envelope.session, msg);
    return dto ? [dto] : [];
  }

  private async toIngestDto(
    channelId: string,
    session: string,
    msg: WahaMessagePayload,
  ): Promise<IngestMessageDto | null> {
    // Our own outbound messages come back through this webhook — ingesting them
    // would echo every reply back into the conversation as inbound.
    if (msg.fromMe) return null;

    // Allowlist 1:1 chats only. Rejects groups (@g.us), WhatsApp Channels
    // (@newsletter) and Status updates (status@broadcast), none of which map to
    // a single contact.
    const from = msg.from ?? '';
    const isLid = from.endsWith('@lid');
    if (!from.endsWith('@c.us') && !isLid) return null;

    // Text-only for now; media messages arrive with an empty body
    const content = msg.body?.trim();
    if (!content) return null;

    // WhatsApp hides the number behind a Linked ID, so resolve it back to the
    // real phone — everything downstream (contact.phone, follow-up routing)
    // expects bare digits. When WAHA cannot resolve it we keep the `@lid`
    // suffix, which stays addressable for outbound via WahaService.toChatId.
    let senderId = WahaService.toPhoneNumber(from);
    if (isLid) {
      const phone = await this.waha.resolveLidToPhone(session, from);
      senderId = phone ?? from;
      if (!phone) {
        this.logger.warn(`Could not resolve ${from} to a phone number — using LID`);
      }
    }

    return {
      channel_id: channelId,
      channel_message_id: msg.id,
      content,
      direction: 'inbound',
      sender_type: 'user',
      sender_identifier: senderId,
      sender_display_name: msg._data?.notifyName || msg._data?.pushName || undefined,
      sent_at: new Date(msg.timestamp * 1000).toISOString(),
    };
  }

  /** WAHA signs the raw JSON body with HMAC-SHA512, hex-encoded, in X-Webhook-Hmac. */
  private validateSignature(
    signature: string | undefined,
    rawBody: Buffer | undefined,
    secret: string,
  ): void {
    if (!signature || !rawBody) {
      throw new ForbiddenException('Missing X-Webhook-Hmac header or raw body');
    }
    const expected = Buffer.from(
      createHmac('sha512', secret).update(rawBody).digest('hex'),
      'hex',
    );
    const received = Buffer.from(signature, 'hex');
    if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
      throw new ForbiddenException('WAHA webhook signature mismatch');
    }
  }
}
