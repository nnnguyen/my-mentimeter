import { ExecutionContext, HttpException } from '@nestjs/common';
import { IpRateLimitGuard } from './ip-rate-limit.guard';

function contextForIp(ip: string): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ ip }),
    }),
  } as unknown as ExecutionContext;
}

describe('IpRateLimitGuard', () => {
  it('allows up to 20 requests per IP within the window', () => {
    const guard = new IpRateLimitGuard();
    const ctx = contextForIp('1.2.3.4');
    for (let i = 0; i < 20; i++) {
      expect(guard.canActivate(ctx)).toBe(true);
    }
  });

  it('blocks the 21st request within the same window with 429', () => {
    const guard = new IpRateLimitGuard();
    const ctx = contextForIp('1.2.3.4');
    for (let i = 0; i < 20; i++) {
      guard.canActivate(ctx);
    }
    expect(() => guard.canActivate(ctx)).toThrow(HttpException);
    try {
      guard.canActivate(ctx);
    } catch (err) {
      expect((err as HttpException).getStatus()).toBe(429);
    }
  });

  it('tracks each IP independently', () => {
    const guard = new IpRateLimitGuard();
    const ctxA = contextForIp('1.1.1.1');
    const ctxB = contextForIp('2.2.2.2');
    for (let i = 0; i < 20; i++) {
      guard.canActivate(ctxA);
    }
    expect(() => guard.canActivate(ctxA)).toThrow(HttpException);
    expect(guard.canActivate(ctxB)).toBe(true);
  });
});
