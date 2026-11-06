/// <reference types="jest" />
import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import { SupabaseAdminModule } from './supabase-admin.module';
import { SUPABASE_ADMIN_CLIENT } from './supabase-admin.constants';
import { AuthService } from '../../modules/auth/auth.service';
import { UsersService } from '../../modules/users/users.service';
import { UserEntity } from '../../modules/users/user.entity';
import { REDIS_CLIENT } from '../redis/redis.module';

async function compile(env: Record<string, string>) {
  return Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({
        ignoreEnvFile: true,
        ignoreEnvVars: true,
        load: [() => ({ supabase: { url: env.url ?? '', serviceRoleKey: env.key ?? '' } })],
      }),
      SupabaseAdminModule,
    ],
    providers: [
      AuthService,
      UsersService,
      { provide: getRepositoryToken(UserEntity), useValue: {} },
      { provide: REDIS_CLIENT, useValue: {} },
    ],
  }).compile();
}

describe('SupabaseAdminModule', () => {
  it('gives AuthService and UsersService the same admin client instance', async () => {
    const module = await compile({ url: 'http://localhost:54321', key: 'service-role' });
    const client = module.get(SUPABASE_ADMIN_CLIENT);
    expect(client).not.toBeNull();
    expect((module.get(AuthService) as unknown as { supabaseAdmin: unknown }).supabaseAdmin).toBe(client);
    expect((module.get(UsersService) as unknown as { supabaseAdmin: unknown }).supabaseAdmin).toBe(client);
  });

  it.each([
    ['url missing', { key: 'service-role' }],
    ['service role key missing', { url: 'http://localhost:54321' }],
  ])('provides null when the %s', async (_case, env) => {
    const module = await compile(env);
    expect(module.get(SUPABASE_ADMIN_CLIENT)).toBeNull();
    expect((module.get(AuthService) as unknown as { supabaseAdmin: unknown }).supabaseAdmin).toBeNull();
  });
});
