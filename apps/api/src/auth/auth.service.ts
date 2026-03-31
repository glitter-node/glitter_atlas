import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  GoneException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { compare, hash } from 'bcryptjs';
import { createHash, randomBytes } from 'node:crypto';
import { DatabaseService } from '../database/database.service';
import { MailService } from '../mail/mail.service';

export type SessionState = {
  authenticated: boolean;
  sessionType: 'temporary' | 'activation' | 'approved' | null;
  activationRequired: boolean;
  email: string | null;
  isSuperAdmin: boolean;
};

type PendingApprovalCandidate = {
  email: string;
  lastSeenAt: string;
};

type ActivationSessionContext = {
  sessionId: string;
  email: string;
  normalizedEmail: string;
  approvedUserId: string;
};

type QueryExecutor = {
  query: <T extends Record<string, unknown>>(
    queryText: string,
    values?: readonly unknown[],
  ) => Promise<{ rows: T[] }>;
};

@Injectable()
export class AuthService {
  private readonly appBaseUrl: string;

  constructor(
    @Inject(ConfigService)
    private readonly configService: ConfigService,
    @Inject(DatabaseService)
    private readonly databaseService: DatabaseService,
    @Inject(MailService)
    private readonly mailService: MailService,
  ) {
    console.log('[api] AuthService.constructor start');
    const appBaseUrl = this.configService
      .getOrThrow<string>('APP_BASE_URL')
      .trim()
      .replace(/\/+$/, '');

    if (!appBaseUrl) {
      throw new Error('APP_BASE_URL is required');
    }

    this.appBaseUrl = appBaseUrl;
    console.log('[api] AuthService.constructor done');
  }

  async getSession(
    sessionToken?: string | null,
  ): Promise<SessionState> {
    if (!sessionToken) {
      return this.buildAnonymousSession();
    }

    const result = await this.databaseService.pool.query<{
      email: string;
      session_type: 'temporary' | 'activation' | 'approved';
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
      activationRequired: row.session_type === 'activation',
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
    const accountResult = await this.databaseService.pool.query<{
      password_hash: string | null;
    }>(
      `
        select password_hash
        from approved_users
        where normalized_email = $1
          and is_active = true
        limit 1
      `,
      [normalizedEmail],
    );

    if (accountResult.rows[0]?.password_hash) {
      throw new ConflictException('password sign-in required');
    }

    const { selector, token } = await this.createEmailVerificationToken({
      email: normalizedEmail,
      purpose: 'login',
      expiresInMinutes: 15,
      requestedIp: input.requestedIp ?? null,
      requestedUserAgent: input.requestedUserAgent ?? null,
    });

    const verifyUrl =
      `${this.appBaseUrl}/auth/verify?selector=${encodeURIComponent(selector)}` +
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
        password_hash: string | null;
      }>(
        `
          select id, password_hash
          from approved_users
          where normalized_email = $1
            and is_active = true
          limit 1
        `,
        [tokenRow.normalized_email],
      );

      const sessionType =
        approvedResult.rows.length === 0
          ? 'temporary'
          : approvedResult.rows[0].password_hash
            ? 'approved'
            : 'activation';
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

      if (sessionType === 'temporary') {
        await client.query(
          `
            delete from email_verification_tokens
            where normalized_email = $1
              and purpose = 'access_request'
              and used_at is null
          `,
          [tokenRow.normalized_email],
        );

        const requestSelector = randomBytes(12).toString('hex');
        const requestToken = randomBytes(32).toString('hex');
        const requestTokenHash = this.hashValue(requestToken);
        const requestExpiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);

        await client.query(
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
            values ($1, $2, $3, $4, 'access_request', $5, $6, $7)
          `,
          [
            tokenRow.email,
            tokenRow.normalized_email,
            requestSelector,
            requestTokenHash,
            requestExpiresAt,
            input.createdIp ?? null,
            input.createdUserAgent ?? null,
          ],
        );
      }

      await client.query('commit');

      return {
        ok: true,
        sessionType,
        activationRequired: sessionType === 'activation',
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
      requested_at: Date | string;
    }>(
      `
        select t.email, max(t.created_at) as requested_at
        from email_verification_tokens t
        left join approved_users u
          on u.normalized_email = t.normalized_email
         and u.is_active = true
        where t.purpose = 'access_request'
          and t.used_at is null
          and u.id is null
        group by t.normalized_email, t.email
        order by max(t.created_at) desc
        limit 20
      `,
    );

    return {
      items: result.rows.map((row) => ({
        email: row.email,
        lastSeenAt: new Date(row.requested_at).toISOString(),
      })),
    };
  }

  async approveEmail(input: { email?: string }) {
    const normalizedEmail = this.normalizeEmail(input.email);

    const pendingRequestResult = await this.databaseService.pool.query<{
      id: string;
      email: string;
    }>(
      `
        select id, email
        from email_verification_tokens
        where normalized_email = $1
          and purpose = 'access_request'
          and used_at is null
        order by created_at desc
        limit 1
      `,
      [normalizedEmail],
    );

    if (pendingRequestResult.rows.length === 0) {
      throw new NotFoundException('pending access request not found');
    }

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

    await this.databaseService.pool.query(
      `
        update email_verification_tokens
        set used_at = now()
        where id = $1
      `,
      [pendingRequestResult.rows[0].id],
    );

    const { selector, token } = await this.createEmailVerificationToken({
      email: pendingRequestResult.rows[0].email,
      purpose: 'login',
      expiresInMinutes: 15,
      requestedIp: null,
      requestedUserAgent: null,
    });

    await this.mailService.sendMail({
      to: pendingRequestResult.rows[0].email,
      subject: 'GlitterAtlas Access Approved',
      text:
        `Your temporary access request has been approved.\n\n` +
        `Complete access here: ${this.appBaseUrl}/auth/complete?selector=${encodeURIComponent(selector)}&token=${encodeURIComponent(token)}\n`,
    });

    return { ok: true, email: normalizedEmail };
  }

  async loginWithPassword(input: {
    email?: string;
    password?: string;
    createdIp?: string | null;
    createdUserAgent?: string | null;
  }) {
    const normalizedEmail = this.normalizeEmail(input.email);
    const password = input.password?.trim();

    if (!password) {
      throw new BadRequestException('password is required');
    }

    const userResult = await this.databaseService.pool.query<{
      id: string;
      email: string;
      password_hash: string | null;
      is_super_admin: boolean;
    }>(
      `
        select id, email, password_hash, is_super_admin
        from approved_users
        where normalized_email = $1
          and is_active = true
        limit 1
      `,
      [normalizedEmail],
    );

    if (userResult.rows.length === 0) {
      throw new UnauthorizedException('invalid credentials');
    }

    const userRow = userResult.rows[0];

    if (!userRow.password_hash) {
      throw new UnauthorizedException('account activation required');
    }

    const passwordMatches = await compare(password, userRow.password_hash);

    if (!passwordMatches) {
      throw new UnauthorizedException('invalid credentials');
    }

    const sessionToken = randomBytes(32).toString('hex');
    const sessionTokenHash = this.hashValue(sessionToken);
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    await this.databaseService.pool.query(
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
        values ($1, $2, $3, 'approved', $4, $5, $6, $7)
      `,
      [
        sessionTokenHash,
        userRow.email,
        normalizedEmail,
        userRow.id,
        expiresAt,
        input.createdIp ?? null,
        input.createdUserAgent ?? null,
      ],
    );

    return {
      ok: true,
      activationRequired: false,
      email: userRow.email,
      sessionToken,
      expiresAt,
      isSuperAdmin: userRow.is_super_admin,
    };
  }

  async activateAccount(input: {
    sessionToken?: string | null;
    email?: string;
    password?: string;
  }) {
    const password = input.password?.trim();

    if (!password) {
      throw new BadRequestException('password is required');
    }

    if (password.length < 8) {
      throw new BadRequestException('password must be at least 8 characters');
    }

    const sessionToken = input.sessionToken?.trim();

    if (!sessionToken) {
      throw new UnauthorizedException('authentication required');
    }

    const client = await this.databaseService.pool.connect();

    try {
      await client.query('begin');
      const activationSession = await this.getActivationSessionContext(
        sessionToken,
        client,
      );

      if (input.email && this.normalizeEmail(input.email) !== activationSession.normalizedEmail) {
        throw new BadRequestException('email cannot be changed');
      }

      const userResult = await client.query<{
        id: string;
        email: string;
        password_hash: string | null;
      }>(
        `
          select id, email, password_hash
          from approved_users
          where id = $1
            and normalized_email = $2
            and is_active = true
          limit 1
        `,
        [activationSession.approvedUserId, activationSession.normalizedEmail],
      );

      if (userResult.rows.length === 0) {
        throw new UnauthorizedException('approved account not found');
      }

      const userRow = userResult.rows[0];

      if (userRow.password_hash) {
        throw new ConflictException('account already activated');
      }

      const passwordHash = await hash(password, 12);

      await client.query(
        `
          update approved_users
          set email = $1,
              password_hash = $2,
              updated_at = now()
          where id = $3
        `,
        [activationSession.email, passwordHash, userRow.id],
      );

      await client.query(
        `
          update auth_sessions
          set session_type = 'approved'
          where id = $1
        `,
        [activationSession.sessionId],
      );

      await client.query('commit');

      return {
        ok: true,
        email: activationSession.email,
      };
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }

  async sendActivationResetEmail(input: {
    sessionToken?: string | null;
  }) {
    const sessionToken = input.sessionToken?.trim();

    if (!sessionToken) {
      throw new UnauthorizedException('authentication required');
    }

    const activationSession = await this.getActivationSessionContext(sessionToken);
    const { selector, token } = await this.createEmailVerificationToken({
      email: activationSession.email,
      purpose: 'login',
      expiresInMinutes: 15,
      requestedIp: null,
      requestedUserAgent: null,
    });

    await this.mailService.sendMail({
      to: activationSession.email,
      subject: 'GlitterAtlas Account Activation Link',
      text:
        `Use this email to continue activating your account.\n\n` +
        `Continue here: ${this.appBaseUrl}/auth/complete?selector=${encodeURIComponent(selector)}&token=${encodeURIComponent(token)}\n\n` +
        'This link expires in 15 minutes and can only be used once.',
    });

    return {
      ok: true,
      email: activationSession.email,
    };
  }

  async startPasswordReset(input: {
    email?: string;
    requestedIp?: string | null;
    requestedUserAgent?: string | null;
  }) {
    const normalizedEmail = this.normalizeEmail(input.email);
    const userResult = await this.databaseService.pool.query<{
      email: string;
      password_hash: string | null;
    }>(
      `
        select email, password_hash
        from approved_users
        where normalized_email = $1
          and is_active = true
        limit 1
      `,
      [normalizedEmail],
    );

    if (userResult.rows.length === 0 || !userResult.rows[0].password_hash) {
      throw new ConflictException('password reset is available only for activated accounts');
    }

    const { selector, token } = await this.createEmailVerificationToken({
      email: userResult.rows[0].email,
      purpose: 'password_reset',
      expiresInMinutes: 15,
      requestedIp: input.requestedIp ?? null,
      requestedUserAgent: input.requestedUserAgent ?? null,
    });

    const resetUrl =
      `${this.appBaseUrl}/auth/reset-password?selector=${encodeURIComponent(selector)}` +
      `&token=${encodeURIComponent(token)}`;

    await this.mailService.sendMail({
      to: userResult.rows[0].email,
      subject: 'GlitterAtlas Password Reset',
      text:
        `Use this link to reset your password:\n\n${resetUrl}\n\n` +
        'This link expires in 15 minutes and can only be used once.',
    });

    return {
      ok: true,
      email: userResult.rows[0].email,
    };
  }

  async getPasswordResetTarget(input: {
    selector?: string;
    token?: string;
  }) {
    const tokenRow = await this.getEmailVerificationToken({
      selector: input.selector,
      token: input.token,
      purpose: 'password_reset',
    });

    const userResult = await this.databaseService.pool.query<{
      email: string;
      password_hash: string | null;
    }>(
      `
        select email, password_hash
        from approved_users
        where normalized_email = $1
          and is_active = true
        limit 1
      `,
      [tokenRow.normalizedEmail],
    );

    if (userResult.rows.length === 0 || !userResult.rows[0].password_hash) {
      throw new ConflictException('password reset is available only for activated accounts');
    }

    return {
      ok: true,
      email: userResult.rows[0].email,
    };
  }

  async completePasswordReset(input: {
    selector?: string;
    token?: string;
    email?: string;
    password?: string;
  }) {
    const password = input.password?.trim();

    if (!password) {
      throw new BadRequestException('password is required');
    }

    if (password.length < 8) {
      throw new BadRequestException('password must be at least 8 characters');
    }

    const tokenRow = await this.getEmailVerificationToken({
      selector: input.selector,
      token: input.token,
      purpose: 'password_reset',
    });

    if (input.email && this.normalizeEmail(input.email) !== tokenRow.normalizedEmail) {
      throw new BadRequestException('email cannot be changed');
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

      const userResult = await client.query<{
        id: string;
        email: string;
        password_hash: string | null;
      }>(
        `
          select id, email, password_hash
          from approved_users
          where normalized_email = $1
            and is_active = true
          limit 1
        `,
        [tokenRow.normalizedEmail],
      );

      if (userResult.rows.length === 0 || !userResult.rows[0].password_hash) {
        throw new ConflictException('password reset is available only for activated accounts');
      }

      const passwordHash = await hash(password, 12);

      await client.query(
        `
          update approved_users
          set email = $1,
              password_hash = $2,
              updated_at = now()
          where id = $3
        `,
        [userResult.rows[0].email, passwordHash, userResult.rows[0].id],
      );

      await client.query('commit');

      return {
        ok: true,
        email: userResult.rows[0].email,
      };
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
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

  private async getActivationSessionContext(
    sessionToken: string,
    client: QueryExecutor = this.databaseService.pool,
  ): Promise<ActivationSessionContext> {
    const sessionResult = await client.query<{
      id: string;
      email: string;
      normalized_email: string;
      approved_user_id: string | null;
      revoked_at: Date | string | null;
      expires_at: Date | string;
      session_type: 'temporary' | 'activation' | 'approved';
    }>(
      `
        select id, email, normalized_email, approved_user_id, revoked_at, expires_at, session_type
        from auth_sessions
        where session_token_hash = $1
        limit 1
      `,
      [this.hashValue(sessionToken)],
    );

    if (sessionResult.rows.length === 0) {
      throw new UnauthorizedException('authentication required');
    }

    const sessionRow = sessionResult.rows[0];

    if (sessionRow.revoked_at || new Date(sessionRow.expires_at).getTime() <= Date.now()) {
      throw new UnauthorizedException('authentication required');
    }

    if (sessionRow.session_type !== 'activation' || !sessionRow.approved_user_id) {
      throw new UnauthorizedException('activation session required');
    }

    return {
      sessionId: sessionRow.id,
      email: sessionRow.email,
      normalizedEmail: sessionRow.normalized_email,
      approvedUserId: sessionRow.approved_user_id,
    };
  }

  private async createEmailVerificationToken(input: {
    email: string;
    purpose: string;
    expiresInMinutes: number;
    requestedIp: string | null;
    requestedUserAgent: string | null;
  }) {
    const selector = randomBytes(12).toString('hex');
    const token = randomBytes(32).toString('hex');
    const tokenHash = this.hashValue(token);
    const expiresAt = new Date(Date.now() + input.expiresInMinutes * 60 * 1000);

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
        values ($1, $2, $3, $4, $5, $6, $7, $8)
      `,
      [
        input.email,
        input.email,
        selector,
        tokenHash,
        input.purpose,
        expiresAt,
        input.requestedIp,
        input.requestedUserAgent,
      ],
    );

    return {
      selector,
      token,
    };
  }

  private async getEmailVerificationToken(input: {
    selector?: string;
    token?: string;
    purpose: string;
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
      purpose: string;
      expires_at: Date | string;
      used_at: Date | string | null;
    }>(
      `
        select id, email, normalized_email, token_hash, purpose, expires_at, used_at
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

    if (tokenRow.purpose !== input.purpose) {
      throw new BadRequestException('invalid verification token');
    }

    if (tokenRow.used_at) {
      throw new ConflictException('verification token already used');
    }

    if (new Date(tokenRow.expires_at).getTime() <= Date.now()) {
      throw new GoneException('verification token expired');
    }

    if (this.hashValue(token) !== tokenRow.token_hash) {
      throw new BadRequestException('invalid verification token');
    }

    return {
      id: tokenRow.id,
      email: tokenRow.email,
      normalizedEmail: tokenRow.normalized_email,
    };
  }

  private buildAnonymousSession(): SessionState {
    return {
      authenticated: false,
      sessionType: null,
      activationRequired: false,
      email: null,
      isSuperAdmin: false,
    };
  }
}
