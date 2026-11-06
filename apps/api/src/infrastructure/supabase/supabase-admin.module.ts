import { Global, Logger, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_ADMIN_CLIENT } from './supabase-admin.constants';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: SUPABASE_ADMIN_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService): SupabaseClient | null => {
        const url = config.get<string>('supabase.url') ?? '';
        const serviceRoleKey = config.get<string>('supabase.serviceRoleKey') ?? '';
        if (!url || !serviceRoleKey) {
          new Logger('SupabaseAdminModule').warn(
            'SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set — password reset and team invitations will not work',
          );
          return null;
        }
        return createClient(url, serviceRoleKey, {
          auth: { autoRefreshToken: false, persistSession: false },
        });
      },
    },
  ],
  exports: [SUPABASE_ADMIN_CLIENT],
})
export class SupabaseAdminModule {}
