import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SubscriptionService } from './subscription.service';
import { UsageTrackingService } from './usage-tracking.service';
import type { PlanLimitMetric } from '@crm/shared';

export const PLAN_LIMIT_KEY = 'plan_limit_metric';

export const CheckPlanLimit = (metric: PlanLimitMetric) =>
  SetMetadata(PLAN_LIMIT_KEY, metric);

@Injectable()
export class PlanLimitsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly subscriptionService: SubscriptionService,
    private readonly usageTrackingService: UsageTrackingService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const metric = this.reflector.getAllAndOverride<PlanLimitMetric>(
      PLAN_LIMIT_KEY,
      [ctx.getHandler(), ctx.getClass()],
    );
    if (!metric) return true;

    const req = ctx.switchToHttp().getRequest();
    const orgId: string | undefined = req.tenant?.organization_id;
    if (!orgId) return true;

    const overview = await this.subscriptionService.getOverview(orgId);
    const limit = overview.limits[metric];
    if (limit === -1) return true; // unlimited plan

    const usage = await this.usageTrackingService.getCurrentUsage(orgId);
    if (usage[metric] >= limit) {
      throw new HttpException(
        {
          message: 'Plan limit reached',
          metric,
          limit,
          current: usage[metric],
        },
        HttpStatus.PAYMENT_REQUIRED,
      );
    }
    return true;
  }
}
