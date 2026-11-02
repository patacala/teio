import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppointmentEntity } from './appointment.entity';
import { ContactEntity } from '../client-management/contact.entity';
import { WorkScheduleEntity } from './work-schedule.entity';
import { SchedulingService } from './scheduling.service';
import { SchedulingController } from './scheduling.controller';
import { CalendarsController } from './calendars.controller';
import { IntegrationsModule } from '../integrations/integrations.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([AppointmentEntity, ContactEntity, WorkScheduleEntity]),
    IntegrationsModule,
  ],
  providers: [SchedulingService],
  controllers: [SchedulingController, CalendarsController],
  exports: [SchedulingService],
})
export class SchedulingModule {}
