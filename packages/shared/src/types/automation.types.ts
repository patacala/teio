export type ActionType = 'send_message' | 'send_email' | 'notify_agent' | 'create_task' | 'call';
export type ExecutorType = 'system' | 'user';
export type ActionStatus = 'pending' | 'scheduled' | 'processing' | 'completed' | 'failed' | 'cancelled';
export type ChannelStrategy =
  | 'auto'
  | 'same_channel'
  | 'whatsapp_only'
  | 'sms_only'
  | 'email_only'
  | 'voice_only';

export interface CreateAutomatedAppointmentInput {
  contact_id: string;
  calendar_id?: string;
  action: ActionType;
  executor?: ExecutorType;
  due_at: string;
  channel_strategy?: ChannelStrategy;
  message_content?: string;
  title?: string;
  source?: string;
  metadata?: Record<string, unknown>;
}

// ── Automation Sequences ──────────────────────────────────────────────

export type SequenceType = 'no_response' | 'appointment_reminder' | 'post_service' | 'reactivation' | 'manual';
export type SequenceStatus = 'active' | 'completed' | 'cancelled' | 'exhausted';
export type CompletionReason = 'max_attempts' | 'manual' | 'workflow' | 'conversation_resolved' | 'opt_out' | 'appointment_booked';

export interface CreateSequenceInput {
  contact_id: string;
  conversation_id?: string;
  sequence_type?: SequenceType;
  /**
   * Pins the exact cadence to clone. Preferred over `sequence_type`, which only
   * names a category and stays ambiguous once an org owns several templates of
   * the same type (duplicating is the only way to add one).
   */
  template_id?: string;
  source?: string;
  due_at?: string;
  /** Overrides the AI-generated body of the first message. */
  message_content?: string;
  metadata?: Record<string, unknown>;
}

/** First attempt: +2h from now. Subsequent: next business day at 10:00. */
export const FIRST_FOLLOW_UP_DELAY_HOURS = 2;
export const FOLLOW_UP_HOUR = 10; // 10:00 AM
