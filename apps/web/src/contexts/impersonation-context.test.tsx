import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setImpersonatedOrgId } from '@/lib/auth-client';
import { conversationsService } from '@/services/conversations.service';
import { mockApi } from '@/test/msw/api';
import { createQueryWrapper } from '@/test/query';
import { authListenerCount, emitAuthStateChange, testSession } from '@/test/supabase';
import { ImpersonationProvider, useImpersonation } from './impersonation-context';

const STORAGE_KEY = 'crm:impersonation';

function renderImpersonation() {
  const { queryClient, wrapper: QueryWrapper } = createQueryWrapper();
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
  const clear = vi.spyOn(queryClient, 'clear');
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryWrapper>
      <ImpersonationProvider>{children}</ImpersonationProvider>
    </QueryWrapper>
  );
  const hook = renderHook(() => useImpersonation(), { wrapper });
  return { ...hook, invalidate, clear };
}

async function orgHeaderOfNextRequest() {
  const calls = mockApi('get', '/conversations', { data: { items: [], meta: {} } });
  await conversationsService.getConversations();
  return calls[0].headers.get('x-organization-id');
}

const flushTimers = () => act(() => new Promise((resolve) => setTimeout(resolve, 0)));

beforeEach(() => {
  sessionStorage.clear();
});

afterEach(() => {
  setImpersonatedOrgId(null);
});

describe('ImpersonationProvider', () => {
  it('starts with no impersonation', () => {
    const { result } = renderImpersonation();

    expect(result.current).toMatchObject({ organizationId: null, organizationName: null, isImpersonating: false });
  });

  it('impersonating an org updates state, persists it, scopes API requests and refetches data', async () => {
    const { result, invalidate } = renderImpersonation();

    act(() => result.current.startImpersonating('org-9', 'Clínica Dental'));

    expect(result.current).toMatchObject({
      organizationId: 'org-9',
      organizationName: 'Clínica Dental',
      isImpersonating: true,
    });
    expect(JSON.parse(sessionStorage.getItem(STORAGE_KEY)!)).toEqual({
      organizationId: 'org-9',
      organizationName: 'Clínica Dental',
    });
    expect(await orgHeaderOfNextRequest()).toBe('org-9');
    expect(invalidate).toHaveBeenCalledTimes(1);
  });

  it('stopping returns to the own org everywhere', async () => {
    const { result, invalidate } = renderImpersonation();
    act(() => result.current.startImpersonating('org-9', 'Clínica Dental'));

    act(() => result.current.stopImpersonating());

    expect(result.current).toMatchObject({ organizationId: null, organizationName: null, isImpersonating: false });
    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(await orgHeaderOfNextRequest()).toBeNull();
    expect(invalidate).toHaveBeenCalledTimes(2);
  });

  describe('restoring after a reload', () => {
    it('resumes a saved impersonation', async () => {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ organizationId: 'org-9', organizationName: 'Clínica Dental' }));

      const { result } = renderImpersonation();

      await waitFor(() => expect(result.current.isImpersonating).toBe(true));
      expect(result.current.organizationName).toBe('Clínica Dental');
      expect(await orgHeaderOfNextRequest()).toBe('org-9');
    });

    it.each([
      ['corrupted JSON', '{not json'],
      ['an entry without an org id', JSON.stringify({ organizationId: null, organizationName: 'x' })],
    ])('ignores %s', async (_label, saved) => {
      sessionStorage.setItem(STORAGE_KEY, saved);

      const { result } = renderImpersonation();
      await flushTimers();

      expect(result.current.isImpersonating).toBe(false);
      expect(await orgHeaderOfNextRequest()).toBeNull();
    });
  });

  describe('auth changes', () => {
    it('drops the impersonation and every cached query on sign-out', async () => {
      const { result, clear } = renderImpersonation();
      act(() => emitAuthStateChange('INITIAL_SESSION', testSession({ userId: 'admin-1' })));
      act(() => result.current.startImpersonating('org-9', 'Clínica Dental'));

      act(() => emitAuthStateChange('SIGNED_OUT', null));
      await flushTimers();

      expect(result.current.isImpersonating).toBe(false);
      expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();
      expect(await orgHeaderOfNextRequest()).toBeNull();
      expect(clear).toHaveBeenCalledTimes(1);
    });

    it('clears the cache when a different user signs in', async () => {
      const { clear } = renderImpersonation();
      act(() => emitAuthStateChange('INITIAL_SESSION', testSession({ userId: 'user-a' })));

      act(() => emitAuthStateChange('SIGNED_IN', testSession({ userId: 'user-b' })));
      await flushTimers();

      expect(clear).toHaveBeenCalledTimes(1);
    });

    it('clears the cache when signing back in after a sign-out', async () => {
      const { clear } = renderImpersonation();
      act(() => emitAuthStateChange('SIGNED_OUT', null));
      await flushTimers();
      clear.mockClear();

      act(() => emitAuthStateChange('SIGNED_IN', testSession({ userId: 'user-a' })));
      await flushTimers();

      expect(clear).toHaveBeenCalledTimes(1);
    });

    it('keeps the cache when the same user signs in again (e.g. another tab)', async () => {
      const { result, clear } = renderImpersonation();
      act(() => emitAuthStateChange('INITIAL_SESSION', testSession({ userId: 'user-a' })));
      act(() => result.current.startImpersonating('org-9', 'Clínica Dental'));

      act(() => emitAuthStateChange('SIGNED_IN', testSession({ userId: 'user-a' })));
      act(() => emitAuthStateChange('TOKEN_REFRESHED', testSession({ userId: 'user-a' })));
      await flushTimers();

      expect(clear).not.toHaveBeenCalled();
      expect(result.current.isImpersonating).toBe(true);
    });

    it('unsubscribes on unmount and ignores a sign-out that lands afterwards', async () => {
      const { unmount, clear } = renderImpersonation();
      expect(authListenerCount()).toBe(1);

      act(() => emitAuthStateChange('SIGNED_OUT', null));
      unmount();
      await flushTimers();

      expect(authListenerCount()).toBe(0);
      expect(clear).not.toHaveBeenCalled();
    });
  });
});

describe('useImpersonation outside the provider', () => {
  it('returns an inert default', () => {
    const { result } = renderHook(() => useImpersonation());

    expect(result.current.isImpersonating).toBe(false);
    expect(() => result.current.startImpersonating('org-1', 'x')).not.toThrow();
  });
});
