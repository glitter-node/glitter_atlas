import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  GoneException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { DatabaseService } from '../database/database.service';
import { MailService } from '../mail/mail.service';

export type SessionState = {
  authenticated: boolean;
  sessionType: 'temporary' | 'approved' | null;
  email: string | null;
  isSuperAdmin: boolean;
};

type PendingApprovalCandidate = {
  email: string;
  lastSeenAt: string;
};

@Injectable()
export class AuthService {
  constructor(
    @Inject(DatabaseService)
    private readonly databaseService: DatabaseService,
    @Inject(MailService)
    private readonly mailService: MailService,
  ) {}

  async getSession(
    sessionToken?: string | null,
  ): Promise<SessionState> {
    if (!sessionToken) {
      return this.buildAnonymousSession();
    }

    const result = await this.databaseService.pool.query<{
      email: string;
      session_type: 'temporary' | 'approved';
      expires_at: Date | string;
      revoked_at: Date | string | null;
      is_super_admin: boolean | null;
    }>(
      `
        select s.email, s.session_type, s.expires_at, s.revoked_at, u.is_super_admin
        from auth_sessions s
        left join approved_users u
          on u.id = s.approved_user_id
        where session_token_hash = $1
        limit 1
      `,
      [this.hashValue(sessionToken)],
    );

    if (result.rows.length === 0) {
      return this.buildAnonymousSession();
    }

    const row = result.rows[0];

    if (row.revoked_at) {
      return this.buildAnonymousSession();
    }

    if (new Date(row.expires_at).getTime() <= Date.now()) {
      return this.buildAnonymousSession();
    }

    await this.databaseService.pool.query(
      `
        update auth_sessions
        set last_seen_at = now()
        where session_token_hash = $1
      `,
      [this.hashValue(sessionToken)],
    );

    return {
      authenticated: true,
      sessionType: row.session_type,
      email: row.email,
      isSuperAdmin: Boolean(row.is_super_admin),
    };
  }

  async startEmail(input: {
    email?: string;
    requestedIp?: string | null;
    requestedUserAgent?: string | null;
  }) {
    const normalizedEmail = this.normalizeEmail(input.email);
    const selector = randomBytes(12).toString('hex');
    const token = randomBytes(32).toString('hex');
    const tokenHash = this.hashValue(token);
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    await this.databaseService.pool.query(
      `
        insert into email_verification_tokens (
          email,
          normalized_email,
          selector,
          token_hash,
          purpose,
          expires_at,
          requested_ip,
          requested_user_agent
        )
        values ($1, $2, $3, $4, 'login', $5, $6, $7)
      `,
      [
        normalizedEmail,
        normalizedEmail,
        selector,
        tokenHash,
        expiresAt,
        input.requestedIp ?? null,
        input.requestedUserAgent ?? null,
      ],
    );

    const verifyUrl =
      `http://127.0.0.1:4000/auth/verify?selector=${encodeURIComponent(selector)}` +
      `&token=${encodeURIComponent(token)}`;

    await this.mailService.sendMail({
      to: normalizedEmail,
      subject: 'GlitterAtlas Sign-In Link',
      text:
        `Open this sign-in link to verify your email:\n\n${verifyUrl}\n\n` +
        'This link expires in 15 minutes and can only be used once.',
    });

    return { ok: true };
  }

  async verifyEmail(input: {
    selector?: string;
    token?: string;
    createdIp?: string | null;
    createdUserAgent?: string | null;
  }) {
    const selector = input.selector?.trim();
    const token = input.token?.trim();

    if (!selector || !token) {
      throw new BadRequestException('selector and token are required');
    }

    const tokenResult = await this.databaseService.pool.query<{
      id: string;
      email: string;
      normalized_email: string;
      token_hash: string;
      expires_at: Date | string;
      used_at: Date | string | null;
    }>(
      `
        select id, email, normalized_email, token_hash, expires_at, used_at
        from email_verification_tokens
        where selector = $1
        limit 1
      `,
      [selector],
    );

    if (tokenResult.rows.length === 0) {
      throw new NotFoundException('verification token not found');
    }

    const tokenRow = tokenResult.rows[0];

    if (tokenRow.used_at) {
      throw new ConflictException('verification token already used');
    }

    if (new Date(tokenRow.expires_at).getTime() <= Date.now()) {
      throw new GoneException('verification token expired');
    }

    if (this.hashValue(token) !== tokenRow.token_hash) {
      throw new BadRequestException('invalid verification token');
    }

    const client = await this.databaseService.pool.connect();

    try {
      await client.query('begin');

      const usedResult = await client.query<{ id: string }>(
        `
          update email_verification_tokens
          set used_at = now()
          where id = $1
            and used_at is null
          returning id
        `,
        [tokenRow.id],
      );

      if (usedResult.rows.length === 0) {
        throw new ConflictException('verification token already used');
      }

      const approvedResult = await client.query<{
        id: string;
      }>(
        `
          select id
          from approved_users
          where normalized_email = $1
            and is_active = true
          limit 1
        `,
        [tokenRow.normalized_email],
      );

      const sessionType =
        approvedResult.rows.length > 0 ? 'approved' : 'temporary';
      const sessionToken = randomBytes(32).toString('hex');
      const sessionTokenHash = this.hashValue(sessionToken);
      const expiresAt = new Date(
        Date.now() +
          (sessionType === 'approved' ? 30 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000),
      );

      await client.query(
        `
          insert into auth_sessions (
            session_token_hash,
            email,
            normalized_email,
            session_type,
            approved_user_id,
            expires_at,
            created_ip,
            created_user_agent
          )
          values ($1, $2, $3, $4, $5, $6, $7, $8)
        `,
        [
          sessionTokenHash,
          tokenRow.email,
          tokenRow.normalized_email,
          sessionType,
          approvedResult.rows[0]?.id ?? null,
          expiresAt,
          input.createdIp ?? null,
          input.createdUserAgent ?? null,
          ],
      );

      await client.query('commit');

      return {
        ok: true,
        sessionType,
        email: tokenRow.email,
        sessionToken,
        expiresAt,
      };
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }

  async logout(sessionToken?: string | null) {
    if (sessionToken) {
      await this.databaseService.pool.query(
        `
          update auth_sessions
          set revoked_at = now()
          where session_token_hash = $1
            and revoked_at is null
        `,
        [this.hashValue(sessionToken)],
      );
    }

    return { ok: true };
  }

  async listPendingApprovals(): Promise<{
    items: PendingApprovalCandidate[];
  }> {
    const result = await this.databaseService.pool.query<{
      email: string;
      last_seen_at: Date | string;
    }>(
      `
        select s.email, max(s.last_seen_at) as last_seen_at
        from auth_sessions s
        left join approved_users u
          on u.normalized_email = s.normalized_email
         and u.is_active = true
        where s.session_type = 'temporary'
          and s.revoked_at is null
          and s.expires_at > now()
          and u.id is null
        group by s.normalized_email, s.email
        order by max(s.last_seen_at) desc
        limit 20
      `,
    );

    return {
      items: result.rows.map((row) => ({
        email: row.email,
        lastSeenAt: new Date(row.last_seen_at).toISOString(),
      })),
    };
  }

  async approveEmail(input: { email?: string }) {
    const normalizedEmail = this.normalizeEmail(input.email);

    await this.databaseService.pool.query(
      `
        insert into approved_users (
          email,
          normalized_email,
          is_active,
          is_super_admin
        )
        values ($1, $2, true, false)
        on conflict (normalized_email)
        do update
        set email = excluded.email,
            is_active = true
      `,
      [normalizedEmail, normalizedEmail],
    );

    return { ok: true, email: normalizedEmail };
  }

  private normalizeEmail(email?: string) {
    const normalizedEmail = email?.trim().toLowerCase();

    if (!normalizedEmail) {
      throw new BadRequestException('email is required');
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      throw new BadRequestException('email must be valid');
    }

    return normalizedEmail;
  }

  private hashValue(value: string) {
    return createHash('sha256').update(value).digest('hex');
  }

  private buildAnonymousSession(): SessionState {
    return {
      authenticated: false,
      sessionType: null,
      email: null,
      isSuperAdmin: false,
    };
  }
}
