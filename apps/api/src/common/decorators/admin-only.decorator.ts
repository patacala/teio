import { UserRole } from '@crm/shared';
import { Roles } from './roles.decorator';

/** Roles allowed to change organization configuration (AI agent, channels, webhooks, prices). */
export const ORG_ADMIN_ROLES: UserRole[] = [UserRole.OWNER, UserRole.ADMIN];

/**
 * Restricts a route to organization owners and admins. API keys (role
 * `api_key`) and agents get 403 — none of the routes using this are part of
 * the documented API-key contract.
 */
export const AdminOnly = () => Roles(...ORG_ADMIN_ROLES);
