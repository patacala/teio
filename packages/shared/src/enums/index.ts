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
  /** Slot reserved while the contact pays; released when the hold expires. */
  HELD = 'held',
  /** Booked, waiting for the contact to confirm from the email/SMS link. */
  SCHEDULED = 'scheduled',
  CONFIRMED = 'confirmed',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
  NO_SHOW = 'no_show',
}

export enum AppointmentConfirmedVia {
  EMAIL_LINK = 'email_link',
  SMS_LINK = 'sms_link',
  PAYMENT = 'payment',
  STAFF = 'staff',
  /** Booked before confirmation links existed. */
  LEGACY = 'legacy',
}

export enum AppointmentCancelReason {
  CONTACT = 'contact',
  STAFF = 'staff',
  AI = 'ai',
  PAYMENT_NOT_RECEIVED = 'payment_not_received',
}

export enum CalendarSystemKey {
  APPOINTMENTS = 'appointments',
  FOLLOW_UP = 'follow_up',
}

export enum PaymentAttentionReason {
  SLOT_UNAVAILABLE = 'slot_unavailable',
  APPOINTMENT_CANCELLED = 'appointment_cancelled',
  BOOKING_FAILED = 'booking_failed',
}

export enum PaymentResolution {
  REBOOKED = 'rebooked',
  REFUNDED_MANUALLY = 'refunded_manually',
  DISMISSED = 'dismissed',
}

export enum WebhookEventType {
  MESSAGE_RECEIVED = 'message.received',
  MESSAGE_SENT = 'message.sent',
  CONVERSATION_OPENED = 'conversation.opened',
  CONVERSATION_RESOLVED = 'conversation.resolved',
  CONTACT_CREATED = 'contact.created',
  CONTACT_UPDATED = 'contact.updated',
  APPOINTMENT_CREATED = 'appointment.created',
  /** Any change; status changes also send their own event below. */
  APPOINTMENT_UPDATED = 'appointment.updated',
  APPOINTMENT_CONFIRMED = 'appointment.confirmed',
  APPOINTMENT_RESCHEDULED = 'appointment.rescheduled',
  APPOINTMENT_CANCELLED = 'appointment.cancelled',
  APPOINTMENT_COMPLETED = 'appointment.completed',
  APPOINTMENT_NO_SHOW = 'appointment.no_show',
  APPOINTMENT_HOLD_RELEASED = 'appointment.hold_released',
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

/** Roles an org admin can assign to members (invite and role change) */
export const ASSIGNABLE_USER_ROLES: UserRole[] = [UserRole.ADMIN, UserRole.AGENT];

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

/**
 * How much of the product an organization can use, derived from its billing state.
 * Demo (free-plan) organizations get FULL access and are flagged with `is_demo`.
 */
export enum BillingAccessLevel {
  FULL = 'full',
  /** Paid plan without a successful payment: everything is blocked until it is paid. */
  BLOCKED = 'blocked',
  /** Organization deactivated by the platform. */
  SUSPENDED = 'suspended',
}

export enum BillingRestrictionReason {
  ORGANIZATION_INACTIVE = 'organization_inactive',
  PAYMENT_METHOD_MISSING = 'payment_method_missing',
  PAYMENT_METHOD_EXPIRED = 'payment_method_expired',
  PAYMENT_PAST_DUE = 'payment_past_due',
  GRACE_PERIOD_EXPIRED = 'grace_period_expired',
  SUBSCRIPTION_UNPAID = 'subscription_unpaid',
  SUBSCRIPTION_INCOMPLETE = 'subscription_incomplete',
  SUBSCRIPTION_PAUSED = 'subscription_paused',
  SUBSCRIPTION_CANCELED = 'subscription_canceled',
  CANCELLATION_SCHEDULED = 'cancellation_scheduled',
  /** Demo period is over: blocked until a plan is chosen. */
  DEMO_EXPIRED = 'demo_expired',
  /** Demo ends within a few days. */
  DEMO_ENDING_SOON = 'demo_ending_soon',
}

/** Values stored in billing.plans.features. `ALL` unlocks every feature. */
export enum PlanFeature {
  BASIC_INBOX = 'basic_inbox',
  CONTACTS = 'contacts',
  AI_RESPONSES = 'ai_responses',
  ANALYTICS = 'analytics',
  VOICE_CALLS = 'voice_calls',
  AUTOMATION = 'automation',
  ALL = 'all',
}
