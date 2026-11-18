import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * Metadata key @Throttle() writes for the "default" throttler
 * (`THROTTLER:LIMIT` + name in @nestjs/throttler; not exported by the package,
 * pinned by opt-in-throttler.guard.spec.ts).
 */
export const THROTTLE_LIMIT_METADATA = 'THROTTLER:LIMITdefault';

/**
 * Rate limiting is opt-in: only routes (or controllers) that declare
 * @Throttle() are limited. Applying a global default would throttle provider
 * webhooks (Stripe, Retell, channels) and server-to-server integrations that
 * legitimately burst from one IP, and a 429 there loses events.
 *
 * Who is counted:
 *  - signed-in users: the user;
 *  - API keys: the organization (every API key request carries the same
 *    placeholder user id, so counting by user would lump all orgs together);
 *  - anonymous requests: the client IP. `req.ip` is proxy-aware because
 *    main.ts sets Express "trust proxy" (TRUST_PROXY).
 */
@Injectable()
export class OptInThrottlerGuard extends ThrottlerGuard {
  protected async shouldSkip(context: ExecutionContext): Promise<boolean> {
    const declared = this.reflector.getAllAndOverride<number | undefined>(THROTTLE_LIMIT_METADATA, [
      context.getHandler(),
      context.getClass(),
    ]);
    return declared === undefined;
  }

  protected async getTracker(req: Record<string, any>): Promise<string> {
    const user = req.user as { id?: string; organization_id?: string; role?: string } | undefined;
    if (user?.role === 'api_key' && user.organization_id) return `org:${user.organization_id}`;
    if (user?.id && user.role !== 'api_key') return `user:${user.id}`;
    return `ip:${req.ip ?? 'unknown'}`;
  }
}
