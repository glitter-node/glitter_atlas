import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Inject,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { RequireAuthAccess } from './auth-access.decorator';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(
    @Inject(AuthService)
    private readonly authService: AuthService,
  ) {}

  @Post('email/start')
  @HttpCode(200)
  startEmail(
    @Body() body: { email?: string },
    @Headers('user-agent') userAgent?: string,
    @Req() request?: { ip?: string },
  ) {
    return this.authService.startEmail({
      email: body?.email,
      requestedIp: request?.ip ?? null,
      requestedUserAgent: userAgent ?? null,
    });
  }

  @Get('email/verify')
  async verifyEmail(
    @Query('selector') selector?: string,
    @Query('token') token?: string,
    @Query('format') format?: string,
    @Headers('user-agent') userAgent?: string,
    @Req() request?: { ip?: string; headers?: { cookie?: string } },
    @Res() reply?: {
      header: (name: string, value: string) => unknown;
      code: (statusCode: number) => unknown;
      redirect: (location: string) => unknown;
      send: (body: unknown) => unknown;
    },
  ) {
    const result = await this.authService.verifyEmail({
      selector,
      token,
      createdIp: request?.ip ?? null,
      createdUserAgent: userAgent ?? null,
    });

    const secure = this.shouldUseSecureCookies(request?.headers?.cookie);
    reply?.header(
      'Set-Cookie',
      this.buildSessionCookie(result.sessionToken, result.expiresAt, secure),
    );

    if (format === 'json') {
      reply?.code(200);
      return reply?.send({
        ok: true,
        sessionType: result.sessionType,
        email: result.email,
      });
    }

    return reply?.redirect('/');
  }

  @Get('session')
  async getSession(
    @Headers('cookie') cookieHeader?: string,
  ) {
    return this.authService.getSession(this.readSessionToken(cookieHeader));
  }

  @Get('admin/pending-approvals')
  @UseGuards(AuthGuard)
  @RequireAuthAccess('super_admin')
  listPendingApprovals() {
    return this.authService.listPendingApprovals();
  }

  @Post('admin/approve')
  @UseGuards(AuthGuard)
  @RequireAuthAccess('super_admin')
  @HttpCode(200)
  approveEmail(@Body() body: { email?: string }) {
    return this.authService.approveEmail({ email: body?.email });
  }

  @Post('logout')
  @HttpCode(200)
  async logout(
    @Headers('cookie') cookieHeader?: string,
    @Res() reply?: {
      header: (name: string, value: string) => unknown;
      code: (statusCode: number) => unknown;
      send: (body: unknown) => unknown;
    },
  ) {
    await this.authService.logout(this.readSessionToken(cookieHeader));
    reply?.header(
      'Set-Cookie',
      'glitter_atlas_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0',
    );
    reply?.code(200);
    return reply?.send({ ok: true });
  }

  private readSessionToken(cookieHeader?: string) {
    const cookie = cookieHeader
      ?.split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith('glitter_atlas_session='));

    return cookie ? cookie.slice('glitter_atlas_session='.length) : null;
  }

  private buildSessionCookie(
    sessionToken: string,
    expiresAt: Date,
    secure: boolean,
  ) {
    const maxAge = Math.max(
      0,
      Math.floor((expiresAt.getTime() - Date.now()) / 1000),
    );

    return [
      `glitter_atlas_session=${sessionToken}`,
      'Path=/',
      'HttpOnly',
      'SameSite=Lax',
      `Max-Age=${maxAge}`,
      secure ? 'Secure' : null,
    ]
      .filter(Boolean)
      .join('; ');
  }

  private shouldUseSecureCookies(cookieHeader?: string) {
    void cookieHeader;
    return false;
  }
}
