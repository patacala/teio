import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { ConversationEntity } from './conversation.entity';
import { MessageEntity } from './message.entity';
import { ConversationManagementService } from './conversation-management.service';
import { ConversationManagementController } from './conversation-management.controller';
import { IngestController } from './ingest.controller';
import { OutboundDispatchProcessor } from './outbound-dispatch.processor';
import { OUTBOUND_DISPATCH_QUEUE, OUTBOUND_DISPATCH_QUEUE_NAME } from './outbound-dispatch.constants';
import { ClientManagementModule } from '../client-management/client-management.module';
import { IntegrationsModule } from '../integrations/integrations.module';

function redisConnectionFactory(config: ConfigService) {
  const host = config.get<string>('redis.host', 'localhost');
  const port = config.get<number>('redis.port', 6379);
  const password = config.get<string>('redis.password', '');
  return { host, port, password: password || undefined };
}

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([ConversationEntity, MessageEntity]),
    ClientManagementModule,
    IntegrationsModule,
  ],
  providers: [
    {
      provide: OUTBOUND_DISPATCH_QUEUE,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new Queue(OUTBOUND_DISPATCH_QUEUE_NAME, { connection: redisConnectionFactory(config) }),
    },
    ConversationManagementService,
    OutboundDispatchProcessor,
  ],
  controllers: [ConversationManagementController, IngestController],
  exports: [ConversationManagementService, OUTBOUND_DISPATCH_QUEUE],
})
export class ConversationManagementModule {}
