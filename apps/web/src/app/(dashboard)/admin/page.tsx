'use client';

import Link from 'next/link';
import { Users, CreditCard, Key, BarChart, MonitorPlay, ArrowRight } from 'lucide-react';
import { useTeamMembers } from '@/hooks/useTeam';
import { useBillingSubscription } from '@/hooks/useBilling';

const sections = [
  {
    href: '/admin/team',
    icon: Users,
    label: 'Team',
    description: 'Gestiona los miembros del equipo y sus roles.',
  },
  {
    href: '/admin/billing',
    icon: CreditCard,
    label: 'Billing',
    description: 'Plan, suscripción y uso de la plataforma.',
  },
  {
    href: '/admin/api-keys',
    icon: Key,
    label: 'API Keys',
    description: 'Crea y revoca llaves de acceso a la API.',
  },
  {
    href: '/admin/demo',
    icon: MonitorPlay,
    label: 'Demos',
    description: 'Gestiona solicitudes de demo y magic links.',
  },
];

export default function AdminPanelPage() {
  const { data: members, isLoading: loadingTeam } = useTeamMembers();
  const { data: billing, isLoading: loadingBilling } = useBillingSubscription();

  const activeMembers = members?.filter((m) => m.is_active).length ?? 0;
  const plan = billing?.subscription?.plan?.name ?? '—';
  const planStatus = billing?.subscription?.status ?? '—';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-gray-900">Panel de administración</h1>
        <p className="text-xs text-gray-500 mt-0.5">Gestión global de la organización.</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="bg-panel border border-border rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <BarChart className="h-4 w-4 text-blue-500" />
            <span className="text-xs font-medium text-gray-500">Plan activo</span>
          </div>
          {loadingBilling ? (
            <div className="h-7 w-24 bg-gray-100 rounded animate-pulse" />
          ) : (
            <p className="text-xl font-bold text-gray-900 capitalize">{plan}</p>
          )}
          <p className="text-[10px] text-gray-400 mt-0.5 capitalize">{planStatus}</p>
        </div>

        <div className="bg-panel border border-border rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Users className="h-4 w-4 text-blue-500" />
            <span className="text-xs font-medium text-gray-500">Miembros activos</span>
          </div>
          {loadingTeam ? (
            <div className="h-7 w-12 bg-gray-100 rounded animate-pulse" />
          ) : (
            <p className="text-xl font-bold text-gray-900">{activeMembers}</p>
          )}
          <p className="text-[10px] text-gray-400 mt-0.5">{members?.length ?? 0} en total</p>
        </div>

        <div className="bg-panel border border-border rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <CreditCard className="h-4 w-4 text-blue-500" />
            <span className="text-xs font-medium text-gray-500">Mensajes este mes</span>
          </div>
          {loadingBilling ? (
            <div className="h-7 w-16 bg-gray-100 rounded animate-pulse" />
          ) : (
            <p className="text-xl font-bold text-gray-900">{billing?.usage?.messages ?? 0}</p>
          )}
          <p className="text-[10px] text-gray-400 mt-0.5">
            límite: {billing?.limits?.messages === -1 ? '∞' : (billing?.limits?.messages ?? '—')}
          </p>
        </div>
      </div>

      {/* Nav cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {sections.map(({ href, icon: Icon, label, description }) => (
          <Link
            key={href}
            href={href}
            className="group bg-panel border border-border rounded-xl p-5 flex flex-col gap-3 hover:border-blue-200 hover:shadow-sm transition-all"
          >
            <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center">
              <Icon className="h-4.5 w-4.5 text-blue-600" />
            </div>
            <div>
              <p className="font-medium text-gray-900 text-sm">{label}</p>
              <p className="text-xs text-gray-500 mt-0.5">{description}</p>
            </div>
            <ArrowRight className="h-4 w-4 text-gray-300 group-hover:text-blue-500 transition-colors mt-auto self-end" />
          </Link>
        ))}
      </div>
    </div>
  );
}
