import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

interface LeadScoreIndicatorProps {
  score?: number;
}

export function LeadScoreIndicator({ score }: LeadScoreIndicatorProps) {
  if (score === undefined) return null;

  const label = score >= 70 ? 'Hot lead' : score >= 40 ? 'Warm lead' : 'Cold lead';
  const scoreColor =
    score >= 70 ? 'text-success' : score >= 40 ? 'text-warning' : 'text-secondary';

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs text-secondary">Score</span>
        <span className={cn('text-sm font-bold', scoreColor)}>{score}</span>
      </div>
      <Progress value={score} className="h-1.5" />
      <p className="text-[10px] text-muted mt-1">{label}</p>
    </div>
  );
}
