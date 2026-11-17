import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrganizationEntity } from '../organizations/organization.entity';
import { PlanEntity } from '../billing/entities/plan.entity';
import { MrrSnapshotEntity } from './entities/mrr-snapshot.entity';
import { PlatformAnalyticsController } from './platform-analytics.controller';
import { PlatformAnalyticsService } from './platform-analytics.service';
import { MrrSnapshotService } from './mrr-snapshot.service';

/** BillingAccessService comes from the global BillingModule. */
@Module({
  imports: [TypeOrmModule.forFeature([OrganizationEntity, PlanEntity, MrrSnapshotEntity])],
  controllers: [PlatformAnalyticsController],
  providers: [PlatformAnalyticsService, MrrSnapshotService],
})
export class PlatformAnalyticsModule {}
