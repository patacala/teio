'use client';

import { CalendarClock, CircleDollarSign, Gauge, Landmark, Rocket, ShieldAlert, UserPlus, Wallet } from 'lucide-react';
import type { PlatformOverview } from '@crm/shared';
import { formatMoney } from '@/components/dashboard/format';
import { KpiStat, KpiStrip } from '@/components/dashboard/kpi-strip';
import { percentChange, TrendIndicator } from '@/components/dashboard/trend-indicator';
import { pluralize } from './platform-labels';

const dot = ' · ';

/** Two rows of headline numbers: money (what we earn, what we may lose) and growth (what comes next). */
export function PlatformKpiStrip({ overview, loading }: { overview: PlatformOverview | undefined; loading: boolean }) {
  const money = overview?.money;
  const growth = overview?.growth;
  const signups = overview?.signups;
  const activation = signups && signups.signups > 0 ? Math.round((signups.activated / signups.signups) * 100) : null;

  return (
    <KpiStrip label="Key figures">
      <KpiStat
        label="MRR"
        icon={<CircleDollarSign />}
        loading={loading}
        value={formatMoney(money?.mrr)}
        delta={money && money.mrr_last_month !== null && (
          <TrendIndicator trend={percentChange(money.mrr, money.mrr_last_month)} comparison="vs last month" />
        )}
        footer={money && <p>ARR {formatMoney(money.arr)}{dot}{pluralize(money.paying_organizations, 'paying org')}</p>}
      />
      <KpiStat
        label="Cash collected"
        icon={<Wallet />}
        loading={loading}
        value={formatMoney(money?.cash_collected)}
        delta={money && <TrendIndicator trend={percentChange(money.cash_collected, money.cash_collected_previous)} />}
        footer={money && (
          <p>
            {formatMoney(money.outstanding)} outstanding{dot}{pluralize(money.outstanding_invoices, 'open invoice')}
          </p>
        )}
      />
      <KpiStat
        label="Revenue at risk"
        icon={<ShieldAlert />}
        loading={loading}
        tone={money && money.at_risk.amount > 0 ? 'danger' : 'default'}
        value={money && `${formatMoney(money.at_risk.amount)}/mo`}
        footer={money && (
          <>
            <p>
              {pluralize(money.at_risk.organizations, 'org')}{dot}{money.at_risk.past_due} past due{dot}
              {money.at_risk.payment_failed} blocked
            </p>
            <p>
              {money.at_risk.cancel_scheduled} cancelling{dot}{pluralize(money.at_risk.payment_method_issue, 'card issue')}
            </p>
          </>
        )}
      />
      <KpiStat
        label="Paying organizations"
        icon={<Landmark />}
        loading={loading}
        value={money?.paying_organizations.toLocaleString('en-US')}
        footer={money && (
          <>
            <p>{formatMoney(money.average_revenue_per_organization)} average per org</p>
            <p>
              <span className={money.new_paying > 0 ? 'text-success' : undefined}>+{money.new_paying} new</span>
              {dot}
              <span className={money.churned > 0 ? 'text-danger' : undefined}>{money.churned} churned</span>
            </p>
          </>
        )}
      />

      <KpiStat
        label="New leads"
        icon={<UserPlus />}
        loading={loading}
        value={growth?.leads.total.toLocaleString('en-US')}
        delta={growth && <TrendIndicator trend={percentChange(growth.leads.total, growth.leads.previous)} />}
        footer={growth && (
          <p>{pluralize(growth.leads.demo_requests, 'demo request')}{dot}{pluralize(growth.leads.signups, 'signup')}</p>
        )}
      />
      <KpiStat
        label="Demo → paid"
        icon={<Rocket />}
        loading={loading}
        value={growth ? (growth.conversion.rate === null ? '—' : `${growth.conversion.rate}%`) : undefined}
        footer={growth && (
          <p>{growth.conversion.converted} converted{dot}{growth.conversion.expired_unpaid} ended unpaid</p>
        )}
      />
      <KpiStat
        label="Active demos"
        icon={<CalendarClock />}
        loading={loading}
        value={growth?.demos.active.toLocaleString('en-US')}
        footer={growth && (
          <p>
            <span className={growth.demos.ending_7d > 0 ? 'text-warning' : undefined}>
              {growth.demos.ending_7d} ending in 7 days
            </span>
            {dot}{growth.demos.no_end_date} with no end date
          </p>
        )}
      />
      <KpiStat
        label="Signup activation"
        icon={<Gauge />}
        loading={loading}
        value={signups ? (activation === null ? '—' : `${activation}%`) : undefined}
        footer={signups && (
          <p>{signups.activated} of {pluralize(signups.signups, 'signup')} set up{dot}{signups.paid} paid</p>
        )}
      />
    </KpiStrip>
  );
}
