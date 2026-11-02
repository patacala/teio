import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { CallEntity } from './call.entity';
import { CallEventEntity } from './call-event.entity';
import { CallTranscriptEntity } from './call-transcript.entity';
import { CallsService } from './calls.service';
import { TranscriptService } from './transcript.service';
import { CallProcessingProcessor, CALL_PROCESSING_QUEUE_TOKEN, TRANSCRIPT_PROCESSING_QUEUE_TOKEN } from './call-processing.processor';
import { TranscriptProcessingProcessor } from './transcript-processing.processor';
import { RetellWebhookController } from './retell-webhook.controller';
import { VoiceController } from './voice.controller';
import { ClientManagementModule } from '../client-management/client-management.module';
import { IntegrationsModule } from '../integrations/integrations.module';
import { ConversationManagementModule } from '../conversation-management/conversation-management.module';
import { AIAgentsModule } from '../ai-agents/ai-agents.module';
import { MessageEntity } from '../conversation-management/message.entity';

function redisConnectionFactory(config: ConfigService) {
  const host = config.get<string>('redis.host', 'localhost');
  const port = config.get<number>('redis.port', 6379);
  const password = config.get<string>('redis.password', '');
  return { host, port, password: password || undefined };
}

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([
      CallEntity,
      CallEventEntity,
      CallTranscriptEntity,
      MessageEntity,
    ]),
    ClientManagementModule,
    IntegrationsModule,
    ConversationManagementModule,
    AIAgentsModule,
  ],
  providers: [
    CallsService,
    TranscriptService,
    // BullMQ Queue providers
    {
      provide: CALL_PROCESSING_QUEUE_TOKEN,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new Queue('call_processing', { connection: redisConnectionFactory(config) }),
    },
    {
      provide: TRANSCRIPT_PROCESSING_QUEUE_TOKEN,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new Queue('transcript_processing', { connection: redisConnectionFactory(config) }),
    },
    CallProcessingProcessor,
    TranscriptProcessingProcessor,
  ],
  controllers: [RetellWebhookController, VoiceController],
  exports: [CallsService, TranscriptService],
})
export class VoiceModule {}
