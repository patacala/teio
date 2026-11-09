'use client';

import { DemoDefaultsCard } from './_components/DemoDefaultsCard';
import { DemoOrganizationsCard } from './_components/DemoOrganizationsCard';

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
      <DemoOrganizationsCard />
    </div>
  );
}
