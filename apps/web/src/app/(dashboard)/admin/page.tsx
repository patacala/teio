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
    description: 'Manage team members and their roles.',
  },
  {
    href: '/admin/billing',
    icon: CreditCard,
    label: 'Billing',
    description: 'Plan, subscription and platform usage.',
  },
  {
    href: '/admin/api-keys',
    icon: Key,
    label: 'API Keys',
    description: 'Create and revoke API access keys.',
  },
  {
    href: '/admin/demo',
    icon: MonitorPlay,
    label: 'Demos',
    description: 'Manage demo requests and magic links.',
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
        <h1 className="text-lg font-semibold text-primary">Admin panel</h1>
        <p className="text-xs text-secondary mt-0.5">Organization-wide management.</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="bg-surface border border-subtle rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <BarChart className="h-4 w-4 text-accent" />
            <span className="text-xs font-medium text-secondary">Active plan</span>
          </div>
          {loadingBilling ? (
            <div className="h-7 w-24 bg-surface-raised rounded-sm animate-pulse" />
          ) : (
            <p className="text-xl font-bold text-primary capitalize">{plan}</p>
          )}
          <p className="text-[10px] text-muted mt-0.5 capitalize">{planStatus}</p>
        </div>

        <div className="bg-surface border border-subtle rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Users className="h-4 w-4 text-accent" />
            <span className="text-xs font-medium text-secondary">Active members</span>
          </div>
          {loadingTeam ? (
            <div className="h-7 w-12 bg-surface-raised rounded-sm animate-pulse" />
          ) : (
            <p className="text-xl font-bold text-primary">{activeMembers}</p>
          )}
          <p className="text-[10px] text-muted mt-0.5">{members?.length ?? 0} en total</p>
        </div>

        <div className="bg-surface border border-subtle rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <CreditCard className="h-4 w-4 text-accent" />
            <span className="text-xs font-medium text-secondary">Messages this month</span>
          </div>
          {loadingBilling ? (
            <div className="h-7 w-16 bg-surface-raised rounded-sm animate-pulse" />
          ) : (
            <p className="text-xl font-bold text-primary">{billing?.usage?.messages ?? 0}</p>
          )}
          <p className="text-[10px] text-muted mt-0.5">
            limit: {billing?.limits?.messages === -1 ? '∞' : (billing?.limits?.messages ?? '—')}
          </p>
        </div>
      </div>

      {/* Nav cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {sections.map(({ href, icon: Icon, label, description }) => (
          <Link
            key={href}
            href={href}
            className="group bg-surface border border-subtle rounded-xl p-5 flex flex-col gap-3 hover:border-accent/20 hover:shadow-xs transition-all"
          >
            <div className="w-9 h-9 rounded-lg bg-olive-dark flex items-center justify-center">
              <Icon className="h-4.5 w-4.5 text-accent" />
            </div>
            <div>
              <p className="font-medium text-primary text-sm">{label}</p>
              <p className="text-xs text-secondary mt-0.5">{description}</p>
            </div>
            <ArrowRight className="h-4 w-4 text-muted group-hover:text-accent transition-colors mt-auto self-end" />
          </Link>
        ))}
      </div>
    </div>
  );
}
