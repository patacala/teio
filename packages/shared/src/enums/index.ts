export enum ChannelType {
  WHATSAPP = 'whatsapp',
  SMS = 'sms',
  EMAIL = 'email',
  INSTAGRAM = 'instagram',
  FACEBOOK = 'facebook',
  SLACK = 'slack',
  WEBCHAT = 'webchat',
  VOICE = 'voice',
}

export enum ConversationStatus {
  OPEN = 'open',
  PENDING = 'pending',
  RESOLVED = 'resolved',
  ARCHIVED = 'archived',
  SNOOZED = 'snoozed',
}

export enum MessageType {
  TEXT = 'text',
  IMAGE = 'image',
  VIDEO = 'video',
  AUDIO = 'audio',
  FILE = 'file',
  LOCATION = 'location',
  TEMPLATE = 'template',
  INTERACTIVE = 'interactive',
  SYSTEM = 'system',
}

export enum MessageDirection {
  INBOUND = 'inbound',
  OUTBOUND = 'outbound',
}

export enum MessageStatus {
  PENDING = 'pending',
  SENT = 'sent',
  DELIVERED = 'delivered',
  READ = 'read',
  FAILED = 'failed',
}

export enum AgentStatus {
  ONLINE = 'online',
  OFFLINE = 'offline',
  BUSY = 'busy',
  AWAY = 'away',
}

export enum AIAgentStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  TRAINING = 'training',
  ERROR = 'error',
}

export enum AIProvider {
  OPENAI = 'openai',
  ANTHROPIC = 'anthropic',
  GOOGLE = 'google',
  CUSTOM = 'custom',
}

export enum AppointmentStatus {
  SCHEDULED = 'scheduled',
  CONFIRMED = 'confirmed',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
  NO_SHOW = 'no_show',
}

export enum WebhookEventType {
  MESSAGE_RECEIVED = 'message.received',
  MESSAGE_SENT = 'message.sent',
  CONVERSATION_OPENED = 'conversation.opened',
  CONVERSATION_RESOLVED = 'conversation.resolved',
  CONTACT_CREATED = 'contact.created',
  CONTACT_UPDATED = 'contact.updated',
  APPOINTMENT_CREATED = 'appointment.created',
  APPOINTMENT_UPDATED = 'appointment.updated',
  FOLLOW_UP_DUE = 'follow_up.due',
}

export enum OrganizationPlan {
  FREE = 'free',
  STARTER = 'starter',
  PROFESSIONAL = 'professional',
  ENTERPRISE = 'enterprise',
}

export enum UserRole {
  OWNER = 'owner',
  ADMIN = 'admin',
  AGENT = 'agent',
  VIEWER = 'viewer',
}

export enum ContactStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  BLOCKED = 'blocked',
}

export enum RabbitMQExchange {
  CONVERSATIONS = 'conversations',
  AI_AGENTS = 'ai-agents',
  WEBHOOKS = 'webhooks',
  NOTIFICATIONS = 'notifications',
}

export enum RabbitMQRoutingKey {
  MESSAGE_RECEIVED = 'message.received',
  MESSAGE_SEND = 'message.send',
  CONVERSATION_ASSIGN = 'conversation.assign',
  AI_PROCESS = 'ai.process',
  WEBHOOK_DELIVER = 'webhook.deliver',
  NOTIFICATION_SEND = 'notification.send',
}

export enum DemoType {
  LIVE_CHAT = 'live_chat',
  AI_VOICE  = 'ai_voice',
  CRM       = 'crm',
}

export enum DemoRequestStatus {
  PROCESSING = 'processing',
  READY      = 'ready',
  FAILED     = 'failed',
}

export enum MagicLinkType {
  DEMO_INIT       = 'demo_init',
  DEMO_EXPERIENCE = 'demo_experience',
}

export enum CommunicationEventType {
  // ── Customer care → CONTACTO (email + sms) ────────────────────────────
  APPOINTMENT_CREATED = 'appointment_created',
  APPOINTMENT_RESCHEDULED = 'appointment_rescheduled',
  APPOINTMENT_CANCELLED = 'appointment_cancelled',
  APPOINTMENT_REMINDER = 'appointment_reminder',

  // ── Billing → ADMIN (email only) ──────────────────────────────────────
  SUBSCRIPTION_UPDATED = 'subscription_updated',
  INVOICE_PAID = 'invoice_paid',
  INVOICE_PAYMENT_FAILED = 'invoice_payment_failed',

  // ── Custom (org-level) ────────────────────────────────────────────────
  CUSTOM = 'custom',

  // ── Platform events (is_system = true, only platform admin) ───────────
  WELCOME = 'welcome',
  PASSWORD_RESET = 'password_reset',
  TEAM_MEMBER_INVITED = 'team_member_invited',
  PAYMENT_SUCCEEDED = 'payment_succeeded',
  PAYMENT_FAILED = 'payment_failed',
  SUBSCRIPTION_CREATED = 'subscription_created',
  SUBSCRIPTION_CANCELLED = 'subscription_cancelled',
  DEMO_READY = 'demo_ready',
}

/** Platform-only event types — add new platform events here only */
const PLATFORM_EVENT_SET = new Set<CommunicationEventType>([
  CommunicationEventType.WELCOME,
  CommunicationEventType.PASSWORD_RESET,
  CommunicationEventType.TEAM_MEMBER_INVITED,
  CommunicationEventType.PAYMENT_SUCCEEDED,
  CommunicationEventType.PAYMENT_FAILED,
  CommunicationEventType.SUBSCRIPTION_CREATED,
  CommunicationEventType.SUBSCRIPTION_CANCELLED,
  CommunicationEventType.DEMO_READY,
]);

const ALL_EVENTS = Object.values(CommunicationEventType);

/** Events available to org admins — auto-derived: everything NOT in PLATFORM_EVENT_SET */
export const ORG_COMMUNICATION_EVENTS: CommunicationEventType[] =
  ALL_EVENTS.filter((e) => !PLATFORM_EVENT_SET.has(e));

/** Events managed exclusively by platform admins — auto-derived from PLATFORM_EVENT_SET */
export const PLATFORM_COMMUNICATION_EVENTS: CommunicationEventType[] =
  ALL_EVENTS.filter((e) => PLATFORM_EVENT_SET.has(e));
