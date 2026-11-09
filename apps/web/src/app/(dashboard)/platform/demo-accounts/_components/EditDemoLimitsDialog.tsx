'use client';

import { useEffect, useState } from 'react';
import type { DemoOrganization, PlanLimits } from '@crm/shared';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  useResetOrganizationDemoLimits,
  useSetOrganizationDemoLimits,
  useSetOrganizationDemoPeriod,
} from '@/hooks/usePlatformBilling';
import { toast } from '@/hooks/useToast';
import { LimitField } from './LimitField';
import { DemoPeriodField } from './DemoPeriodField';
import {
  LIMIT_METRICS,
  draftsFromOverrides,
  limitsFromDrafts,
  type DraftErrors,
  type LimitDrafts,
} from './limit-metrics';

interface EditDemoLimitsDialogProps {
  organization: DemoOrganization | null;
  defaults: PlanLimits | undefined;
  onClose: () => void;
}

export function EditDemoLimitsDialog({ organization, defaults, onClose }: EditDemoLimitsDialogProps) {
  const save = useSetOrganizationDemoLimits();
  const savePeriod = useSetOrganizationDemoPeriod();
  const reset = useResetOrganizationDemoLimits();
  const [drafts, setDrafts] = useState<LimitDrafts | null>(null);
  const [endsAt, setEndsAt] = useState<string | null>(null);
  const [errors, setErrors] = useState<DraftErrors>({});

  useEffect(() => {
    setDrafts(organization && defaults ? draftsFromOverrides(organization.limit_overrides, defaults) : null);
    setEndsAt(organization?.demo_ends_at ?? null);
    setErrors({});
  }, [organization, defaults]);

  const busy = save.isPending || savePeriod.isPending || reset.isPending;
  const hasOverrides = !!organization && Object.keys(organization.limit_overrides).length > 0;

  const handleSave = async () => {
    if (!organization || !drafts) return;
    const { limits, errors: found } = limitsFromDrafts(drafts);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    try {
      if (endsAt !== organization.demo_ends_at) {
        await savePeriod.mutateAsync({ organizationId: organization.organization_id, endsAt });
      }
      await save.mutateAsync({ organizationId: organization.organization_id, limits });
      toast({ title: `Demo settings updated for ${organization.name}` });
      onClose();
    } catch (err) {
      toast({ title: 'Could not update the demo settings', description: (err as Error).message, variant: 'error' });
    }
  };

  const handleReset = async () => {
    if (!organization) return;
    try {
      await reset.mutateAsync(organization.organization_id);
      toast({ title: `${organization.name} now uses the default limits` });
      onClose();
    } catch (err) {
      toast({ title: 'Could not reset the limits', description: (err as Error).message, variant: 'error' });
    }
  };

  return (
    <Dialog open={!!organization} onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Demo settings for {organization?.name}</DialogTitle>
          <DialogDescription className="text-xs">
            Extend or end the demo, or make it free forever. Custom limits only apply while the organization is a demo
            account; choose &quot;Default&quot; to follow the demo defaults.
          </DialogDescription>
        </DialogHeader>

        {drafts && organization && defaults && (
          <div className="mt-5 space-y-4">
            <DemoPeriodField endsAt={endsAt} onChange={setEndsAt} />
            <div className="border-t border-subtle" />
            {LIMIT_METRICS.map(({ metric, label, monthly }) => (
              <LimitField
                key={metric}
                metric={metric}
                label={label}
                monthly={monthly}
                draft={drafts[metric]}
                defaultValue={defaults[metric]}
                usage={organization.usage[metric]}
                error={errors[metric]}
                onChange={(draft) => setDrafts((d) => (d ? { ...d, [metric]: draft } : d))}
              />
            ))}
          </div>
        )}

        <div className="mt-6 flex flex-col-reverse gap-2 border-t border-subtle pt-4 sm:flex-row sm:justify-between">
          <Button size="sm" variant="ghost" onClick={handleReset} disabled={busy || !hasOverrides}>
            {reset.isPending ? 'Resetting…' : 'Reset limits to defaults'}
          </Button>
          <div className="flex gap-2 sm:justify-end">
            <Button size="sm" variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
            <Button size="sm" onClick={handleSave} disabled={busy}>
              {save.isPending || savePeriod.isPending ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
