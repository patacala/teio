import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PLATFORM_ADMIN_KEY } from '../decorators/platform-admin.decorator';

@Injectable()
export class PlatformAdminGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiresPlatformAdmin = this.reflector.getAllAndOverride<boolean>(
      IS_PLATFORM_ADMIN_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiresPlatformAdmin) return true;

    const req = context.switchToHttp().getRequest();
    if (!req.user?.is_platform_admin) {
      throw new ForbiddenException('Platform admin access required');
    }
    return true;
  }
}
