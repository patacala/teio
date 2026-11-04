'use client';

import { useState } from 'react';
import { useCurrentUser } from '@/hooks/useTeam';
import { useImpersonation } from '@/contexts/impersonation-context';
import { EventTemplateMatrix } from './_components/EventTemplateMatrix';
import { EmailDesigner } from './_components/EmailDesigner';
import { DeliveryLogTable } from './_components/DeliveryLogTable';

type OrgTab = 'design' | 'history';

export default function CommunicationsPage() {
  const { data: currentUser } = useCurrentUser();
  const { isImpersonating } = useImpersonation();
  const isPlatformAdmin = currentUser?.is_platform_admin === true && !isImpersonating;
  const [activeTab, setActiveTab] = useState<OrgTab>('design');

  return (
    <div>
      {/* Page header */}
      <div className="pb-5">
        <h1 className="text-xl font-bold text-primary">Communications</h1>
        <p className="text-sm text-secondary mt-0.5">
          {isPlatformAdmin
            ? 'Manage system templates for every event and channel'
            : 'Configure brand identity and notification preferences'}
        </p>
      </div>

      {isPlatformAdmin ? (
        <EventTemplateMatrix />
      ) : (
        <>
          {/* Tabs */}
          <div className="flex items-center gap-1 mb-5 border-b border-subtle">
            <TabButton active={activeTab === 'design'} onClick={() => setActiveTab('design')}>
              Design
            </TabButton>
            <TabButton active={activeTab === 'history'} onClick={() => setActiveTab('history')}>
              History
            </TabButton>
          </div>

          {activeTab === 'design' && <EmailDesigner />}
          {activeTab === 'history' && <DeliveryLogTable />}
        </>
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm font-medium transition-colors relative ${
        active
          ? 'text-primary'
          : 'text-secondary hover:text-primary'
      }`}
    >
      {children}
      {active && (
        <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent rounded-full" />
      )}
    </button>
  );
}
