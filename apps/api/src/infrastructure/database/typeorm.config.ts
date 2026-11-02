import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';

export const getTypeOrmConfig = (config: ConfigService): TypeOrmModuleOptions => ({
  type: 'postgres',
  url: config.get<string>('database.poolUrl') || config.get<string>('database.url'),
  host: config.get<string>('database.host'),
  port: config.get<number>('database.port'),
  database: config.get<string>('database.name'),
  username: config.get<string>('database.user'),
  password: config.get<string>('database.password'),
  entities: [__dirname + '/../../**/*.entity{.ts,.js}'],
  migrations: [__dirname + '/../../migrations/*{.ts,.js}'],
  migrationsRun: true,
  synchronize: false,
  logging: config.get<string>('NODE_ENV') === 'development',
  ssl: (() => {
    const url = config.get<string>('database.poolUrl') || config.get<string>('database.url') || '';
    const isRemote = url.includes('supabase.co') || url.includes('neon.tech') || url.includes('render.com') || config.get<string>('NODE_ENV') === 'production';
    return isRemote ? { rejectUnauthorized: false } : false;
  })(),
  extra: {
    max: 20,
    min: 2,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  },
});
