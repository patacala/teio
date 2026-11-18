'use client';

import { use } from 'react';
import Link from 'next/link';
import { Skeleton } from '@/components/ui/skeleton';
import { useAutomation } from '@/hooks/useAutomations';
import { AutomationBuilder } from '@/components/automations/builder/AutomationBuilder';

export default function AutomationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: automation, isLoading, error } = useAutomation(id);

  if (isLoading) return <Skeleton className="h-full min-h-[560px] w-full rounded-xl" />;
  if (error || !automation) {
    return (
      <div className="rounded-xl border border-subtle p-10 text-center">
        <p className="text-sm text-primary">This automation could not be loaded.</p>
        <Link href="/config/automations" className="mt-2 inline-block text-xs text-accent hover:underline">
          Back to automations
        </Link>
      </div>
    );
  }
  return <AutomationBuilder key={automation.id} automation={automation} />;
}
