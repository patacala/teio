'use client';

import { TrendingUp } from 'lucide-react';
import type { PlanLimits, UsageSummary } from '@crm/shared';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

function UsageBar({ used, limit, label }: { used: number; limit: number; label: string }) {
  const isUnlimited = limit === -1;
  const pct = isUnlimited || limit <= 0 ? (used > 0 ? 100 : 0) : Math.min(100, Math.round((used / limit) * 100));
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-xs">
        <span className="font-medium text-secondary">{label}</span>
        <span className="text-muted">
          {used.toLocaleString('en-US')} / {isUnlimited ? '∞' : limit.toLocaleString('en-US')}
        </span>
      </div>
      {!isUnlimited && (
        <div className="h-1.5 overflow-hidden rounded-full bg-surface-raised">
          <div
            className={`h-full rounded-full transition-all ${pct >= 90 ? 'bg-danger' : pct >= 70 ? 'bg-warning' : 'bg-accent'}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
    </div>
  );
}

export function UsageCard({ usage, limits, customLimits }: { usage: UsageSummary; limits: PlanLimits; customLimits: boolean }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-2">
        <TrendingUp className="h-4 w-4 text-accent" />
        <CardTitle>Usage this month</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <UsageBar used={usage.conversations} limit={limits.conversations} label="Conversations" />
        <UsageBar used={usage.messages} limit={limits.messages} label="Messages" />
        <UsageBar used={usage.ai_calls} limit={limits.ai_calls} label="AI calls" />
        <UsageBar used={usage.voice_minutes} limit={limits.voice_minutes} label="Voice minutes" />
        <UsageBar used={usage.agents} limit={limits.agents} label="Team members" />
        {customLimits && (
          <p className="text-[11px] text-muted">Your demo account has custom limits set by our team.</p>
        )}
      </CardContent>
    </Card>
  );
}
