import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ENTITIES } from './entities';

/**
 * Postgres connection. Connection details and schema-sync behaviour come from
 * the environment (DATABASE_URL, DB_SYNCHRONIZE, DB_SSL, DB_LOGGING) — see
 * config/env.validation.ts for defaults.
 */
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        url: config.get<string>('DATABASE_URL'),
        entities: ENTITIES,
        synchronize: config.get<boolean>('DB_SYNCHRONIZE', true),
        logging: config.get<boolean>('DB_LOGGING', false),
        ssl: config.get<boolean>('DB_SSL', true) ? { rejectUnauthorized: false } : false,
        // Force IPv4: some hosts resolve Neon to an unreachable IPv6 address first.
        extra: { family: 4 },
      }),
    }),
  ],
})
export class DatabaseModule {}
