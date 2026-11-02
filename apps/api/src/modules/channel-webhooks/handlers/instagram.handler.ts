import { Injectable, ForbiddenException, Logger } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';
import { ChannelsService } from '../../integrations/channels.service';
import type { IChannelWebhookHandler } from '../webhook-handler.interface';
import type { IngestMessageDto } from '../../conversation-management/ingest-message.dto';

interface IgMessage {
  mid: string;
  text?: string;
}

// Instagram DMs use entry.messaging[] — same structure as Facebook Messenger
interface IgMessaging {
  sender: { id: string };
  recipient: { id: string };
  timestamp: number;
  message?: IgMessage;
}

// Instagram feed events (comments/mentions) use entry.changes[] — NOT used for DMs
interface IgChangeValue {
  sender: { id: string };
  recipient: { id: string };
  timestamp: number;
  message?: IgMessage;
}

interface IgChange {
  field: string;
  value: IgChangeValue;
}

interface IgEntry {
  id: string; // Instagram Business Account ID = channel.external_identifier
  messaging?: IgMessaging[];  // DMs arrive here
  changes?: IgChange[];       // Feed events arrive here
}

interface IgWebhookPayload {
  object: string;
  entry: IgEntry[];
}

@Injectable()
export class InstagramHandler implements IChannelWebhookHandler {
  readonly channelType = 'instagram';
  private readonly logger = new Logger(InstagramHandler.name);

  constructor(private readonly channelsService: ChannelsService) {}

  async handleVerification(query: Record<string, string>): Promise<string> {
    const { 'hub.mode': mode, 'hub.verify_token': verifyToken, 'hub.challenge': challenge } = query;

    if (mode !== 'subscribe' || !verifyToken) {
      throw new ForbiddenException('Invalid hub.mode or missing verify_token');
    }

    const channel = await this.channelsService.findByConfigValue('instagram', 'verify_token', verifyToken);
    if (!channel) {
      this.logger.warn(`Instagram verification failed — no channel with verify_token match`);
      throw new ForbiddenException('verify_token not recognized');
    }

    this.logger.log(`Instagram webhook verified for channel ${channel.id}`);
    return challenge;
  }

  async handle(
    body: unknown,
    headers: Record<string, string>,
    rawBody: Buffer | undefined,
  ): Promise<IngestMessageDto[]> {
    const payload = body as IgWebhookPayload;

    // Debug: log full payload to diagnose Meta webhook structure
    this.logger.debug(`Instagram webhook payload: ${JSON.stringify(payload)}`);

    if (payload.object !== 'instagram') return [];

    const messages: IngestMessageDto[] = [];

    for (const entry of payload.entry ?? []) {
      const igAccountId = entry.id;

      // Meta test events send id=0 — skip silently
      if (!igAccountId || igAccountId === '0') {
        this.logger.debug(`Skipping Instagram test entry (id=${igAccountId})`);
        continue;
      }

      const channel = await this.channelsService.findByExternalIdentifier(igAccountId, 'instagram', 'meta');
      if (!channel) {
        this.logger.warn(`No active instagram channel for ig_account_id=${igAccountId}. Verify the Business Account ID stored in the channel matches what Meta sends.`);
        continue;
      }

      // Optional HMAC-SHA256 signature validation
      const appSecret = channel.config?.app_secret as string | undefined;
      if (appSecret && rawBody) {
        this.validateSignature(headers['x-hub-signature-256'], rawBody, appSecret);
      }

      // Instagram DMs arrive in entry.messaging[] (same as Facebook Messenger)
      for (const event of entry.messaging ?? []) {
        if (!event.message?.text) continue;
        // Skip echo messages (sent by the page itself)
        if ((event.message as IgMessage & { is_echo?: boolean }).is_echo) continue;

        messages.push({
          channel_id: channel.id,
          channel_message_id: event.message.mid,
          content: event.message.text,
          direction: 'inbound',
          sender_type: 'user',
          sender_identifier: event.sender.id,
          sent_at: new Date(event.timestamp).toISOString(),
        });
      }

      // Also handle entry.changes[] format (some Meta setups send DMs this way)
      for (const change of entry.changes ?? []) {
        if (change.field !== 'messages') continue;
        const event = change.value;
        if (!event.message?.text) continue;

        messages.push({
          channel_id: channel.id,
          channel_message_id: event.message.mid,
          content: event.message.text,
          direction: 'inbound',
          sender_type: 'user',
          sender_identifier: event.sender.id,
          sent_at: new Date(event.timestamp * 1000).toISOString(),
        });
      }
    }

    return messages;
  }

  private validateSignature(signatureHeader: string | undefined, rawBody: Buffer, appSecret: string): void {
    if (!signatureHeader?.startsWith('sha256=')) {
      throw new ForbiddenException('Missing or invalid X-Hub-Signature-256 header');
    }
    const expected = createHmac('sha256', appSecret).update(rawBody).digest('hex');
    const received = signatureHeader.slice('sha256='.length);
    const expectedBuf = Buffer.from(expected, 'hex');
    const receivedBuf = Buffer.from(received, 'hex');
    if (expectedBuf.length !== receivedBuf.length || !timingSafeEqual(expectedBuf, receivedBuf)) {
      throw new ForbiddenException('Instagram signature mismatch');
    }
  }
}
