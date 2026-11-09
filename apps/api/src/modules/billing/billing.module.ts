import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { PlanEntity } from './entities/plan.entity';
import { SubscriptionEntity } from './entities/subscription.entity';
import { UsageEntity } from './entities/usage.entity';
import { InvoiceEntity } from './entities/invoice.entity';
import { StripeEventEntity } from './entities/stripe-event.entity';
import { OrganizationEntity } from '../organizations/organization.entity';
import { UserEntity } from '../users/user.entity';
import { CommunicationsModule } from '../communications/communications.module';
import { StripeService } from './stripe.service';
import { SubscriptionService } from './subscription.service';
import { UsageTrackingService } from './usage-tracking.service';
import { BillingAccessService } from './billing-access.service';
import { BillingAccessGuard } from './billing-access.guard';
import { UsageMeteringSubscriber } from './usage-metering.subscriber';
import { BillingController } from './billing.controller';
import { PlatformBillingController } from './platform-billing.controller';
import { DemoLimitsService } from './demo-limits.service';

@Global()
@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([
      PlanEntity,
      SubscriptionEntity,
      UsageEntity,
      InvoiceEntity,
      StripeEventEntity,
      OrganizationEntity,
      UserEntity,
    ]),
    CommunicationsModule,
  ],
  providers: [
    StripeService,
    SubscriptionService,
    UsageTrackingService,
    BillingAccessService,
    BillingAccessGuard,
    UsageMeteringSubscriber,
    DemoLimitsService,
  ],
  controllers: [BillingController, PlatformBillingController],
  exports: [SubscriptionService, UsageTrackingService, BillingAccessService, BillingAccessGuard],
})
export class BillingModule {}
