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
    const clientID = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const callbackURL = process.env.GOOGLE_CALLBACK_URL;

    if (!clientID || !clientSecret || !callbackURL || clientID.includes('placeholder')) {
      // In development, we might not have these yet, but let's log it
      console.warn('Google OAuth credentials are not properly configured.');
    }

    super({
      clientID: clientID || 'dummy-id',
      clientSecret: clientSecret || 'dummy-secret',
      callbackURL: callbackURL || 'http://localhost:3001/api/auth/google/callback',
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
