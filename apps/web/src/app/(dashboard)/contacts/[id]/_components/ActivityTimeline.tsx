'use client';

import { MessageSquare, Phone, Calendar, GitBranch, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useContactActivity } from '@/hooks/useContactActivity';
import type { ActivityEvent } from '@/services/activity.service';

interface Props {
  contactId: string;
}

function getDateLabel(timestamp: string) {
  const diff = Date.now() - new Date(timestamp).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return `${days} days ago`;
}

function formatDateTime(timestamp: string) {
  const d = new Date(timestamp);
  return (
    d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
    ' · ' +
    d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
  );
}

function EventIcon({ type }: { type: ActivityEvent['type'] }) {
  const cls = 'h-4 w-4';
  if (type === 'message') return <MessageSquare className={cls} />;
  if (type === 'voice_call') return <Phone className={cls} />;
  if (type === 'appointment_event') return <Calendar className={cls} />;
  if (type === 'funnel_change') return <GitBranch className={cls} />;
  return <MessageSquare className={cls} />;
}

function ActorChip({ actor }: { actor?: string }) {
  if (!actor) return null;
  return (
    <span className="ml-1.5 inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-600">
      {actor}
    </span>
  );
}

function EventLabel({ event }: { event: ActivityEvent }) {
  if (event.type === 'message') {
    return (
      <span>
        <span className="font-medium capitalize">{event.sender}</span>{' '}
        {event.direction === 'inbound' ? 'sent' : 'received'} a message via{' '}
        <span className="font-medium">{event.channel}</span>
        {event.content ? (
          <span className="ml-1 text-gray-400">
            — &ldquo;{String(event.content).slice(0, 60)}
            {String(event.content).length > 60 ? '…' : ''}&rdquo;
          </span>
        ) : null}
      </span>
    );
  }

  if (event.type === 'voice_call') {
    return (
      <span>
        Voice call ·{' '}
        <span className="font-medium capitalize">{event.call_status}</span>
        {event.duration
          ? ` · ${Math.floor(Number(event.duration) / 60)}:${String(Number(event.duration) % 60).padStart(2, '0')}`
          : ''}
      </span>
    );
  }

  if (event.type === 'appointment_event') {
    return (
      <span className="flex items-center flex-wrap gap-y-0.5">
        <span>{event.action}</span>
        <ActorChip actor={event.actor} />
      </span>
    );
  }

  if (event.type === 'funnel_change') {
    return (
      <span className="flex items-center flex-wrap gap-y-0.5">
        Stage changed:{' '}
        <span className="font-medium ml-1">{event.from_stage}</span>
        <span className="mx-1">→</span>
        <span className="font-medium">{event.to_stage}</span>
        <ActorChip actor={event.actor} />
      </span>
    );
  }

  return <span>System event</span>;
}

export function ActivityTimeline({ contactId }: Props) {
  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useContactActivity(contactId);

  // Sort all events newest-first after merging pages.
  const allEvents = (data?.pages.flatMap((p) => p.events) ?? [])
    .filter((e) => !(e.type === 'message' && e.channel === 'voice' && e.sender_type === 'system'))
    .sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );

  // Group by date label (preserving newest-first order)
  const groups: { label: string; events: ActivityEvent[] }[] = [];
  for (const event of allEvents) {
    const label = getDateLabel(event.timestamp);
    const existing = groups.find((g) => g.label === label);
    if (existing) {
      existing.events.push(event);
    } else {
      groups.push({ label, events: [event] });
    }
  }

  return (
    <div className="col-span-full bg-panel border border-border rounded-xl p-6">
      <h3 className="text-sm font-semibold text-gray-900 mb-6">Activity Timeline</h3>

      {isLoading && (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
        </div>
      )}

      {!isLoading && allEvents.length === 0 && (
        <p className="text-sm text-gray-400">No activity yet</p>
      )}

      <div className="space-y-6">
        {groups.map(({ label, events }) => (
          <div key={label}>
            <div className="flex items-center gap-3 mb-3">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                {label}
              </span>
              <div className="flex-1 h-px bg-border" />
            </div>
            <ul className="space-y-3">
              {events.map((event) => (
                <li key={event.id} className="flex items-start gap-3">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-500 mt-0.5">
                    <EventIcon type={event.type} />
                  </div>
                  <div className="flex-1 min-w-0 text-sm text-gray-700">
                    <EventLabel event={event} />
                  </div>
                  <span className="text-xs text-gray-400 shrink-0 mt-0.5 whitespace-nowrap">
                    {formatDateTime(event.timestamp)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {hasNextPage && (
        <div className="mt-4 flex justify-center">
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
          >
            {isFetchingNextPage && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Load older activity
          </Button>
        </div>
      )}
    </div>
  );
}
