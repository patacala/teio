'use client';

import type { SequenceStepInput } from '@/services/automation.service';
import { actionMeta, strategyLabel, formatDelay } from './sequence-constants';

interface Props {
  steps: SequenceStepInput[];
}

/**
 * Vertical timeline of the cadence, with the cumulative delay so the overall
 * shape ("7 touches over 7 days") is readable at a glance.
 */
export function SequenceTimelinePreview({ steps }: Props) {
  let cumulativeHours = 0;

  return (
    <ol className="space-y-0">
      {steps.map((step, i) => {
        cumulativeHours += step.delay_hours;
        const { icon: Icon, label } = actionMeta(step.action);
        const isLast = i === steps.length - 1;

        return (
          <li key={i} className="flex gap-3">
            {/* Rail */}
            <div className="flex flex-col items-center">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-50">
                <Icon className="h-3.5 w-3.5 text-blue-600" />
              </div>
              {!isLast && <div className="w-px flex-1 bg-border" />}
            </div>

            <div className={isLast ? 'pb-0' : 'pb-4'}>
              <p className="text-sm font-medium text-gray-900">
                {label}
                <span className="ml-1.5 text-xs font-normal text-gray-500">
                  · {strategyLabel(step.channel_strategy)}
                </span>
              </p>
              <p className="mt-0.5 text-xs text-gray-400">
                +{formatDelay(step.delay_hours)} · acumulado {formatDelay(cumulativeHours)}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
