'use client';

import { Phone, Play } from 'lucide-react';
import { useContactCalls } from '@/hooks/useContacts';
import { useState } from 'react';

interface Props {
  contactId: string;
}

function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function timeAgo(date: string) {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function VoiceCallsSummaryCard({ contactId }: Props) {
  const { data, isLoading } = useContactCalls(contactId);
  const [playing, setPlaying] = useState(false);

  const latest = data?.calls[0];

  return (
    <div className="bg-surface border border-subtle rounded-xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <Phone className="h-4 w-4 text-muted" />
        <h3 className="text-sm font-semibold text-primary">Voice Calls</h3>
      </div>

      {isLoading ? (
        <div className="h-10 bg-surface-raised animate-pulse rounded-sm" />
      ) : (
        <>
          <p className="text-2xl font-bold text-primary">{data?.total ?? 0}</p>
          <p className="text-xs text-secondary mt-0.5">total calls</p>
          {latest && (
            <div className="mt-3 text-xs text-secondary space-y-0.5">
              {latest.duration_seconds !== undefined && (
                <div>
                  Last duration:{' '}
                  <span className="font-medium text-primary">
                    {formatDuration(latest.duration_seconds)}
                  </span>
                </div>
              )}
              <div>
                Last call:{' '}
                <span className="font-medium text-primary">
                  {timeAgo(latest.started_at ?? latest.created_at)}
                </span>
              </div>
            </div>
          )}
          {latest?.recording_url && (
            <div className="mt-3">
              {playing ? (
                <audio
                  controls
                  autoPlay
                  className="w-full h-8"
                  onEnded={() => setPlaying(false)}
                >
                  <source src={latest.recording_url} />
                </audio>
              ) : (
                <button
                  onClick={() => setPlaying(true)}
                  className="flex items-center gap-1.5 text-xs text-accent hover:text-accent-hover"
                >
                  <Play className="h-3 w-3" />
                  Play latest recording
                </button>
              )}
            </div>
          )}
          {data?.total === 0 && (
            <p className="mt-3 text-xs text-muted">No calls yet</p>
          )}
        </>
      )}
    </div>
  );
}
