'use client';

import { useQuery, useMutation } from '@tanstack/react-query';
import { voiceService } from '@/services/voice.service';

const VOICE_KEYS = {
  calls: (params?: object) => ['voice-calls', params] as const,
  call: (id: string) => ['voice-call', id] as const,
  stats: () => ['voice-call-stats'] as const,
  transcripts: (callId: string) => ['voice-transcripts', callId] as const,
};

export function useVoiceCallStats() {
  return useQuery({
    queryKey: VOICE_KEYS.stats(),
    queryFn: () => voiceService.getStats(),
    staleTime: 30_000,
  });
}

export function useVoiceCalls(params?: { limit?: number; offset?: number }) {
  return useQuery({
    queryKey: VOICE_KEYS.calls(params),
    queryFn: () => voiceService.getCalls(params),
    staleTime: 15_000,
  });
}

export function useVoiceCall(id: string | null) {
  return useQuery({
    queryKey: VOICE_KEYS.call(id ?? ''),
    queryFn: () => voiceService.getCall(id!),
    enabled: !!id,
    staleTime: 5_000,
    refetchInterval: (query) =>
      query.state.data?.status === 'in_progress' ? 5_000 : false,
  });
}

export function useVoiceTranscripts(callId: string | null, isLive = false) {
  return useQuery({
    queryKey: VOICE_KEYS.transcripts(callId ?? ''),
    queryFn: () => voiceService.getTranscripts(callId!),
    enabled: !!callId,
    staleTime: 5_000,
    refetchInterval: isLive ? 5_000 : false,
  });
}

export function useVoiceRespond() {
  return useMutation({
    mutationFn: ({ callId, responseText }: { callId: string; responseText: string }) =>
      voiceService.respond(callId, responseText),
  });
}
