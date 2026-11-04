'use client';

import { CreditCard, CheckCircle, ExternalLink, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useBillingSubscription, useCreatePortalSession } from '@/hooks/useBilling';
import { toast } from '@/hooks/useToast';

function UsageBar({ used, limit, label }: { used: number; limit: number; label: string }) {
  const pct = limit === -1 ? 0 : Math.min(100, Math.round((used / limit) * 100));
  const isUnlimited = limit === -1;
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-xs">
        <span className="text-secondary font-medium">{label}</span>
        <span className="text-muted">
          {used.toLocaleString()} / {isUnlimited ? '∞' : limit.toLocaleString()}
        </span>
      </div>
      {!isUnlimited && (
        <div className="h-1.5 bg-surface-raised rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${pct >= 90 ? 'bg-danger' : pct >= 70 ? 'bg-warning' : 'bg-accent'}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
    </div>
  );
}

export default function AdminBillingPage() {
  const { data: billing, isLoading } = useBillingSubscription();
  const createPortal = useCreatePortalSession();

  const handleManage = async () => {
    try {
      const { url } = await createPortal.mutateAsync(window.location.href);
      window.location.href = url;
    } catch {
      toast({ title: 'Error opening the billing portal', variant: 'error' });
    }
  };

  const sub = billing?.subscription;
  const usage = billing?.usage;
  const limits = billing?.limits;

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-primary">Billing</h1>
          <p className="text-xs text-secondary mt-0.5">Plan and platform usage.</p>
        </div>
        <Button
          size="sm"
          onClick={handleManage}
          disabled={createPortal.isPending}
          className="gap-1.5 bg-accent hover:bg-accent-hover text-on-accent"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          {createPortal.isPending ? 'Opening…' : 'Billing portal'}
        </Button>
      </div>

      {/* Subscription card */}
      <div className="bg-surface border border-subtle rounded-xl p-5 space-y-4">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-olive-dark flex items-center justify-center">
              <CreditCard className="h-5 w-5 text-accent" />
            </div>
            <div>
              {isLoading ? (
                <div className="space-y-1">
                  <div className="h-5 w-24 bg-surface-raised rounded-sm animate-pulse" />
                  <div className="h-3 w-16 bg-surface-raised rounded-sm animate-pulse" />
                </div>
              ) : (
                <>
                  <p className="font-semibold text-primary capitalize">{sub?.plan?.name ?? '—'}</p>
                  <p className="text-xs text-muted capitalize">{sub?.billing_period ?? '—'} · {sub?.status ?? '—'}</p>
                </>
              )}
            </div>
          </div>
          {sub?.status === 'active' && (
            <span className="flex items-center gap-1 text-xs text-accent bg-olive-dark px-2 py-0.5 rounded-full">
              <CheckCircle className="h-3 w-3" /> Active
            </span>
          )}
        </div>

        {sub?.plan?.features && sub.plan.features.length > 0 && (
          <div className="grid grid-cols-2 gap-1.5 pt-1">
            {sub.plan.features.map((f) => (
              <div key={f} className="flex items-center gap-1.5 text-xs text-secondary">
                <CheckCircle className="h-3 w-3 text-accent/75 shrink-0" />
                {f}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Usage card */}
      {(usage || isLoading) && (
        <div className="bg-surface border border-subtle rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-accent" />
            <h2 className="text-sm font-semibold text-primary">Usage this month</h2>
          </div>
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-8 bg-surface-raised rounded-sm animate-pulse" />)}
            </div>
          ) : (
            <div className="space-y-4">
              <UsageBar used={usage?.conversations ?? 0} limit={limits?.conversations ?? -1} label="Conversations" />
              <UsageBar used={usage?.messages ?? 0} limit={limits?.messages ?? -1} label="Messages" />
              <UsageBar used={usage?.ai_calls ?? 0} limit={limits?.ai_calls ?? -1} label="AI calls" />
              <UsageBar used={usage?.voice_minutes ?? 0} limit={limits?.voice_minutes ?? -1} label="Voice minutes" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
