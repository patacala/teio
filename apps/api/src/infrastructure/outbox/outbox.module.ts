import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OutboxEventEntity } from './outbox-event.entity';
import { OutboxService } from './outbox.service';
import { ProcessedEventsService } from './processed-events.service';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([OutboxEventEntity])],
  providers: [OutboxService, ProcessedEventsService],
  exports: [OutboxService, ProcessedEventsService],
})
export class OutboxModule {}
