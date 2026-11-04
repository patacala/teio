'use client';

import { use } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Phone, PhoneIncoming, PhoneOutgoing } from 'lucide-react';
import { useVoiceCall, useVoiceTranscripts } from '@/hooks/useVoice';
import { CallRecordingPlayer } from '@/components/voice/call-recording-player';
import type { VoiceCall, VoiceCallStatus, TranscriptSpeaker } from '@/services/voice.service';

function contactName(call: VoiceCall): string {
  const c = call.contact;
  if (!c) return 'Unknown contact';
  return [c.first_name, c.last_name].filter(Boolean).join(' ') || 'Unnamed';
}

function formatDuration(sec: number | null): string {
  if (sec == null) return '—';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString();
}

const STATUS_CLASSES: Record<VoiceCallStatus, string> = {
  in_progress: 'bg-success/15 text-success',
  completed: 'bg-olive-dark text-accent',
  failed: 'bg-danger/15 text-danger',
  initiated: 'bg-surface-raised text-secondary',
};

const BUBBLE_CLASSES: Record<TranscriptSpeaker, { wrapper: string; bubble: string; label: string }> = {
  user: {
    wrapper: 'items-start',
    bubble: 'bg-surface-raised text-primary rounded-xl',
    label: 'text-[10px] text-muted mb-1',
  },
  ai: {
    wrapper: 'items-end',
    bubble: 'border border-accent/15 bg-olive-dark text-primary rounded-xl',
    label: 'text-[10px] text-muted mb-1 text-right',
  },
  system: {
    wrapper: 'items-center',
    bubble: 'bg-warning/10 text-warning border border-warning/25 rounded-xl',
    label: 'text-[10px] text-muted mb-1 text-center',
  },
};

export default function VoiceCallDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { data: call, isLoading: callLoading } = useVoiceCall(id);
  const isLive = call?.status === 'in_progress';
  const { data: transcripts, isLoading: transcriptsLoading } = useVoiceTranscripts(id, isLive);

  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      {/* Back */}
      <button
        onClick={() => router.push('/voice')}
        className="flex items-center gap-1.5 text-sm text-secondary hover:text-primary transition-colors w-fit"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Voice
      </button>

      {/* Call metadata */}
      <div className="bg-surface border border-subtle rounded-xl p-6">
        {callLoading ? (
          <div className="space-y-3">
            <div className="h-5 bg-surface-raised rounded-sm animate-pulse w-48" />
            <div className="h-4 bg-surface-raised rounded-sm animate-pulse w-64" />
          </div>
        ) : call ? (
          <>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-olive-dark text-accent flex items-center justify-center shrink-0">
                  <Phone className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-primary">{contactName(call)}</p>
                    {call.direction === 'outbound' ? (
                      <span className="inline-flex items-center gap-1 text-[11px] text-accent">
                        <PhoneOutgoing className="w-3 h-3" /> Outbound
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] text-success">
                        <PhoneIncoming className="w-3 h-3" /> Inbound
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-secondary">{call.phone_from} → {call.phone_to}</p>
                  <p className="text-xs text-muted font-mono">{call.external_call_id}</p>
                </div>
              </div>
              <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${STATUS_CLASSES[call.status] ?? 'bg-surface-raised text-secondary'}`}>
                {call.status.replace('_', ' ')}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-4 pt-4 border-t border-subtle">
              {[
                { label: 'Duration', value: formatDuration(call.duration_seconds) },
                { label: 'Started', value: formatDate(call.started_at) },
                { label: 'Ended', value: formatDate(call.ended_at) },
              ].map(({ label, value }) => (
                <div key={label}>
                  <p className="text-xs text-muted">{label}</p>
                  <p className="text-sm font-medium text-primary mt-0.5">{value}</p>
                </div>
              ))}
            </div>
            <div className="pt-4 mt-4 border-t border-subtle">
              <p className="text-xs text-muted mb-2">Recording</p>
              <CallRecordingPlayer
                recordingUrl={call.recording_url}
                emptyState={
                  <p className="text-sm text-muted">No recording available.</p>
                }
              />
            </div>
          </>
        ) : (
          <p className="text-sm text-muted">Call not found.</p>
        )}
      </div>

      {/* Transcript */}
      <div className="bg-surface border border-subtle rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-primary">Transcript</h2>
          {isLive && (
            <span className="text-xs text-success animate-pulse">
              Live — refreshing every 5s
            </span>
          )}
        </div>

        {transcriptsLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-10 bg-surface-raised rounded-sm animate-pulse" />
            ))}
          </div>
        ) : !transcripts || transcripts.length === 0 ? (
          <p className="text-sm text-muted">No transcript available yet.</p>
        ) : (
          <div className="space-y-3">
            {transcripts.map((t) => {
              const styles = BUBBLE_CLASSES[t.speaker] ?? BUBBLE_CLASSES.system;
              return (
                <div key={t.id} className={`flex flex-col ${styles.wrapper}`}>
                  <p className={styles.label}>
                    {t.speaker}
                    {t.timestamp_seconds != null && (
                      <span className="ml-1.5">{t.timestamp_seconds}s</span>
                    )}
                  </p>
                  <div className={`max-w-[75%] px-3 py-2 text-sm ${styles.bubble}`}>
                    {t.content}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
