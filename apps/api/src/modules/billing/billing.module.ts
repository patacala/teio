import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { PlanEntity } from './entities/plan.entity';
import { SubscriptionEntity } from './entities/subscription.entity';
import { UsageEntity } from './entities/usage.entity';
import { InvoiceEntity } from './entities/invoice.entity';
import { OrganizationEntity } from '../organizations/organization.entity';
import { UserEntity } from '../users/user.entity';
import { CommunicationsModule } from '../communications/communications.module';
import { StripeService } from './stripe.service';
import { SubscriptionService } from './subscription.service';
import { UsageTrackingService } from './usage-tracking.service';
import { PlanLimitsGuard } from './plan-limits.guard';
import { BillingController } from './billing.controller';

@Global()
@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([
      PlanEntity,
      SubscriptionEntity,
      UsageEntity,
      InvoiceEntity,
      OrganizationEntity,
      UserEntity,
    ]),
    CommunicationsModule,
  ],
  providers: [
    StripeService,
    SubscriptionService,
    UsageTrackingService,
    PlanLimitsGuard,
  ],
  controllers: [BillingController],
  exports: [SubscriptionService, UsageTrackingService, PlanLimitsGuard],
})
export class BillingModule {}
