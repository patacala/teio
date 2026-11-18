import { Injectable, Optional } from '@nestjs/common';
import { BillingAccessService } from '../../billing/billing-access.service';

/** Automated actions that consume a metered, limited resource. */
export type GuardedMetric = 'messages' | 'voice_minutes';

/**
 * Billing checks shared by agenda follow-ups and automation steps: a
 * restricted organization runs nothing, and a metered action stops at the
 * plan limit. Returns the reason when the action must not run.
 */
@Injectable()
export class ActionGuardService {
  constructor(@Optional() private readonly billingAccess?: BillingAccessService) {}

  async blockReason(organizationId: string, metric?: GuardedMetric, amount = 1): Promise<string | null> {
    if (!this.billingAccess) return null;
    if (!(await this.billingAccess.isOperational(organizationId))) return 'Organization billing is restricted';
    if (!metric) return null;
    const check = await this.billingAccess.checkLimit(organizationId, metric, amount);
    return check.allowed ? null : `Monthly ${metric.replace('_', ' ')} limit reached (${check.limit})`;
  }
}
