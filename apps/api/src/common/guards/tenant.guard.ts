/**
 * @deprecated Tenant context is now resolved by TenantContextMiddleware.
 * This guard is a no-op stub kept for backwards compatibility.
 * Remove all imports of TenantGuard from controllers.
 */
import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';

@Injectable()
export class TenantGuard implements CanActivate {
  canActivate(_context: ExecutionContext): boolean {
    return true;
  }
}
