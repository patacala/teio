import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import configuration from './config/configuration';
import { DatabaseModule } from './infrastructure/database/database.module';
import { RedisModule } from './infrastructure/redis/redis.module';
import { SupabaseAdminModule } from './infrastructure/supabase/supabase-admin.module';
import { RabbitMQModule } from './infrastructure/rabbitmq/rabbitmq.module';
import { OrganizationsModule } from './modules/organizations/organizations.module';
import { UsersModule } from './modules/users/users.module';
import { ClientManagementModule } from './modules/client-management/client-management.module';
import { ConversationManagementModule } from './modules/conversation-management/conversation-management.module';
import { AIAgentsModule } from './modules/ai-agents/ai-agents.module';
import { SchedulingModule } from './modules/scheduling/scheduling.module';
import { IntegrationsModule } from './modules/integrations/integrations.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { ApiKeysModule } from './modules/api-keys/api-keys.module';
import { VoiceModule } from './modules/voice/voice.module';
import { AIAutomationModule } from './modules/ai-automation/ai-automation.module';
import { BillingModule } from './modules/billing/billing.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { FunnelsModule } from './modules/funnels/funnels.module';
import { TemplatesModule } from './modules/templates/templates.module';
import { KnowledgeModule } from './modules/knowledge/knowledge.module';
import { ChannelWebhookModule } from './modules/channel-webhooks/channel-webhook.module';
import { DemoModule } from './modules/demo/demo.module';
import { CommunicationsModule } from './modules/communications/communications.module';
import { AuthModule } from './modules/auth/auth.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { AutomationEngineModule } from './modules/automation-engine/automation-engine.module';
import { MailModule } from './infrastructure/mail/mail.module';
import { SmsModule } from './infrastructure/sms/sms.module';
import { WahaModule } from './infrastructure/waha/waha.module';
import { RealtimeModule } from './infrastructure/realtime/realtime.module';
import { MailModule as MailAPIModule } from './modules/mail/mail.module';
import { HealthController } from './health.controller';
import { TenantContextMiddleware } from './common/middleware/tenant-context.middleware';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { PlatformAdminGuard } from './common/guards/platform-admin.guard';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      envFilePath: ['.env.local', '.env', '../../.env'],
    }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    ScheduleModule.forRoot(),
    DatabaseModule,
    RedisModule,
    SupabaseAdminModule,
    RabbitMQModule,
    MailModule,
    SmsModule,
    WahaModule,
    RealtimeModule,
    OrganizationsModule,
    UsersModule,
    ClientManagementModule,
    ConversationManagementModule,
    AIAgentsModule,
    SchedulingModule,
    IntegrationsModule,
    AnalyticsModule,
    ApiKeysModule,
    VoiceModule,
    AIAutomationModule,
    BillingModule,
    PaymentsModule,
    FunnelsModule,
    TemplatesModule,
    KnowledgeModule,
    ChannelWebhookModule,
    DemoModule,
    CommunicationsModule,
    AuthModule,
    NotificationsModule,
    AutomationEngineModule,
    MailAPIModule,
  ],
  controllers: [HealthController],
  providers: [
    TenantContextMiddleware,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: PlatformAdminGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(TenantContextMiddleware).forRoutes('*');
  }
}
