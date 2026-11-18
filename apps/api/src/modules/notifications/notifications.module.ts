import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ContactEntity } from '../client-management/contact.entity';
import { OrganizationEntity } from '../organizations/organization.entity';
import { UserEntity } from '../users/user.entity';
import { AppointmentEntity } from '../scheduling/appointment.entity';
import { WorkScheduleEntity } from '../scheduling/work-schedule.entity';
import { AnalyticsModule } from '../analytics/analytics.module';
import { AIAgentsModule } from '../ai-agents/ai-agents.module';
import { ConversationEventConsumer } from './conversation-event.consumer';
import { VoiceEventConsumer } from './voice-event.consumer';
import { AIEventConsumer } from './ai-event.consumer';
import { BillingEventConsumer } from './billing-event.consumer';
import { CommunicationEventConsumer } from './communication-event.consumer';
import { PaymentEventConsumer } from './payment-event.consumer';
import { OutcomeFeedbackConsumer } from './outcome-feedback.consumer';

@Module({
  imports: [
    TypeOrmModule.forFeature([ContactEntity, OrganizationEntity, UserEntity, AppointmentEntity, WorkScheduleEntity]),
    AnalyticsModule,
    AIAgentsModule,
  ],
  // Booking messages to contacts are sent by the organization's booking
  // automations (automation-engine/workflows/system).
  controllers: [
    ConversationEventConsumer,
    VoiceEventConsumer,
    AIEventConsumer,
    BillingEventConsumer,
    CommunicationEventConsumer,
    PaymentEventConsumer,
    OutcomeFeedbackConsumer,
  ],
})
export class NotificationsModule {}
