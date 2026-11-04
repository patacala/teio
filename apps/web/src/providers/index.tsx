'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MotionConfig } from 'framer-motion';
import { useState } from 'react';
import { Toaster } from 'sonner';
import { RealtimeProvider } from './realtime-provider';
import { ImpersonationProvider } from '@/contexts/impersonation-context';

const toasterStyle = {
  '--normal-bg': 'var(--color-surface-overlay)',
  '--normal-border': 'var(--border-color-strong)',
  '--normal-text': 'var(--text-color-primary)',
  '--border-radius': '0.875rem',
} as React.CSSProperties;

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            retry: 1,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <MotionConfig reducedMotion="user">
        <ImpersonationProvider>
          <RealtimeProvider>
            {children}
            <Toaster
              theme="dark"
              position="bottom-right"
              duration={5000}
              style={toasterStyle}
              toastOptions={{
                classNames: {
                  toast: 'shadow-menu!',
                  description: 'text-secondary!',
                  success: '[&_[data-icon]]:text-success',
                  error: '[&_[data-icon]]:text-danger',
                  warning: '[&_[data-icon]]:text-warning',
                  info: '[&_[data-icon]]:text-info',
                },
              }}
            />
          </RealtimeProvider>
        </ImpersonationProvider>
      </MotionConfig>
    </QueryClientProvider>
  );
}
