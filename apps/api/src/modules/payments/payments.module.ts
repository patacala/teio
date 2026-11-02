import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PaymentSettingsEntity } from './entities/payment-settings.entity';
import { PaymentServiceEntity } from './entities/payment-service.entity';
import { PaymentEntity } from './entities/payment.entity';
import { ContactEntity } from '../client-management/contact.entity';
import { OrganizationEntity } from '../organizations/organization.entity';
import { AppointmentEntity } from '../scheduling/appointment.entity';
import { WorkScheduleEntity } from '../scheduling/work-schedule.entity';
import { PaymentSettingsService } from './payment-settings.service';
import { PaymentServiceService } from './payment-service.service';
import { PaymentsService } from './payments.service';
import { PaymentSettingsController } from './payment-settings.controller';
import { PaymentServiceController } from './payment-service.controller';
import { PaymentsController } from './payments.controller';
import { PaymentWebhookController } from './payment-webhook.controller';
import { IntegrationsModule } from '../integrations/integrations.module';
import { SchedulingModule } from '../scheduling/scheduling.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      PaymentSettingsEntity,
      PaymentServiceEntity,
      PaymentEntity,
      ContactEntity,
      OrganizationEntity,
      AppointmentEntity,
      WorkScheduleEntity,
    ]),
    IntegrationsModule,
    SchedulingModule,
  ],
  providers: [PaymentSettingsService, PaymentServiceService, PaymentsService],
  controllers: [
    PaymentSettingsController,
    PaymentServiceController,
    PaymentsController,
    PaymentWebhookController,
  ],
  exports: [PaymentSettingsService, PaymentServiceService, PaymentsService],
})
export class PaymentsModule {}
