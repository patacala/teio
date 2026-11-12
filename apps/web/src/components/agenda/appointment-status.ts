import type { AgendaItem } from '@/services/scheduling.service';

export const STATUS_LABELS: Record<string, string> = {
  held: 'Awaiting payment',
  pending: 'Pending',
  scheduled: 'Awaiting confirmation',
  confirmed: 'Confirmed',
  completed: 'Completed',
  cancelled: 'Cancelled',
  no_show: 'No-show',
  processing: 'Running',
  awaiting_user: 'Your turn',
  failed: 'Failed',
};

type Item = Pick<AgendaItem, 'kind' | 'status' | 'starts_at' | 'ends_at'>;

const OPEN = ['scheduled', 'confirmed'];
const STEP_OPEN = ['pending', 'processing', 'awaiting_user'];

export const isFollowUpStep = (item: Pick<AgendaItem, 'kind'>) => item.kind === 'step';

/** Ended, but nobody recorded whether it happened. */
export function needsOutcome(item: Item, now = Date.now()): boolean {
  return !isFollowUpStep(item) && OPEN.includes(item.status) && new Date(item.ends_at).getTime() < now;
}

export interface ItemActions {
  confirm: boolean;
  resend: boolean;
  complete: boolean;
  noShow: boolean;
  cancel: boolean;
  remove: boolean;
}

/** Which actions make sense right now (mirrors the API rules). */
export function itemActions(item: Item, now = Date.now()): ItemActions {
  if (isFollowUpStep(item)) {
    const open = STEP_OPEN.includes(item.status);
    return { confirm: false, resend: false, complete: open, noShow: false, cancel: open, remove: true };
  }
  const started = new Date(item.starts_at).getTime() <= now;
  const upcoming = new Date(item.ends_at).getTime() > now;
  const open = OPEN.includes(item.status);
  const active = open || item.status === 'held';
  return {
    confirm: item.status === 'scheduled',
    resend: item.status === 'scheduled' && !started,
    complete: open && started,
    noShow: open && started,
    cancel: active,
    remove: !(active && upcoming),
  };
}
