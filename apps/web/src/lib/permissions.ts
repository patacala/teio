/**
 * What the signed-in user may see and do in the web app. This mirrors the API
 * guards so we never show a button the API will reject. The API stays the real
 * barrier; this only keeps the UI honest.
 */
export interface PermissionSubject {
  role?: string | null;
  is_platform_admin?: boolean | null;
}

export interface Permissions {
  /** Owner or admin of the organization, or a platform admin. */
  isAdmin: boolean;
  /** AI agent, channels, webhooks, payment setup & prices (API: @AdminOnly). */
  canManageConfiguration: boolean;
  /** Admin area: team, billing, API keys. */
  canAccessAdmin: boolean;
  /** Payments that need a person after a failed booking (API: owner/admin/agent). */
  canResolvePaymentAttention: boolean;
  /** Book outside calendar rules and delete appointments (API: owner/admin users). */
  canOverrideCalendarRules: boolean;
}

const ORG_ADMIN_ROLES = new Set(['owner', 'admin']);

export function permissionsFor(user: PermissionSubject | null | undefined): Permissions {
  const role = user?.role ?? null;
  const isPlatformAdmin = user?.is_platform_admin === true;
  // The API guards check the organization role only (tenant.role). A platform
  // admin keeps their own role while impersonating, so configuration rights
  // must follow the org role too, or we'd show buttons the API rejects.
  const isOrgAdmin = role !== null && ORG_ADMIN_ROLES.has(role);
  return {
    isAdmin: isOrgAdmin || isPlatformAdmin,
    canManageConfiguration: isOrgAdmin,
    canAccessAdmin: isOrgAdmin || isPlatformAdmin,
    canResolvePaymentAttention: isOrgAdmin || role === 'agent',
    canOverrideCalendarRules: isOrgAdmin,
  };
}
