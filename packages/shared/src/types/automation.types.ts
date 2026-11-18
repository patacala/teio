/** Follow-up agenda steps (scheduling.scheduled_actions). */
export type ActionType = 'send_message' | 'send_email' | 'notify_agent' | 'create_task' | 'call';
export type ExecutorType = 'system' | 'user';
export type ActionStatus = 'pending' | 'processing' | 'awaiting_user' | 'completed' | 'failed' | 'cancelled';
export type ChannelStrategy =
  | 'auto'
  | 'same_channel'
  | 'whatsapp_only'
  | 'sms_only'
  | 'email_only'
  | 'voice_only';

// Automations (the workflow builder) live in ../automation.
