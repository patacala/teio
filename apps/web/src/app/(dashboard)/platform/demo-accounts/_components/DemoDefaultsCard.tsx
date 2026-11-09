'use client';

import { useEffect, useMemo, useState } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useDemoDefaults, useUpdateDemoDefaults } from '@/hooks/usePlatformBilling';
import { toast } from '@/hooks/useToast';
import { LimitField } from './LimitField';
import { DemoLengthField, demoLengthDraft, demoLengthValue, type DemoLengthDraft } from './DemoLengthField';
import {
  LIMIT_METRICS,
  draftsFromLimits,
  limitsFromDrafts,
  type DraftErrors,
  type LimitDrafts,
} from './limit-metrics';

export function DemoDefaultsCard() {
  const { data, isLoading, isError, error, refetch } = useDemoDefaults();
  const update = useUpdateDemoDefaults();
  const initial = useMemo(() => (data ? draftsFromLimits(data.limits) : null), [data]);
  const initialLength = useMemo(() => (data ? demoLengthDraft(data.demo_duration_days) : null), [data]);
  const [drafts, setDrafts] = useState<LimitDrafts | null>(null);
  const [length, setLength] = useState<DemoLengthDraft | null>(null);
  const [errors, setErrors] = useState<DraftErrors>({});
  const [lengthError, setLengthError] = useState<string>();

  const discard = () => {
    setDrafts(initial);
    setLength(initialLength);
    setErrors({});
    setLengthError(undefined);
  };

  useEffect(discard, [initial, initialLength]);

  const dirty =
    !!drafts && !!initial && (JSON.stringify(drafts) !== JSON.stringify(initial) || JSON.stringify(length) !== JSON.stringify(initialLength));

  const handleSave = async () => {
    if (!drafts || !length) return;
    const { limits, errors: found } = limitsFromDrafts(drafts);
    const duration = demoLengthValue(length);
    setErrors(found);
    setLengthError(duration.error);
    if (Object.keys(found).length > 0 || duration.error) return;
    try {
      await update.mutateAsync({ ...limits, demo_duration_days: duration.value });
      toast({ title: 'Demo defaults saved', description: 'Limits apply now to demos without custom limits; the length applies to new demos.' });
    } catch (err) {
      toast({ title: 'Could not save the demo defaults', description: (err as Error).message, variant: 'error' });
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start gap-3">
        <div className="icon-tile flex h-9 w-9 shrink-0 items-center justify-center">
          <SlidersHorizontal className="h-4 w-4 text-accent" />
        </div>
        <div>
          <CardTitle>Demo defaults</CardTitle>
          <CardDescription>
            How long new demos last, and the limits every demo organization gets unless you customize it below.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3" aria-busy="true">
            {LIMIT_METRICS.map(({ metric }) => <Skeleton key={metric} className="h-9" />)}
          </div>
        ) : isError || !drafts || !length ? (
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <p className="text-sm text-primary">Could not load the demo defaults.</p>
            <p className="text-xs text-muted">{(error as Error | null)?.message ?? 'Please try again.'}</p>
            <Button size="sm" variant="secondary" onClick={() => refetch()}>Try again</Button>
          </div>
        ) : (
          <div className="max-w-3xl space-y-4">
            <DemoLengthField draft={length} onChange={setLength} error={lengthError} />
            <div className="border-t border-subtle" />
            {LIMIT_METRICS.map(({ metric, label, monthly }) => (
              <LimitField
                key={metric}
                metric={metric}
                label={label}
                monthly={monthly}
                draft={drafts[metric]}
                error={errors[metric]}
                onChange={(draft) => setDrafts((d) => (d ? { ...d, [metric]: draft } : d))}
              />
            ))}
            <div className="flex items-center justify-between gap-3 border-t border-subtle pt-4">
              <p className="text-[11px] text-muted">
                Last changed{' '}
                {data && new Date(data.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </p>
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" disabled={!dirty || update.isPending} onClick={discard}>
                  Discard
                </Button>
                <Button size="sm" disabled={!dirty || update.isPending} onClick={handleSave}>
                  {update.isPending ? 'Saving…' : 'Save defaults'}
                </Button>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
