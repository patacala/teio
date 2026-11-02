import { Injectable, ForbiddenException, Logger } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';
import { ChannelsService } from '../../integrations/channels.service';
import type { IChannelWebhookHandler } from '../webhook-handler.interface';
import type { IngestMessageDto } from '../../conversation-management/ingest-message.dto';

interface FbMessage {
  mid: string;
  text?: string;
}

interface FbMessaging {
  sender: { id: string };
  timestamp: number;
  message?: FbMessage;
}

interface FbEntry {
  id: string; // Facebook Page ID = channel.external_identifier
  messaging: FbMessaging[];
}

interface FbWebhookPayload {
  object: string;
  entry: FbEntry[];
}

@Injectable()
export class FacebookMessengerHandler implements IChannelWebhookHandler {
  readonly channelType = 'facebook';
  private readonly logger = new Logger(FacebookMessengerHandler.name);

  constructor(private readonly channelsService: ChannelsService) {}

  /**
   * Facebook hub.challenge verification.
   * The verify_token is stored in channel.config.verify_token (set when creating the channel).
   * We look up the channel by that token so no env var is needed per-org.
   */
  async handleVerification(query: Record<string, string>): Promise<string> {
    const { 'hub.mode': mode, 'hub.verify_token': verifyToken, 'hub.challenge': challenge } = query;

    if (mode !== 'subscribe' || !verifyToken) {
      throw new ForbiddenException('Invalid hub.mode or missing verify_token');
    }

    // Look up the channel whose config.verify_token matches
    const channel = await this.channelsService.findByConfigValue('facebook', 'verify_token', verifyToken);
    if (!channel) {
      this.logger.warn(`Facebook verification failed — no channel with verify_token match`);
      throw new ForbiddenException('verify_token not recognized');
    }

    this.logger.log(`Facebook webhook verified for channel ${channel.id}`);
    return challenge;
  }

  async handle(
    body: unknown,
    headers: Record<string, string>,
    rawBody: Buffer | undefined,
  ): Promise<IngestMessageDto[]> {
    const payload = body as FbWebhookPayload;

    if (payload.object !== 'page') return [];

    const messages: IngestMessageDto[] = [];

    for (const entry of payload.entry ?? []) {
      const pageId = entry.id;

      // Resolve our channel from the Facebook Page ID stored as external_identifier
      const channel = await this.channelsService.findByExternalIdentifier(pageId, 'facebook', 'facebook');
      if (!channel) {
        this.logger.warn(`No active messenger channel for page_id=${pageId}`);
        continue;
      }

      // Optional HMAC-SHA256 signature validation (skip if app_secret not configured)
      const appSecret = channel.config?.app_secret as string | undefined;
      if (appSecret && rawBody) {
        this.validateSignature(headers['x-hub-signature-256'], rawBody, appSecret);
      }

      for (const event of entry.messaging ?? []) {
        // Only process real text messages — skip read receipts, delivery, etc.
        if (!event.message?.text) continue;

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
      throw new ForbiddenException('Facebook signature mismatch');
    }
  }
}
