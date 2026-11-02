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
    <div className="rounded-lg border border-blue-400 bg-blue-50 p-3 space-y-2 max-w-xs">
      <div className="flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-300/10">
          <Phone className="h-4 w-4 text-blue-300" />
        </div>
        <div>
          <div className="flex items-center gap-1.5">
            <p className="text-xs font-semibold text-blue-300">Voice Call</p>
            {direction && (
              <span
                className={
                  direction === 'outbound'
                    ? 'inline-flex items-center gap-0.5 text-[10px] text-blue-600'
                    : 'inline-flex items-center gap-0.5 text-[10px] text-emerald-600'
                }
              >
                {direction === 'outbound' ? (
                  <><PhoneOutgoing className="h-3 w-3" /> Saliente</>
                ) : (
                  <><PhoneIncoming className="h-3 w-3" /> Entrante</>
                )}
              </span>
            )}
          </div>
          {duration !== undefined && (
            <p className="text-xs text-gray-500">{formatTime(duration)}</p>
          )}
        </div>
      </div>

      {summary && (
        <p className="text-xs text-gray-700 italic">{summary}</p>
      )}

      {preview && (
        <div className="text-xs text-gray-600 font-mono whitespace-pre-wrap">
          {expanded ? transcript : preview}
          {hasMore && !expanded && <span className="text-gray-400">…</span>}
        </div>
      )}

      {hasMore && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-1 text-xs text-blue-300 hover:text-blue-300"
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
