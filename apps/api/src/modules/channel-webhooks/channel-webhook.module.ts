import { Module } from '@nestjs/common';
import { IntegrationsModule } from '../integrations/integrations.module';
import { ConversationManagementModule } from '../conversation-management/conversation-management.module';
import { FacebookMessengerHandler } from './handlers/facebook-messenger.handler';
import { InstagramHandler } from './handlers/instagram.handler';
import { WhatsAppHandler } from './handlers/whatsapp.handler';
import { WebhookHandlerRegistry } from './webhook-handler.registry';
import { ChannelWebhookController } from './channel-webhook.controller';

@Module({
  imports: [
    IntegrationsModule,           // provides ChannelsService
    ConversationManagementModule, // provides ConversationManagementService
  ],
  providers: [
    FacebookMessengerHandler,
    InstagramHandler,
    WhatsAppHandler,
    WebhookHandlerRegistry,
  ],
  controllers: [ChannelWebhookController],
})
export class ChannelWebhookModule {}
