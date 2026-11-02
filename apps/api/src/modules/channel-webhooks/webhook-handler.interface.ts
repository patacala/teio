import type { IngestMessageDto } from '../conversation-management/ingest-message.dto';

/**
 * Implement this interface to add support for a new inbound channel webhook.
 *
 * Steps to add a new channel:
 * 1. Create `handlers/my-channel.handler.ts` implementing IChannelWebhookHandler
 * 2. Register it in WebhookHandlerRegistry
 * 3. That's it — no controller changes needed
 *
 * Webhook URLs (auto-routed by ChannelWebhookController):
 *   GET  /api/v1/webhooks/channel/:channelType  → handleVerification()
 *   POST /api/v1/webhooks/channel/:channelType  → handle()
 */
export interface IChannelWebhookHandler {
  /** Must match the channel `type` value stored in the DB (e.g. 'messenger', 'whatsapp') */
  readonly channelType: string;

  /**
   * Handle GET verification challenge (Facebook hub.challenge, etc.)
   * Return the plain-text string to send back to the platform.
   * Throw ForbiddenException if verification fails.
   * Optional — omit if the channel type has no GET verification step.
   */
  handleVerification?(query: Record<string, string>): Promise<string>;

  /**
   * Handle POST webhook event.
   * Responsible for:
   *  1. Looking up the channel entity (to resolve org + config)
   *  2. Validating the request signature (if applicable)
   *  3. Extracting and returning normalized IngestMessageDto[]
   *
   * Return empty array to silently acknowledge with no messages ingested.
   * Throw ForbiddenException for invalid signatures.
   */
  handle(
    body: unknown,
    headers: Record<string, string>,
    rawBody: Buffer | undefined,
  ): Promise<IngestMessageDto[]>;
}
