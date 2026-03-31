import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { schema } from './schema';

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  pool!: Pool;
  db!: NodePgDatabase<typeof schema>;

  constructor(
    @Inject(ConfigService)
    private readonly configService: ConfigService,
  ) {
  }

  async onModuleInit() {
    console.log('[api] DatabaseService.onModuleInit start');
    const connectionString =
      this.configService.getOrThrow<string>('DATABASE_URL');

    this.pool = new Pool({ connectionString });
    this.db = drizzle(this.pool, { schema });
    console.log('[api] DatabaseService.onModuleInit done');
  }

  async onModuleDestroy() {
    if (this.pool) {
      await this.pool.end();
    }
  }
}
