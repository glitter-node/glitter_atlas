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
  ) {
    console.log('[api] AuthBootstrapService.constructor');
  }

  async onModuleInit() {
    console.log('[api] AuthBootstrapService.onModuleInit start');
    const normalizedEmail = 'gim@glitter.kr';
    console.log('[api] AuthBootstrapService.before existingUser query');
    const existingUser = await this.databaseService.pool.query<{ id: string }>(
      `
        select id
        from approved_users
        where normalized_email = $1
        limit 1
      `,
      [normalizedEmail],
    );
    console.log('[api] AuthBootstrapService.after existingUser query');

    if (existingUser.rows.length > 0) {
      console.log('[api] AuthBootstrapService.user exists');
      return;
    }

    const password = this.configService.getOrThrow<string>('SUPER_ADMIN_PASSWORD');
    console.log('[api] AuthBootstrapService.before hash');
    const passwordHash = await hash(password, 12);
    console.log('[api] AuthBootstrapService.after hash');

    console.log('[api] AuthBootstrapService.before insert');
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
    console.log('[api] AuthBootstrapService.after insert');
  }
}
