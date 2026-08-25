import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, StrategyOptions, Profile } from 'passport-google-oauth20';

export interface GoogleProfile {
  googleId: string;
  email: string;
  name: string;
  avatarUrl: string | null;
}

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor() {
    super({
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.GOOGLE_CALLBACK_URL,
      scope: ['email', 'profile'],
    } as StrategyOptions);
  }

  validate(_accessToken: string, _refreshToken: string, profile: Profile): GoogleProfile {
    return {
      googleId: profile.id,
      email: profile.emails?.[0]?.value ?? '',
      name: profile.displayName,
      avatarUrl: profile.photos?.[0]?.value ?? null,
    };
  }
}
