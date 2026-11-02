import { Injectable } from '@nestjs/common';
import type { IChannelWebhookHandler } from './webhook-handler.interface';
import { FacebookMessengerHandler } from './handlers/facebook-messenger.handler';
import { InstagramHandler } from './handlers/instagram.handler';
import { WhatsAppHandler } from './handlers/whatsapp.handler';

/**
 * To add a new channel:
 *  1. Create handlers/my-channel.handler.ts
 *  2. Add it to the constructor + call this.register()
 *  3. Add it to the providers array in ChannelWebhookModule
 */
@Injectable()
export class WebhookHandlerRegistry {
  private readonly handlers = new Map<string, IChannelWebhookHandler>();

  constructor(
    private readonly facebookHandler: FacebookMessengerHandler,
    private readonly instagramHandler: InstagramHandler,
    private readonly whatsappHandler: WhatsAppHandler,
  ) {
    this.register(facebookHandler);
    this.register(instagramHandler);
    this.register(whatsappHandler);
  }

  private register(handler: IChannelWebhookHandler): void {
    this.handlers.set(handler.channelType, handler);
  }

  get(channelType: string): IChannelWebhookHandler | undefined {
    return this.handlers.get(channelType);
  }

  getSupportedTypes(): string[] {
    return Array.from(this.handlers.keys());
  }
}
