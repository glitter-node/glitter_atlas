import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthAccessLevel, AUTH_ACCESS_KEY } from './auth-access.decorator';
import { AuthService } from './auth.service';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(AuthService)
    private readonly authService: AuthService,
  ) {
    console.log('[api] AuthGuard.constructor');
  }

  async canActivate(context: ExecutionContext) {
    const requiredAccess = this.reflector.get<AuthAccessLevel | undefined>(
      AUTH_ACCESS_KEY,
      context.getHandler(),
    );

    if (!requiredAccess) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{ headers?: { cookie?: string } }>();
    const session = await this.authService.getSession(
      this.readSessionToken(request?.headers?.cookie),
    );

    if (!session.authenticated) {
      throw new UnauthorizedException('authentication required');
    }

    if (requiredAccess === 'approved' && session.sessionType !== 'approved') {
      throw new ForbiddenException('approved access required');
    }

    if (
      requiredAccess === 'super_admin' &&
      (session.sessionType !== 'approved' || !session.isSuperAdmin)
    ) {
      throw new ForbiddenException('super admin access required');
    }

    return true;
  }

  private readSessionToken(cookieHeader?: string) {
    const cookie = cookieHeader
      ?.split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith('glitter_atlas_session='));

    return cookie ? cookie.slice('glitter_atlas_session='.length) : null;
  }
}
