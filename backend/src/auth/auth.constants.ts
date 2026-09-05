import { CookieOptions } from 'express';

export const ACCESS_TOKEN_COOKIE = 'access_token';

// Should stay in sync with JWT_EXPIRES_IN in .env (default "7d").
export const ACCESS_TOKEN_COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const isProduction = process.env.NODE_ENV === 'production';

// Frontend (Vercel) and backend (Railway/etc.) live on different domains in
// production, so the cookie must be SameSite=None (+ Secure, required by
// browsers for None) to be sent on cross-origin fetch() calls. In dev,
// localhost:3000 -> localhost:3001 is same-site, so Lax works and avoids
// needing HTTPS locally.
export const ACCESS_TOKEN_COOKIE_OPTIONS: CookieOptions = {
  httpOnly: true,
  secure: isProduction,
  sameSite: isProduction ? 'none' : 'lax',
  path: '/',
};
