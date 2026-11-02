import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { TenantContext } from '@crm/shared';

export const CurrentTenant = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): TenantContext => {
    const request = ctx.switchToHttp().getRequest();
    return request.tenant as TenantContext;
  },
);
