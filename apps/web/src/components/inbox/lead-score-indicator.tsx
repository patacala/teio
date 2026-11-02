import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

interface LeadScoreIndicatorProps {
  score?: number;
}

export function LeadScoreIndicator({ score }: LeadScoreIndicatorProps) {
  if (score === undefined) return null;

  const label = score >= 70 ? 'Hot lead' : score >= 40 ? 'Warm lead' : 'Cold lead';
  const scoreColor =
    score >= 70 ? 'text-emerald-600' : score >= 40 ? 'text-amber-600' : 'text-gray-500';

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs text-gray-500">Score</span>
        <span className={cn('text-sm font-bold', scoreColor)}>{score}</span>
      </div>
      <Progress value={score} className="h-1.5" />
      <p className="text-[10px] text-gray-400 mt-1">{label}</p>
    </div>
  );
}
