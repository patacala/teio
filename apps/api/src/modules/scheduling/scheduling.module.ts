import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppointmentEntity } from './appointment.entity';
import { WorkScheduleEntity } from './work-schedule.entity';
import { AppointmentReminderEntity } from './appointment-reminder.entity';
import { ContactEntity } from '../client-management/contact.entity';
import { OrganizationEntity } from '../organizations/organization.entity';
import { IntegrationsModule } from '../integrations/integrations.module';
import { SchedulingService } from './scheduling.service';
import { CalendarService } from './calendar.service';
import { AvailabilityService } from './availability.service';
import { BookingLinksService } from './booking-links.service';
import { AppointmentEventsPublisher } from './appointment-events.publisher';
import { AppointmentMaintenanceCron } from './appointment-maintenance.cron';
import { SchedulingController } from './scheduling.controller';
import { CalendarsController } from './calendars.controller';
import { PublicBookingController } from './public-booking.controller';
import { AppointmentWebhookRelay } from './appointment-webhook.relay';

@Module({
  imports: [
    TypeOrmModule.forFeature([AppointmentEntity, AppointmentReminderEntity, ContactEntity, WorkScheduleEntity, OrganizationEntity]),
    IntegrationsModule,
  ],
  providers: [
    SchedulingService,
    CalendarService,
    AvailabilityService,
    BookingLinksService,
    AppointmentEventsPublisher,
    AppointmentMaintenanceCron,
  ],
  controllers: [SchedulingController, CalendarsController, PublicBookingController, AppointmentWebhookRelay],
  exports: [SchedulingService, CalendarService, AvailabilityService],
})
export class SchedulingModule {}
