import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';

const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 20;

/**
 * Basic in-memory per-IP rate limiter for the public responses endpoint.
 * Single-process only (matches the "1 instance, no Redis yet" note in
 * CLAUDE.md mục 3) — would need a shared store if scaled to multiple instances.
 */
@Injectable()
export class IpRateLimitGuard implements CanActivate {
  private readonly hits = new Map<string, { count: number; windowStart: number }>();

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const ip = request.ip ?? 'unknown';
    const now = Date.now();
    const entry = this.hits.get(ip);

    if (!entry || now - entry.windowStart > WINDOW_MS) {
      this.hits.set(ip, { count: 1, windowStart: now });
      return true;
    }

    entry.count += 1;
    if (entry.count > MAX_REQUESTS_PER_WINDOW) {
      throw new HttpException(
        'Quá nhiều yêu cầu, vui lòng thử lại sau.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return true;
  }
}
