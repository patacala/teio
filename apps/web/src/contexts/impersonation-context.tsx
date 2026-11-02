'use client';

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { setImpersonatedOrgId } from '@/lib/auth-client';
import { createClient } from '@/lib/supabase';

interface ImpersonationState {
  organizationId: string | null;
  organizationName: string | null;
}

interface ImpersonationContextValue extends ImpersonationState {
  isImpersonating: boolean;
  startImpersonating: (orgId: string, orgName: string) => void;
  stopImpersonating: () => void;
}

const ImpersonationContext = createContext<ImpersonationContextValue>({
  organizationId: null,
  organizationName: null,
  isImpersonating: false,
  startImpersonating: () => {},
  stopImpersonating: () => {},
});

const STORAGE_KEY = 'crm:impersonation';

export function ImpersonationProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<ImpersonationState>({
    organizationId: null,
    organizationName: null,
  });

  // Restore from sessionStorage on mount
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as ImpersonationState;
        if (parsed.organizationId) {
          setState(parsed);
          setImpersonatedOrgId(parsed.organizationId);
        }
      }
    } catch {
      // ignore
    }
  }, []);

  const startImpersonating = useCallback((orgId: string, orgName: string) => {
    const next: ImpersonationState = { organizationId: orgId, organizationName: orgName };
    setState(next);
    setImpersonatedOrgId(orgId);
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    queryClient.invalidateQueries();
  }, [queryClient]);

  const stopImpersonating = useCallback(() => {
    setState({ organizationId: null, organizationName: null });
    setImpersonatedOrgId(null);
    sessionStorage.removeItem(STORAGE_KEY);
    queryClient.invalidateQueries();
  }, [queryClient]);

  useEffect(() => {
    const supabase = createClient();
    let active = true;
    let knownUserId: string | null | undefined;
    let sawSignOut = false;

    const dropSessionCache = () => {
      setState({ organizationId: null, organizationName: null });
      setImpersonatedOrgId(null);
      try {
        sessionStorage.removeItem(STORAGE_KEY);
      } catch {
        // ignore
      }
      queryClient.clear();
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      const nextId = session?.user?.id ?? null;

      if (event === 'SIGNED_OUT') {
        sawSignOut = true;
        knownUserId = null;
        setTimeout(() => {
          if (active) dropSessionCache();
        }, 0);
        return;
      }

      if (event === 'SIGNED_IN') {
        const switchedUser = knownUserId != null && nextId != null && knownUserId !== nextId;
        if (sawSignOut || switchedUser) {
          sawSignOut = false;
          setTimeout(() => {
            if (active) dropSessionCache();
          }, 0);
        }
        knownUserId = nextId;
        return;
      }

      if (knownUserId === undefined) knownUserId = nextId;
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [queryClient]);

  return (
    <ImpersonationContext.Provider
      value={{
        ...state,
        isImpersonating: !!state.organizationId,
        startImpersonating,
        stopImpersonating,
      }}
    >
      {children}
    </ImpersonationContext.Provider>
  );
}

export function useImpersonation() {
  return useContext(ImpersonationContext);
}
