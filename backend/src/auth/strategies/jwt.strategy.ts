import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-jwt';
import type { Request } from 'express';
import { ACCESS_TOKEN_COOKIE } from '../auth.constants';

export interface JwtPayload {
  sub: string;
  email: string;
  name: string;
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor() {
    super({
      jwtFromRequest: (req: Request): string | null =>
        (req?.cookies?.[ACCESS_TOKEN_COOKIE] as string | undefined) ?? null,
      secretOrKey: process.env.JWT_SECRET ?? '',
    });
  }

  validate(payload: JwtPayload): AuthenticatedUser {
    return { id: payload.sub, email: payload.email, name: payload.name };
  }
}
