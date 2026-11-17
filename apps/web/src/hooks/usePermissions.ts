'use client';

import { useCurrentUser } from '@/hooks/useTeam';
import { permissionsFor, type Permissions } from '@/lib/permissions';

export interface UsePermissionsResult extends Permissions {
  /** True until the current user is known — callers should not decide yet. */
  isLoading: boolean;
  isError: boolean;
}

export function usePermissions(): UsePermissionsResult {
  // `isPending`, not `isLoading`: until the auth user is known the query is
  // disabled, and a disabled query reports isLoading=false with no data —
  // deciding then would treat everyone as having no rights.
  const { data: user, isPending, isError } = useCurrentUser();
  return { ...permissionsFor(user), isLoading: isPending && !isError, isError };
}
