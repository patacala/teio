import { authClient } from '@/lib/auth-client';

export type ActivityEvent =
  | {
      type: 'message';
      id: string;
      content: string;
      sender: 'contact' | 'agent' | 'ai';
      channel: string;
      timestamp: string;
      direction: 'inbound' | 'outbound';
      sender_type: string;
      message_type?: string;
      metadata?: Record<string, unknown>;
    }
  | {
      type: 'voice_call';
      id: string;
      duration: number;
      call_status: string;
      direction?: 'inbound' | 'outbound';
      transcript_preview?: string;
      recording_url?: string | null;
      timestamp: string;
    }
  | { type: 'system_event'; id: string; content: string; timestamp: string }
  | {
      type: 'ai_decision';
      id: string;
      decision_type: string;
      details: string;
      timestamp: string;
    }
  | {
      type: 'funnel_change';
      id: string;
      from_stage: string;
      to_stage: string;
      actor?: string;
      reason?: string;
      timestamp: string;
    }
  | {
      type: 'appointment_event';
      id: string;
      action: string;
      appointment_id: string;
      actor?: string;
      timestamp: string;
    }
  | {
      type: 'contact_data_updated';
      id: string;
      changed_fields: Record<string, { from: unknown; to: unknown }>;
      timestamp: string;
    };

export interface ActivityPage {
  events: ActivityEvent[];
  next_cursor: string | null;
}

export const activityService = {
  getContactActivity: (contactId: string, cursor?: string, limit = 50) => {
    const qs = new URLSearchParams();
    qs.set('limit', String(limit));
    if (cursor) qs.set('cursor', cursor);
    return authClient.get<ActivityPage>(`/contacts/${contactId}/activity?${qs.toString()}`);
  },
};
