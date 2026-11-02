import { authClient } from '@/lib/auth-client';

export type VoiceCallStatus = 'initiated' | 'in_progress' | 'completed' | 'failed';
export type VoiceCallDirection = 'inbound' | 'outbound';
export type TranscriptSpeaker = 'user' | 'ai' | 'system';

export interface VoiceCallContact {
  id: string;
  first_name: string;
  last_name: string | null;
  phone: string | null;
}

export interface VoiceCall {
  id: string;
  organization_id: string;
  contact_id: string | null;
  contact?: VoiceCallContact | null;
  conversation_id: string | null;
  external_call_id: string;
  phone_from: string;
  phone_to: string;
  direction: VoiceCallDirection;
  status: VoiceCallStatus;
  duration_seconds: number | null;
  recording_url: string | null;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
}

export interface VoiceTranscript {
  id: string;
  call_id: string;
  speaker: TranscriptSpeaker;
  content: string;
  timestamp_seconds: number | null;
  created_at: string;
}

export interface VoiceCallsResult {
  items: VoiceCall[];
  meta: { total: number; limit: number; offset: number };
}

export interface VoiceCallStats {
  total: number;
  active: number;
  avg_duration_seconds: number | null;
}

export const voiceService = {
  getStats: () => authClient.get<VoiceCallStats>('/voice/calls/stats'),

  getCalls: (params?: { limit?: number; offset?: number }) => {
    const qs = new URLSearchParams();
    if (params?.limit != null) qs.set('limit', String(params.limit));
    if (params?.offset != null) qs.set('offset', String(params.offset));
    const q = qs.toString();
    return authClient.get<VoiceCallsResult>(`/voice/calls${q ? `?${q}` : ''}`);
  },

  getCall: (id: string) =>
    authClient.get<VoiceCall>(`/voice/calls/${id}`),

  getTranscripts: (callId: string) =>
    authClient.get<VoiceTranscript[]>(`/voice/calls/${callId}/transcripts`),

  respond: (callId: string, responseText: string) =>
    authClient.post<{ success: boolean; error?: string }>('/voice/respond', {
      call_id: callId,
      response_text: responseText,
    }),

  // Start an outbound Retell call (CRM → ProSales → Retell) for a contact.
  startCall: (body: { contact_id?: string; to_number?: string }) =>
    authClient.post<{ call_id?: string; status?: string }>('/voice/calls', body),
};
