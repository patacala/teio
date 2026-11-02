import { Injectable, Logger, OnModuleDestroy, OnModuleInit, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Worker, Job } from 'bullmq';
import { MessageEntity } from './message.entity';
import { ChannelsService } from '../integrations/channels.service';
import { ClientManagementService } from '../client-management/client-management.service';
import { SmsService } from '../../infrastructure/sms/sms.service';
import { WahaService } from '../../infrastructure/waha/waha.service';
import { OUTBOUND_DISPATCH_QUEUE, OUTBOUND_DISPATCH_QUEUE_NAME } from './outbound-dispatch.constants';

// This app connects Instagram via "Instagram API with Instagram Login" (IGAA-
// prefixed token, tied to the IG professional account itself — graph.instagram.com)
// and Facebook via a Page-linked token (EAA-prefixed, graph.facebook.com). The
// two products are NOT interchangeable: an IGAA token against graph.facebook.com
// fails with "(#3) Application does not have the capability to make this API
// call" (looks like a permissions/App-Review issue but isn't — it's just the
// wrong host), and either token type against the other host fails to parse.
// Confirmed 2026-09-29 directly against Graph API with the real channel
// tokens: the IGAA token gets a clean 200 from graph.instagram.com/me.
const INSTAGRAM_MESSAGES_URL = 'https://graph.instagram.com/v21.0/me/messages';
const FACEBOOK_MESSAGES_URL = (pageId: string) => `https://graph.facebook.com/v24.0/${pageId}/messages`;

/** Meta's Send API text limits — Instagram rejects the whole call over 1000 chars, Messenger over 2000. */
const INSTAGRAM_MAX_LEN = 1000;
const FACEBOOK_MAX_LEN = 2000;

/**
 * Splits long AI-generated replies into several messages instead of letting
 * Meta reject the whole send with a 400. Breaks on paragraph/sentence/space
 * boundaries so a word is never cut in half; only hard-cuts if a single
 * "word" alone exceeds maxLen.
 */
function splitForMeta(content: string, maxLen: number): string[] {
  if (content.length <= maxLen) return [content];

  const chunks: string[] = [];
  let remaining = content.trim();
  while (remaining.length > maxLen) {
    let cut = remaining.lastIndexOf('\n\n', maxLen);
    if (cut < maxLen * 0.5) cut = remaining.lastIndexOf('\n', maxLen);
    if (cut < maxLen * 0.5) cut = remaining.lastIndexOf(' ', maxLen);
    if (cut < 1) cut = maxLen; // no good boundary — hard cut
    chunks.push(remaining.slice(0, cut).trim());
    remaining = remaining.slice(cut).trim();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

export interface OutboundDispatchJobData {
  conversationId: string;
  messageId: string;
  content: string;
  organizationId: string;
  channel: string;
  contactId: string;
}

@Injectable()
export class OutboundDispatchProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboundDispatchProcessor.name);
  private worker: Worker;

  constructor(
    private readonly configService: ConfigService,
    private readonly channelsService: ChannelsService,
    private readonly clientService: ClientManagementService,
    private readonly smsService: SmsService,
    private readonly wahaService: WahaService,
    @InjectRepository(MessageEntity)
    private readonly messageRepo: Repository<MessageEntity>,
    @Inject(OUTBOUND_DISPATCH_QUEUE) private readonly _queue: unknown,
  ) {}

  onModuleInit() {
    const host = this.configService.get<string>('redis.host', 'localhost');
    const port = this.configService.get<number>('redis.port', 6379);
    const password = this.configService.get<string>('redis.password', '');

    this.worker = new Worker(
      OUTBOUND_DISPATCH_QUEUE_NAME,
      async (job: Job<OutboundDispatchJobData>) => this.process(job),
      {
        connection: { host, port, password: password || undefined },
        concurrency: 10,
      },
    );

    this.worker.on('failed', (job, err) => {
      this.logger.error(`OutboundDispatch job ${job?.id} failed: ${err.message}`, err.stack);

      // BullMQ only emits 'failed' once attempts are exhausted (a retry that
      // still has attempts left goes back to 'delayed', not 'failed') — safe
      // to mark the message as permanently failed here rather than leaving
      // it at 'pending' forever with no way to tell "not tried yet" apart
      // from "gave up after 3 attempts".
      const messageId = job?.data?.messageId;
      if (messageId) {
        this.messageRepo
          .update({ id: messageId }, { status: 'failed' })
          .catch((updateErr) =>
            this.logger.error(`Failed to mark message ${messageId} as failed: ${updateErr.message}`),
          );
      }
    });

    this.worker.on('error', (err) => {
      // Connection-level errors (e.g. Redis unreachable) — distinct from a
      // job failing. Without this, a broken Redis connection right after
      // deploy fails silently: no job ever reaches process(), so nothing
      // above ever logs either.
      this.logger.error(`OutboundDispatch worker connection error: ${err.message}`, err.stack);
    });

    this.logger.log('OutboundDispatch worker connected and listening');
  }

  async onModuleDestroy() {
    await this.worker?.close();
  }

  private async process(job: Job<OutboundDispatchJobData>): Promise<void> {
    const { channel, organizationId, messageId, content, contactId } = job.data;

    const [channelEntity, contact] = await Promise.all([
      this.channelsService.findActiveByType(organizationId, channel),
      this.clientService.findById(contactId, organizationId),
    ]);

    if (!contact) return;

    if (channel === 'sms') {
      await this.dispatchSms(channelEntity, contact, messageId, content);
      return;
    }

    if (!channelEntity) return;

    const rawToken = channelEntity.config?.page_access_token as string | undefined;
    const accessToken = rawToken?.trim();

    if (!accessToken && channel !== 'whatsapp') {
      this.logger.warn(`${channel} dispatch skipped — missing page_access_token for msg ${messageId}`);
      return;
    }

    if (channel === 'instagram') {
      await this.dispatchInstagram(channelEntity, contact, messageId, content, accessToken!);
    } else if (channel === 'whatsapp') {
      await this.dispatchWhatsApp(channelEntity, contact, messageId, content);
    } else if (channel === 'facebook') {
      await this.dispatchFacebook(channelEntity, contact, messageId, content, accessToken!);
    }
  }

  private async dispatchSms(
    channelEntity: any,
    contact: any,
    messageId: string,
    content: string,
  ): Promise<void> {
    const phone = contact.phone;
    if (!phone) {
      this.logger.warn(`SMS dispatch skipped — no phone on contact ${contact.id}`);
      return;
    }

    const apiKey = (channelEntity?.config?.api_key as string) || undefined;
    const from = (channelEntity?.config?.from_number as string) || undefined;
    const messagingProfileId = (channelEntity?.config?.messaging_profile_id as string) || undefined;

    const result = await this.smsService.send({ to: phone, text: content, apiKey, from, messagingProfileId });
    await this.messageRepo.update({ id: messageId }, { status: 'sent' });
    this.logger.log(`SMS outbound → to=${phone} telnyx_id=${result.providerId}`);
  }

  private async dispatchInstagram(
    channelEntity: any,
    contact: any,
    messageId: string,
    content: string,
    accessToken: string,
  ): Promise<void> {
    const igsid = (contact.channel_ids as Record<string, string>)?.['instagram'];
    if (!igsid) {
      this.logger.warn(`Instagram dispatch skipped — no IGSID for contact ${contact.id}`);
      return;
    }

    const parts = splitForMeta(content, INSTAGRAM_MAX_LEN);
    if (parts.length > 1) {
      this.logger.warn(`Instagram message ${messageId} is ${content.length} chars — splitting into ${parts.length} messages`);
    }

    for (const part of parts) {
      const res = await fetch(INSTAGRAM_MESSAGES_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          recipient: { id: igsid },
          message: { text: part },
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: { message?: string } };
        throw new Error(`Instagram Send API ${res.status}: ${err?.error?.message ?? JSON.stringify(err)}`);
      }
    }

    await this.messageRepo.update({ id: messageId }, { status: 'sent' });
  }

  private async dispatchWhatsApp(
    channelEntity: any,
    contact: any,
    messageId: string,
    content: string,
  ): Promise<void> {
    const waId = (contact.channel_ids as Record<string, string>)?.['whatsapp'];
    if (!waId) {
      this.logger.warn(`WhatsApp dispatch skipped — no wa_id for contact ${contact.id}`);
      return;
    }

    // external_identifier holds the WAHA session name (not the phone number),
    // because the number is unknown until the QR is scanned.
    const session = channelEntity.external_identifier as string | undefined;
    if (!session) {
      this.logger.warn(`WhatsApp dispatch skipped — no WAHA session for msg ${messageId}`);
      return;
    }

    const result = await this.wahaService.sendText(
      session,
      WahaService.toChatId(waId),
      content,
    );

    await this.messageRepo.update({ id: messageId }, { status: 'sent' });
    this.logger.log(`WhatsApp outbound → session=${session} chat=${waId} id=${result?.id ?? ''}`);
  }

  private async dispatchFacebook(
    channelEntity: any,
    contact: any,
    messageId: string,
    content: string,
    accessToken: string,
  ): Promise<void> {
    const psid = (contact.channel_ids as Record<string, string>)?.['facebook'];
    if (!psid) {
      this.logger.warn(`Facebook dispatch skipped — no PSID for contact ${contact.id}`);
      return;
    }

    const parts = splitForMeta(content, FACEBOOK_MAX_LEN);
    if (parts.length > 1) {
      this.logger.warn(`Facebook message ${messageId} is ${content.length} chars — splitting into ${parts.length} messages`);
    }

    for (const part of parts) {
      const res = await fetch(
        `${FACEBOOK_MESSAGES_URL(channelEntity.external_identifier)}?access_token=${accessToken}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            recipient: { id: psid },
            messaging_type: 'RESPONSE',
            message: { text: part },
          }),
        },
      );

      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: { message?: string } };
        throw new Error(`Facebook Send API ${res.status}: ${err?.error?.message ?? JSON.stringify(err)}`);
      }
    }

    await this.messageRepo.update({ id: messageId }, { status: 'sent' });
  }
}
