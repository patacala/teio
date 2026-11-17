import Link from 'next/link';
import { CalendarClock, Flame } from 'lucide-react';
import { cn } from '@/lib/utils';

export type AttentionUrgency = 'critical' | 'warning';

export const ATTENTION_STYLE: Record<AttentionUrgency, { icon: React.ReactNode; ring: string; bg: string }> = {
  critical: { icon: <Flame className="h-4 w-4" />, ring: 'text-danger', bg: 'bg-danger/12' },
  warning: { icon: <CalendarClock className="h-4 w-4" />, ring: 'text-warning', bg: 'bg-warning/12' },
};

const ROW_CLASS = 'flex items-center gap-3 rounded-row border border-white/6 bg-surface-raised p-2.5';

interface AttentionRowProps {
  urgency: AttentionUrgency;
  title: string;
  /** Small neutral pill next to the title. */
  chip?: string | null;
  subtitle?: string;
  badges: string[];
  /** Icon in the urgency circle; defaults to the urgency's icon. */
  icon?: React.ReactNode;
  /** The whole row opens this page… */
  href?: string;
  /** …or the row carries its own buttons (a row with actions is not a link). */
  action?: React.ReactNode;
}

/** One item of a "needs attention" list: urgency, who, why, and what to do about it. */
export function AttentionRow({ urgency, title, chip, subtitle, badges, icon, href, action }: AttentionRowProps) {
  const style = ATTENTION_STYLE[urgency];
  const circle = (
    <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-full', style.bg, style.ring)}>
      {icon ?? style.icon}
    </div>
  );
  const text = (
    <div className="min-w-0 flex-1">
      <div className="flex items-center gap-2 min-w-0">
        <p className="text-sm font-medium text-primary truncate">{title}</p>
        {chip && (
          <span className="shrink-0 rounded-full border border-subtle bg-white/5 px-2 py-0.5 text-[11px] font-medium leading-4 text-secondary">
            {chip}
          </span>
        )}
      </div>
      {subtitle !== undefined && <p className="text-xs text-muted truncate">{subtitle}</p>}
    </div>
  );
  const badgeClass = cn(
    'rounded-full border px-2 py-0.5 text-[11px] font-medium leading-4',
    urgency === 'critical'
      ? 'border-danger/20 bg-danger/10 text-danger'
      : 'border-warning/20 bg-warning/10 text-warning',
  );

  if (action) {
    // On narrow screens the badges and buttons move under the title instead of squeezing it.
    return (
      <div className={cn(ROW_CLASS, 'flex-wrap gap-y-2')}>
        {circle}
        {text}
        <div className="flex w-full flex-wrap items-center justify-between gap-2 pl-12 sm:w-auto sm:flex-nowrap sm:justify-end sm:pl-0">
          <div className="flex flex-wrap gap-1 sm:flex-col sm:items-end">
            {badges.map((badge, i) => (
              <span key={i} className={cn(badgeClass, 'whitespace-nowrap')}>{badge}</span>
            ))}
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-1 sm:ml-0">{action}</div>
        </div>
      </div>
    );
  }

  const content = (
    <>
      {circle}
      {text}
      <div className="flex flex-col items-end gap-1 shrink-0">
        {badges.map((badge, i) => (
          <span key={i} className={badgeClass}>
            {badge}
          </span>
        ))}
      </div>
    </>
  );

  if (href) {
    return (
      <Link href={href} className={cn(ROW_CLASS, 'transition-colors hover:border-strong hover:bg-surface-hover')}>
        {content}
      </Link>
    );
  }
  return <div className={ROW_CLASS}>{content}</div>;
}
