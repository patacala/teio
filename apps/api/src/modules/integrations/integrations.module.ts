import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { WebhookEntity } from './webhook.entity';
import { ChannelEntity } from './channel.entity';
import { WebhookDeliveryEntity } from './webhook-delivery.entity';
import { IntegrationsService } from './integrations.service';
import { ChannelsService } from './channels.service';
import { WebhookDispatcherService, WEBHOOK_DISPATCH_QUEUE_TOKEN } from './webhook-dispatcher.service';
import { WahaChannelService } from './waha-channel.service';
import { IntegrationsController } from './integrations.controller';
import { ChannelsController } from './channels.controller';
import { WahaChannelController } from './waha-channel.controller';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([WebhookEntity, ChannelEntity, WebhookDeliveryEntity]),
  ],
  providers: [
    IntegrationsService,
    ChannelsService,
    WahaChannelService,
    WebhookDispatcherService,
    {
      provide: WEBHOOK_DISPATCH_QUEUE_TOKEN,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new Queue('webhook_dispatch', {
          connection: {
            host: config.get('redis.host', 'localhost'),
            port: config.get('redis.port', 6379),
            password: config.get('redis.password') || undefined,
          },
        }),
    },
  ],
  // WahaChannelController first: its `channels/whatsapp/*` paths must be matched
  // before ChannelsController's `channels/:id` param routes.
  controllers: [IntegrationsController, WahaChannelController, ChannelsController],
  exports: [IntegrationsService, ChannelsService, WahaChannelService, WebhookDispatcherService],
})
export class IntegrationsModule {}
