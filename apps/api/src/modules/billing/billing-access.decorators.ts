import { SetMetadata } from '@nestjs/common';
import type { PlanFeature, PlanLimitMetric } from '@crm/shared';

export const SKIP_BILLING_CHECK_KEY = 'skip_billing_check';
export const REQUIRED_PLAN_FEATURE_KEY = 'required_plan_feature';
export const PLAN_LIMIT_KEY = 'plan_limit_metric';

/** Endpoints that must keep working whatever the billing state (billing itself, session bootstrap). */
export const SkipBillingCheck = () => SetMetadata(SKIP_BILLING_CHECK_KEY, true);

/** Rejects with 402 unless the organization's effective plan includes `feature`. */
export const RequiresPlanFeature = (feature: PlanFeature) =>
  SetMetadata(REQUIRED_PLAN_FEATURE_KEY, feature);

/** Rejects with 402 once current usage of `metric` reaches the effective plan limit. */
export const CheckPlanLimit = (metric: PlanLimitMetric) => SetMetadata(PLAN_LIMIT_KEY, metric);
