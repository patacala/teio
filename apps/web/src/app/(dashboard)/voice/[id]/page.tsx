'use client';

import { use } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Phone, PhoneIncoming, PhoneOutgoing } from 'lucide-react';
import { useVoiceCall, useVoiceTranscripts } from '@/hooks/useVoice';
import { CallRecordingPlayer } from '@/components/voice/call-recording-player';
import type { VoiceCall, VoiceCallStatus, TranscriptSpeaker } from '@/services/voice.service';

function contactName(call: VoiceCall): string {
  const c = call.contact;
  if (!c) return 'Contacto desconocido';
  return [c.first_name, c.last_name].filter(Boolean).join(' ') || 'Sin nombre';
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
  in_progress: 'bg-emerald-100 text-emerald-700',
  completed: 'bg-blue-100 text-blue-700',
  failed: 'bg-red-100 text-red-600',
  initiated: 'bg-gray-100 text-gray-600',
};

const BUBBLE_CLASSES: Record<TranscriptSpeaker, { wrapper: string; bubble: string; label: string }> = {
  user: {
    wrapper: 'items-start',
    bubble: 'bg-gray-100 text-gray-900 rounded-xl',
    label: 'text-[10px] text-gray-400 mb-1',
  },
  ai: {
    wrapper: 'items-end',
    bubble: 'bg-blue-600 text-white rounded-xl',
    label: 'text-[10px] text-gray-400 mb-1 text-right',
  },
  system: {
    wrapper: 'items-center',
    bubble: 'bg-yellow-50 text-yellow-800 border border-yellow-200 rounded-xl',
    label: 'text-[10px] text-gray-400 mb-1 text-center',
  },
};

export default function VoiceCallDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { data: call, isLoading: callLoading } = useVoiceCall(id);
  const isLive = call?.status === 'in_progress';
  const { data: transcripts, isLoading: transcriptsLoading } = useVoiceTranscripts(id, isLive);

  return (
    <div className="flex flex-col gap-6 p-6 max-w-3xl">
      {/* Back */}
      <button
        onClick={() => router.push('/voice')}
        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 transition-colors w-fit"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Voice
      </button>

      {/* Call metadata */}
      <div className="bg-panel border border-border rounded-xl p-6">
        {callLoading ? (
          <div className="space-y-3">
            <div className="h-5 bg-gray-100 rounded animate-pulse w-48" />
            <div className="h-4 bg-gray-100 rounded animate-pulse w-64" />
          </div>
        ) : call ? (
          <>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
                  <Phone className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-gray-900">{contactName(call)}</p>
                    {call.direction === 'outbound' ? (
                      <span className="inline-flex items-center gap-1 text-[11px] text-blue-600">
                        <PhoneOutgoing className="w-3 h-3" /> Saliente
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600">
                        <PhoneIncoming className="w-3 h-3" /> Entrante
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500">{call.phone_from} → {call.phone_to}</p>
                  <p className="text-xs text-gray-400 font-mono">{call.external_call_id}</p>
                </div>
              </div>
              <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${STATUS_CLASSES[call.status] ?? 'bg-gray-100 text-gray-600'}`}>
                {call.status.replace('_', ' ')}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-4 pt-4 border-t border-border">
              {[
                { label: 'Duration', value: formatDuration(call.duration_seconds) },
                { label: 'Started', value: formatDate(call.started_at) },
                { label: 'Ended', value: formatDate(call.ended_at) },
              ].map(({ label, value }) => (
                <div key={label}>
                  <p className="text-xs text-gray-400">{label}</p>
                  <p className="text-sm font-medium text-gray-900 mt-0.5">{value}</p>
                </div>
              ))}
            </div>
            <div className="pt-4 mt-4 border-t border-border">
              <p className="text-xs text-gray-400 mb-2">Recording</p>
              <CallRecordingPlayer
                recordingUrl={call.recording_url}
                emptyState={
                  <p className="text-sm text-gray-400">No recording available.</p>
                }
              />
            </div>
          </>
        ) : (
          <p className="text-sm text-gray-400">Call not found.</p>
        )}
      </div>

      {/* Transcript */}
      <div className="bg-panel border border-border rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-gray-900">Transcript</h2>
          {isLive && (
            <span className="text-xs text-emerald-600 animate-pulse">
              Live — refreshing every 5s
            </span>
          )}
        </div>

        {transcriptsLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />
            ))}
          </div>
        ) : !transcripts || transcripts.length === 0 ? (
          <p className="text-sm text-gray-400">No transcript available yet.</p>
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
