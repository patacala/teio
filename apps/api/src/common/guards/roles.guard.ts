import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import type { TenantContext, UserRole } from '@crm/shared';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!required?.length) return true;

    const tenant = context.switchToHttp().getRequest()['tenant'] as TenantContext | undefined;
    if (!tenant) return false;

    if (!required.includes(tenant.role as UserRole)) {
      throw new ForbiddenException('Insufficient role');
    }

    return true;
  }
}
