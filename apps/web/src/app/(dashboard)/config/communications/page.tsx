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
  const isPlatformAdmin = (currentUser as any)?.is_platform_admin === true && !isImpersonating;
  const [activeTab, setActiveTab] = useState<OrgTab>('design');

  return (
    <div>
      {/* Page header */}
      <div className="pb-5">
        <h1 className="text-xl font-bold text-gray-900">Comunicaciones</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          {isPlatformAdmin
            ? 'Gestiona las plantillas de sistema para todos los eventos y canales'
            : 'Configura la identidad de marca y preferencias de notificación'}
        </p>
      </div>

      {isPlatformAdmin ? (
        <EventTemplateMatrix />
      ) : (
        <>
          {/* Tabs */}
          <div className="flex items-center gap-1 mb-5 border-b border-border">
            <TabButton active={activeTab === 'design'} onClick={() => setActiveTab('design')}>
              Diseño
            </TabButton>
            <TabButton active={activeTab === 'history'} onClick={() => setActiveTab('history')}>
              Historial
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
          ? 'text-gray-900'
          : 'text-gray-500 hover:text-gray-700'
      }`}
    >
      {children}
      {active && (
        <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 rounded-full" />
      )}
    </button>
  );
}
