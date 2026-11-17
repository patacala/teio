'use client';

import Link from 'next/link';
import { CheckCircle2, Flame, Mail } from 'lucide-react';
import type { PlatformAttentionItem } from '@crm/shared';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { AttentionRow } from '@/components/dashboard/attention-row';
import { formatMoney } from '@/components/dashboard/format';
import { SectionHeader } from '@/components/dashboard/section-header';
import { usePlatformAttention } from '@/hooks/usePlatformAnalytics';
import { attentionIsDemo, attentionOpensBilling, demoAccountsHref } from './platform-labels';
import { useOpenOrganization } from './use-open-organization';

function EmailButton({ email, name }: { email: string; name: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <a
          href={`mailto:${email}`}
          aria-label={`Email ${name}`}
          className={buttonVariants({ variant: 'ghost', size: 'icon', className: 'h-8 w-8' })}
        >
          <Mail className="h-4 w-4" />
        </a>
      </TooltipTrigger>
      <TooltipContent>{email}</TooltipContent>
    </Tooltip>
  );
}

function ItemActions({ item }: { item: PlatformAttentionItem }) {
  const openOrganization = useOpenOrganization();
  const { target } = item;
  const billing = attentionOpensBilling(item.kind);

  if (target.type === 'lead') {
    return target.email ? (
      <a
        href={`mailto:${target.email}`}
        aria-label={`Email ${target.name}`}
        className={buttonVariants({ variant: 'secondary', size: 'sm' })}
      >
        <Mail className="h-3.5 w-3.5" /> Email
      </a>
    ) : null;
  }

  return (
    <>
      {target.email && <EmailButton email={target.email} name={target.name} />}
      {attentionIsDemo(item.kind) ? (
        <Link
          href={demoAccountsHref(target.slug)}
          aria-label={`Manage the demo of ${target.name}`}
          className={buttonVariants({ variant: 'secondary', size: 'sm' })}
        >
          Manage demo
        </Link>
      ) : (
        <Button
          size="sm"
          variant="secondary"
          onClick={() => openOrganization(target, billing ? '/admin/billing' : '/')}
          aria-label={billing ? `Open billing for ${target.name}` : `Open ${target.name}`}
        >
          {billing ? 'Open billing' : 'Open'}
        </Button>
      )}
    </>
  );
}

/** What needs a super admin now: failed payments and lost leads first, then the warnings, most money first. */
export function AttentionPanel() {
  const { data, isLoading, isError, refetch } = usePlatformAttention();
  const critical = data?.counts.critical ?? 0;
  const warning = data?.counts.warning ?? 0;
  const shown = data?.items.length ?? 0;
  const total = critical + warning;

  return (
    <Card className="flex h-full flex-col overflow-hidden">
      <SectionHeader
        icon={<Flame className="h-4 w-4" />}
        title="Needs attention"
        subtitle="Payments, demos and leads to act on now"
        badge={!isLoading && total > 0 && (
          <span className="flex items-center gap-1">
            {critical > 0 && (
              <span className="rounded-full border border-danger/20 bg-danger/10 px-2 py-0.5 text-[11px] font-semibold leading-4 text-danger">
                {critical} critical
              </span>
            )}
            {warning > 0 && (
              <span className="rounded-full border border-warning/20 bg-warning/10 px-2 py-0.5 text-[11px] font-semibold leading-4 text-warning">
                {warning} warning
              </span>
            )}
          </span>
        )}
      />
      <CardContent className="min-h-0 flex-1 pt-0">
        {isLoading ? (
          <div className="space-y-2" aria-busy="true" aria-label="Loading what needs attention">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-row" />)}
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <p className="text-sm text-secondary">Could not load what needs attention.</p>
            <Button size="sm" variant="secondary" onClick={() => refetch()}>Try again</Button>
          </div>
        ) : !shown ? (
          <div className="py-8 text-center">
            <CheckCircle2 className="mx-auto mb-2 h-8 w-8 text-success/60" />
            <p className="text-sm text-muted">Nothing needs attention right now</p>
          </div>
        ) : (
          <>
            <ul className="thin-scrollbar flex flex-col gap-2 lg:-mr-2 lg:max-h-[560px] lg:overflow-y-auto lg:pr-2" aria-label="Items that need attention">
              {data!.items.map((item) => (
                <li key={item.id}>
                  <AttentionRow
                    urgency={item.urgency}
                    title={item.target.name}
                    chip={item.amount ? `${formatMoney(item.amount)}/mo` : null}
                    subtitle={item.detail}
                    badges={[item.reason]}
                    action={<ItemActions item={item} />}
                  />
                </li>
              ))}
            </ul>
            {total > shown && (
              <p className="pt-2 text-center text-[11px] text-muted">Showing the {shown} most urgent of {total}</p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
