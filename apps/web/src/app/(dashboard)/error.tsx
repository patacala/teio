'use client';

import { useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex h-full min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
      <AlertTriangle className="h-10 w-10 text-danger" />
      <h1 className="text-xl font-bold text-primary">Something went wrong</h1>
      <p className="max-w-sm text-sm text-secondary">
        An unexpected error occurred while loading this page.
      </p>
      <Button onClick={reset}>Try again</Button>
    </div>
  );
}
