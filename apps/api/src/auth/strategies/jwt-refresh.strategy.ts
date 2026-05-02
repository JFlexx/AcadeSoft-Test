import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { JwtPayload } from '../auth.service';
import { AuthenticatedUser } from './jwt.strategy';

export const REFRESH_COOKIE = 'refresh_token';

@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(Strategy, 'jwt-refresh') {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (req: Request) => req?.cookies?.[REFRESH_COOKIE] ?? null,
      ]),
      secretOrKey: config.get<string>('JWT_REFRESH_SECRET') ?? '',
      ignoreExpiration: false,
    });
  }

  validate(payload: JwtPayload): AuthenticatedUser {
    if (!payload) throw new UnauthorizedException();
    return { userId: payload.sub, tenantId: payload.tenantId, role: payload.role };
  }
}
