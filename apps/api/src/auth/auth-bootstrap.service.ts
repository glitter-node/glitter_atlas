import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { hash } from 'bcryptjs';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class AuthBootstrapService implements OnModuleInit {
  constructor(
    @Inject(ConfigService)
    private readonly configService: ConfigService,
    @Inject(DatabaseService)
    private readonly databaseService: DatabaseService,
  ) {}

  async onModuleInit() {
    const normalizedEmail = 'gim@glitter.kr';
    const existingUser = await this.databaseService.pool.query<{ id: string }>(
      `
        select id
        from approved_users
        where normalized_email = $1
        limit 1
      `,
      [normalizedEmail],
    );

    if (existingUser.rows.length > 0) {
      return;
    }

    const password = this.configService.getOrThrow<string>('SUPER_ADMIN_PASSWORD');
    const passwordHash = await hash(password, 12);

    await this.databaseService.pool.query(
      `
        insert into approved_users (
          email,
          normalized_email,
          password_hash,
          is_active,
          is_super_admin
        )
        values ($1, $2, $3, true, true)
      `,
      [normalizedEmail, normalizedEmail, passwordHash],
    );
  }
}
