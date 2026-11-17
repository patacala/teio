'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { DemoDefaultsCard } from './_components/DemoDefaultsCard';
import { DemoOrganizationsCard } from './_components/DemoOrganizationsCard';

/** The organizations card, searched from `?search=` when linked from elsewhere. */
function SearchableDemoOrganizations() {
  // null outside the App Router (e.g. rendered on its own in tests)
  const search = useSearchParams()?.get('search') ?? '';
  return <DemoOrganizationsCard key={search} initialSearch={search} />;
}

export default function DemoAccountsPage() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-semibold text-primary">Demo accounts</h1>
        <p className="mt-0.5 text-xs text-secondary">
          Demo organizations get every feature within these usage limits until they choose a paid plan.
        </p>
      </div>
      <DemoDefaultsCard />
      <Suspense fallback={<DemoOrganizationsCard />}>
        <SearchableDemoOrganizations />
      </Suspense>
    </div>
  );
}
