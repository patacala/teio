'use client';

import { Phone, PhoneIncoming, PhoneOutgoing, ChevronDown, ChevronUp } from 'lucide-react';
import { formatTime } from '@/lib/utils';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { CallRecordingPlayer } from '@/components/voice/call-recording-player';

interface VoiceCallCardProps {
  duration?: number;
  transcript?: string;
  summary?: string;
  recordingUrl?: string | null;
  direction?: 'inbound' | 'outbound';
}

export function VoiceCallCard({ duration, transcript, summary, recordingUrl, direction }: VoiceCallCardProps) {
  const [expanded, setExpanded] = useState(false);
  const lines = transcript?.split('\n').filter(Boolean) ?? [];
  const preview = lines.slice(0, 2).join('\n');
  const hasMore = lines.length > 2;

  return (
    <div className="rounded-row border border-chart-purple/20 bg-chart-purple/8 p-3 space-y-2 max-w-xs">
      <div className="flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-chart-purple/15">
          <Phone className="h-4 w-4 text-chart-purple" />
        </div>
        <div>
          <div className="flex items-center gap-1.5">
            <p className="text-xs font-semibold text-primary">Voice Call</p>
            {direction && (
              <span
                className={
                  direction === 'outbound'
                    ? 'inline-flex items-center gap-0.5 text-[10px] text-chart-purple'
                    : 'inline-flex items-center gap-0.5 text-[10px] text-success'
                }
              >
                {direction === 'outbound' ? (
                  <><PhoneOutgoing className="h-3 w-3" /> Outbound</>
                ) : (
                  <><PhoneIncoming className="h-3 w-3" /> Inbound</>
                )}
              </span>
            )}
          </div>
          {duration !== undefined && (
            <p className="text-xs text-secondary">{formatTime(duration)}</p>
          )}
        </div>
      </div>

      {summary && (
        <p className="text-xs text-primary italic">{summary}</p>
      )}

      {preview && (
        <div className="text-xs text-secondary font-mono whitespace-pre-wrap">
          {expanded ? transcript : preview}
          {hasMore && !expanded && <span className="text-muted">…</span>}
        </div>
      )}

      {hasMore && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-1 text-xs text-chart-purple hover:text-primary"
        >
          {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          {expanded ? 'Show less' : 'Show more'}
        </button>
      )}

      <CallRecordingPlayer
        recordingUrl={recordingUrl}
        emptyState={
          <Button variant="outline" size="sm" className="w-full text-xs" disabled>
            No recording available
          </Button>
        }
      />
    </div>
  );
}
