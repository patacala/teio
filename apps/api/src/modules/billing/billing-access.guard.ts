import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { BillingAccessLevel } from '@crm/shared';
import type { BillingAccess, PlanFeature, PlanLimitMetric } from '@crm/shared';
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator';
import { BillingAccessService } from './billing-access.service';
import { hasFeature } from './billing-access.policy';
import {
  PLAN_LIMIT_KEY,
  REQUIRED_PLAN_FEATURE_KEY,
  SKIP_BILLING_CHECK_KEY,
} from './billing-access.decorators';

function paymentRequired(message: string, code: string, access: BillingAccess, extra: Record<string, unknown> = {}) {
  return new HttpException(
    {
      message,
      errors: {
        code,
        access_level: access.level,
        status: access.status,
        reasons: access.reasons,
        ...extra,
      },
    },
    HttpStatus.PAYMENT_REQUIRED,
  );
}

const METRIC_LABELS: Record<PlanLimitMetric, string> = {
  conversations: 'conversations',
  messages: 'messages',
  ai_calls: 'AI calls',
  voice_minutes: 'voice minutes',
  agents: 'team members',
};

export function limitReachedMessage(metric: PlanLimitMetric, limit: number, isDemo: boolean): string {
  const period = metric === 'agents' ? '' : ' this month';
  const next = isDemo ? 'Choose a plan to continue.' : 'Upgrade your plan to continue.';
  return `You have reached your limit of ${limit.toLocaleString('en-US')} ${METRIC_LABELS[metric]}${period}. ${next}`;
}

/**
 * Global guard that applies the organization's billing access to every
 * authenticated tenant request. Registered after auth/role guards.
 */
@Injectable()
export class BillingAccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly billingAccess: BillingAccessService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (ctx.getType() !== 'http') return true;

    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) return true;
    if (this.reflector.getAllAndOverride<boolean>(SKIP_BILLING_CHECK_KEY, targets)) return true;

    const req = ctx.switchToHttp().getRequest<Request>();
    const orgId = req.tenant?.organization_id;
    if (!orgId || req.user?.is_platform_admin) return true;

    const access = await this.billingAccess.getAccess(orgId);

    if (access.level === BillingAccessLevel.SUSPENDED) {
      throw new ForbiddenException({
        message: 'This organization is inactive. Contact support to reactivate it.',
        errors: { code: 'ORGANIZATION_SUSPENDED', access_level: access.level, reasons: access.reasons },
      });
    }

    if (access.level === BillingAccessLevel.BLOCKED) {
      throw paymentRequired(
        'Payment required. Access is blocked until the subscription is paid.',
        'BILLING_BLOCKED',
        access,
      );
    }

    const feature = this.reflector.getAllAndOverride<PlanFeature>(REQUIRED_PLAN_FEATURE_KEY, targets);
    if (feature && !hasFeature(access, feature)) {
      throw paymentRequired(
        'Your current plan does not include this feature.',
        'PLAN_FEATURE_UNAVAILABLE',
        access,
        { feature },
      );
    }

    const metric = this.reflector.getAllAndOverride<PlanLimitMetric>(PLAN_LIMIT_KEY, targets);
    if (metric) {
      const check = await this.billingAccess.checkLimit(orgId, metric);
      if (!check.allowed) {
        throw paymentRequired(limitReachedMessage(check.metric, check.limit, access.is_demo), 'PLAN_LIMIT_REACHED', access, {
          metric,
          limit: check.limit,
          current: check.current,
        });
      }
    }

    return true;
  }
}
