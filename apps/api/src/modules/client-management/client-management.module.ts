import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ContactEntity } from './contact.entity';
import { ContactDataUpdateEntity } from './contact-data-update.entity';
import { CompanyEntity } from './company.entity';
import { ConversationEntity } from '../conversation-management/conversation.entity';
import { MessageEntity } from '../conversation-management/message.entity';
import { CallEntity } from '../voice/call.entity';
import { AppointmentEntity } from '../scheduling/appointment.entity';
import { ContactFunnelHistoryEntity } from '../funnels/contact-funnel-history.entity';
import { FunnelStageEntity } from '../funnels/funnel-stage.entity';
import { FunnelEntity } from '../funnels/funnel.entity';
import { FunnelRuleEntity } from '../funnels/funnel-rule.entity';
import { ClientManagementService } from './client-management.service';
import { ClientManagementController } from './client-management.controller';
import { CompaniesService } from './companies.service';
import { CompaniesController } from './companies.controller';
import { FunnelRulesService } from './funnel-rules.service';
import { FunnelAutomationConsumer } from './funnel-automation.consumer';
import { IntegrationsModule } from '../integrations/integrations.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ContactEntity,
      ContactDataUpdateEntity,
      CompanyEntity,
      ConversationEntity,
      MessageEntity,
      CallEntity,
      AppointmentEntity,
      ContactFunnelHistoryEntity,
      FunnelStageEntity,
      FunnelEntity,
      FunnelRuleEntity,
    ]),
    IntegrationsModule,
  ],
  providers: [ClientManagementService, CompaniesService, FunnelRulesService],
  controllers: [ClientManagementController, CompaniesController, FunnelAutomationConsumer],
  exports: [ClientManagementService, CompaniesService],
})
export class ClientManagementModule {}
