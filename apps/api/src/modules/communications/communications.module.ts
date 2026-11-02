import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { CommunicationTemplateEntity } from './communication-template.entity';
import { CommunicationDeliveryEntity } from './communication-delivery.entity';
import { OrganizationEntity } from '../organizations/organization.entity';
import { CommunicationTemplateService } from './communication-template.service';
import { CommunicationDispatchService } from './communication-dispatch.service';
import { CommunicationDispatchProcessor } from './communication-dispatch.processor';
import { CommunicationDispatchQueueService } from './communication-dispatch-queue.service';
import { COMM_DISPATCH_QUEUE, COMM_DISPATCH_QUEUE_NAME } from './communication-dispatch.constants';
import { CommunicationsController } from './communications.controller';

function redisConnectionFactory(config: ConfigService) {
  const host = config.get<string>('redis.host', 'localhost');
  const port = config.get<number>('redis.port', 6379);
  const password = config.get<string>('redis.password', '');
  return { host, port, password: password || undefined };
}

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([CommunicationTemplateEntity, CommunicationDeliveryEntity, OrganizationEntity]),
  ],
  providers: [
    {
      provide: COMM_DISPATCH_QUEUE,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new Queue(COMM_DISPATCH_QUEUE_NAME, { connection: redisConnectionFactory(config) }),
    },
    CommunicationTemplateService,
    CommunicationDispatchService,
    CommunicationDispatchProcessor,
    CommunicationDispatchQueueService,
  ],
  controllers: [CommunicationsController],
  exports: [CommunicationTemplateService, CommunicationDispatchService, CommunicationDispatchQueueService],
})
export class CommunicationsModule {}
