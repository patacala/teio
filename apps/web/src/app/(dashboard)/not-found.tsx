import Link from 'next/link';
import { Compass } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export default function DashboardNotFound() {
  return (
    <div className="flex h-full min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
      <Compass className="h-10 w-10 text-muted" />
      <h1 className="text-xl font-bold text-primary">Page not found</h1>
      <p className="max-w-sm text-sm text-secondary">
        This page doesn&apos;t exist or has moved.
      </p>
      <Link href="/" className={cn(buttonVariants())}>
        Back to dashboard
      </Link>
    </div>
  );
}
