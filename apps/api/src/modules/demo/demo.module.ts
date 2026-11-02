import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MagicLinkEntity } from './magic-link.entity';
import { DemoRequestEntity } from './demo-request.entity';
import { DemoService } from './demo.service';
import { DemoController } from './demo.controller';
import { DemoWebhookController } from './demo-webhook.controller';
import { ClientManagementModule } from '../client-management/client-management.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([MagicLinkEntity, DemoRequestEntity]),
    ClientManagementModule,
  ],
  providers: [DemoService],
  controllers: [DemoController, DemoWebhookController],
  exports: [DemoService],
})
export class DemoModule {}
