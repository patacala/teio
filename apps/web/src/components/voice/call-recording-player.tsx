'use client';

import { useState } from 'react';
import { Play } from 'lucide-react';

interface CallRecordingPlayerProps {
  recordingUrl?: string | null;
  /** Rendered when there is no recording. Omit to render nothing. */
  emptyState?: React.ReactNode;
  className?: string;
}

/**
 * Recordings are fetched from the provider's CDN, so the audio element stays
 * unmounted behind a play button until the user asks for it.
 */
export function CallRecordingPlayer({
  recordingUrl,
  emptyState,
  className,
}: CallRecordingPlayerProps) {
  const [playing, setPlaying] = useState(false);

  if (!recordingUrl) return <>{emptyState ?? null}</>;

  if (!playing) {
    return (
      <button
        onClick={() => setPlaying(true)}
        className={`flex items-center gap-1.5 text-xs text-accent hover:text-accent-hover ${className ?? ''}`}
      >
        <Play className="h-3 w-3" />
        Play recording
      </button>
    );
  }

  return (
    <audio controls autoPlay className={`w-full h-8 ${className ?? ''}`} onEnded={() => setPlaying(false)}>
      <source src={recordingUrl} />
    </audio>
  );
}
