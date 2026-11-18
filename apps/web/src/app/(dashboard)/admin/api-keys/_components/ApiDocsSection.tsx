'use client';

import { useState } from 'react';
import { Copy, ChevronDown, ChevronRight, Book } from 'lucide-react';
import { toast } from '@/hooks/useToast';
import { API_URL } from '@/lib/api-client';

// ─── Types ───────────────────────────────────────────────────────────────────

type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE' | 'PUT';

interface Param {
  name: string;
  type: string;
  required?: boolean;
  description: string;
}

interface Endpoint {
  method: HttpMethod;
  path: string;
  description: string;
  queryParams?: Param[];
  bodyParams?: Param[];
  note?: string;
}

interface EndpointGroup {
  label: string;
  description: string;
  endpoints: Endpoint[];
}

// ─── Data ────────────────────────────────────────────────────────────────────

const BASE_URL = API_URL;

const GROUPS: EndpointGroup[] = [
  {
    label: 'Webchat / Landing Page — Start here',
    description:
      'Use this endpoint to receive the first message from a new visitor on your landing page. No API key required — it is a public endpoint. The CRM automatically creates the contact and the conversation, then fires a webhook to n8n.',
    endpoints: [
      {
        method: 'POST',
        path: '/api/v1/messages/incoming',
        description:
          'Ingest an incoming message. Automatically find-or-create the contact (by sender_identifier + channel) and find-or-create an open conversation. Returns conversation_id, contact_id and message_id. Public — no auth required.',
        bodyParams: [
          { name: 'channel_id', type: 'uuid', required: true, description: 'Widget ID of the webchat channel (Admin → Channels → open the channel → copy the "Widget ID"). Also accepts the channel\'s internal ID. The backend derives the channel type automatically.' },
          { name: 'content', type: 'string', required: true, description: 'Message text.' },
          { name: 'sender_identifier', type: 'string', description: 'Unique visitor ID. Generate a UUID at session start and store it in localStorage. The CRM uses it to recognize returning visitors and reuse the open conversation.' },
          { name: 'sender_display_name', type: 'string', description: 'Visitor name if available (e.g. from a form). Used as the contact name.' },
          { name: 'channel_message_id', type: 'string', description: 'Unique message ID. If omitted, the backend generates it automatically. Send it only if you need deduplication on retries.' },
          { name: 'direction', type: '"inbound" | "outbound"', description: 'Message direction. The backend assumes "inbound" if omitted.' },
          { name: 'sender_type', type: '"user" | "agent" | "ai"', description: 'Sender type. The backend assumes "user" if omitted.' },
          { name: 'sent_at', type: 'ISO date', description: 'Message timestamp. Uses the server time if omitted.' },
          { name: 'metadata', type: 'object', description: 'Optional extra data (e.g. page URL, UTM parameters).' },
        ],
        note: [
          'RESPONSE → { conversation_id, contact_id, message_id }',
          'Store conversation_id in the chat state. On subsequent messages from the same visitor, send the same sender_identifier — the CRM reuses the open conversation automatically.',
          'After ingestion, the CRM fires a webhook (message.received) to n8n with conversation_id + contact_id + content.',
          'n8n replies via POST /api/v1/conversations/:conversation_id/messages using an API key.',
        ].join(' | '),
      },
    ],
  },
  {
    label: 'Contacts',
    description: 'Create, update and query contacts (leads).',
    endpoints: [
      {
        method: 'GET',
        path: '/api/v1/contacts',
        description: 'List contacts with optional search and pagination.',
        queryParams: [
          { name: 'search', type: 'string', description: 'Filter by name, email or phone.' },
          { name: 'stage_id', type: 'uuid', description: 'Filter by funnel stage ID.' },
          { name: 'page', type: 'number', description: 'Page number (default 1).' },
          { name: 'limit', type: 'number', description: 'Items per page (default 20).' },
        ],
      },
      {
        method: 'POST',
        path: '/api/v1/contacts',
        description: 'Create a new contact. Automatically assigned to first funnel stage.',
        bodyParams: [
          { name: 'first_name', type: 'string', required: true, description: 'Contact first name.' },
          { name: 'last_name', type: 'string', description: 'Contact last name.' },
          { name: 'email', type: 'string', description: 'Email address.' },
          { name: 'phone', type: 'string', description: 'Phone number.' },
          { name: 'tags', type: 'string[]', description: 'Initial tags.' },
          { name: 'handled_by', type: '"ai" | "human"', description: 'Who handles this contact (default: "human").' },
          { name: 'custom_fields', type: 'object', description: 'Arbitrary key-value metadata.' },
        ],
        note: 'n8n: use "HTTP Request" node → POST → Body type: JSON.',
      },
      {
        method: 'GET',
        path: '/api/v1/contacts/:id',
        description: 'Get a single contact by ID.',
      },
      {
        method: 'PATCH',
        path: '/api/v1/contacts/:id',
        description: 'Update contact fields.',
        bodyParams: [
          { name: 'first_name', type: 'string', description: 'First name.' },
          { name: 'last_name', type: 'string', description: 'Last name.' },
          { name: 'email', type: 'string', description: 'Email.' },
          { name: 'phone', type: 'string', description: 'Phone.' },
          { name: 'lead_score', type: 'number', description: 'Score 0–100.' },
          { name: 'handled_by', type: '"ai" | "human"', description: 'Switch between AI and human handling.' },
          { name: 'custom_fields', type: 'object', description: 'Merge into existing custom fields.' },
        ],
      },
      {
        method: 'POST',
        path: '/api/v1/contacts/:id/tags',
        description: 'Add a tag to a contact.',
        bodyParams: [
          { name: 'tag', type: 'string', required: true, description: 'Tag string to add.' },
        ],
      },
      {
        method: 'DELETE',
        path: '/api/v1/contacts/:id/tags/:tagId',
        description: 'Remove a tag from a contact (tagId is the tag string).',
      },
      {
        method: 'GET',
        path: '/api/v1/contacts/:id/activity',
        description: 'Get activity timeline for a contact (messages, calls, appointments, funnel changes).',
        queryParams: [
          { name: 'cursor', type: 'ISO date', description: 'Pagination cursor (timestamp of oldest event).' },
          { name: 'limit', type: 'number', description: 'Max events to return (default 100).' },
        ],
      },
      {
        method: 'GET',
        path: '/api/v1/contacts/stats',
        description: 'Get aggregate contact stats: total, new this month, AI-handled vs human-handled.',
      },
    ],
  },
  {
    label: 'Conversations',
    description: 'Access and send messages in omnichannel conversations.',
    endpoints: [
      {
        method: 'POST',
        path: '/api/v1/conversations/:id/messages',
        description: 'Send a message into an existing conversation. Use this from n8n to reply to a visitor — you have the conversation_id from the message.received webhook payload.',
        bodyParams: [
          { name: 'content', type: 'string', required: true, description: 'Message text.' },
          { name: 'type', type: 'string', description: 'Message type (default: "text").' },
        ],
        note: 'n8n flow: trigger on message.received webhook → read conversation_id from payload → POST here to reply. Requires API key.',
      },
      {
        method: 'GET',
        path: '/api/v1/conversations',
        description: 'List conversations.',
        queryParams: [
          { name: 'status', type: 'string', description: 'Filter by status: open, pending, resolved.' },
          { name: 'channel', type: 'string', description: 'Filter by channel: whatsapp, email, sms, etc.' },
          { name: 'page', type: 'number', description: 'Page number.' },
          { name: 'limit', type: 'number', description: 'Items per page.' },
        ],
      },
      {
        method: 'POST',
        path: '/api/v1/conversations/:id/messages',
        description: 'Send a message in an existing conversation.',
        bodyParams: [
          { name: 'content', type: 'string', required: true, description: 'Message text.' },
          { name: 'type', type: 'string', description: 'Message type (default: "text").' },
        ],
        note: 'n8n: use this to send automated replies triggered by webhooks or workflows.',
      },
      {
        method: 'PATCH',
        path: '/api/v1/conversations/:id/resolve',
        description: 'Resolve (close) a conversation.',
      },
      {
        method: 'POST',
        path: '/api/v1/conversations/:id/handoff',
        description: 'Hand off a conversation from AI to a human agent.',
      },
    ],
  },
  {
    label: 'Calendars',
    description: 'Calendars and their booking rules: work days and hours in the calendar time zone, slot size, buffer, blocked dates, minimum notice, booking horizon, reminders, staff member and the service charged at booking. Reading is open to API keys; creating, changing or deleting calendars needs an owner or admin user in the dashboard (API keys get 403).',
    endpoints: [
      {
        method: 'GET',
        path: '/api/v1/calendars',
        description: 'List all calendars for the organization. Creates "Appointments" and "Follow-up" for a new organization.',
        note: 'Response: Array of calendars with id, name, type, color, is_active, system_key, timezone, work_days, start_time, end_time, slot_duration_minutes, buffer_minutes, blocked_dates, min_notice_minutes, max_advance_days, reminder_offsets_minutes, owner_user_id, payment_service_id, hold_minutes.',
      },
      {
        method: 'POST',
        path: '/api/v1/calendars',
        description: 'Create a calendar (it inherits the organization time zone). Owner/admin users only — API keys get 403.',
        bodyParams: [
          { name: 'name', type: 'string', required: true, description: 'Calendar display name.' },
          { name: 'color', type: 'hex color', description: 'Example: "#2563EB".' },
          { name: 'type', type: '"appointments" | "custom"', description: 'Only appointments calendars can charge a service.' },
        ],
      },
      {
        method: 'GET',
        path: '/api/v1/calendars/:calendarId',
        description: 'Get a single calendar with all of its settings.',
      },
      {
        method: 'PUT',
        path: '/api/v1/calendars/:calendarId/config',
        description: 'Update any settings of a calendar in one call (all fields optional; nothing is saved if one is invalid). Owner/admin users only — API keys get 403.',
        bodyParams: [
          { name: 'name / color / is_active', type: 'string / hex / boolean', description: 'Identity and active state.' },
          { name: 'timezone', type: 'IANA zone', description: 'Example: "America/Mexico_City". Work hours and dates are read in this zone.' },
          { name: 'work_days', type: 'number[]', description: '0=Sun … 6=Sat. Example: [1,2,3,4,5].' },
          { name: 'start_time / end_time', type: 'HH:MM', description: 'Daily hours; start must be before end.' },
          { name: 'slot_duration_minutes', type: '15 | 30 | 60', description: 'Grid of offered start times.' },
          { name: 'buffer_minutes', type: '0–240', description: 'Free time kept around every booking.' },
          { name: 'blocked_dates', type: 'string[]', description: 'Local dates, YYYY-MM-DD.' },
          { name: 'min_notice_minutes', type: '0–43200', description: 'How soon a slot can be booked.' },
          { name: 'max_advance_days', type: '1–730 | null', description: 'How far ahead a slot can be booked.' },
          { name: 'contact_reschedule_days', type: '1–60', description: 'Days of free times a contact sees when changing a booking from their link.' },
          { name: 'reminder_offsets_minutes', type: 'number[]', description: 'Reminders before the start, e.g. [1440, 120]. Up to 5.' },
          { name: 'owner_user_id', type: 'uuid | null', description: 'Staff member; their bookings never overlap across their calendars.' },
          { name: 'payment_service_id', type: 'uuid | null', description: 'Service charged at booking (appointments calendars only).' },
          { name: 'hold_minutes', type: '30–1440', description: 'How long a slot stays reserved while the contact pays.' },
        ],
      },
      {
        method: 'DELETE',
        path: '/api/v1/calendars/:calendarId',
        description: 'Owner/admin users only (API keys get 403). Delete a calendar. 409 CALENDAR_HAS_UPCOMING_BOOKINGS while it has upcoming bookings; 409 CALENDAR_MOVE_TARGET_REQUIRED if past appointments must be moved (pass ?move_to=<calendarId>). The follow-up calendar cannot be deleted.',
        queryParams: [{ name: 'move_to', type: 'uuid', description: 'Calendar that receives the past appointments.' }],
      },
    ],
  },
  {
    label: 'Appointments',
    description: 'Bookings. A new booking is "scheduled" (awaiting the contact) until the contact confirms from the link we send, staff confirm it, or the payment arrives. Times are UTC instants; calendars apply their rules in their own time zone. Errors about the time come back as 409 with errors.code = "SLOT_NOT_AVAILABLE" and errors.violations (conflict, outside_working_hours, non_working_day, blocked_date, in_past, too_soon, too_far, calendar_inactive).',
    endpoints: [
      {
        method: 'GET',
        path: '/api/v1/appointments/metrics',
        description: 'Counts in the calendar time zone: today, this week, awaiting (confirmation or payment), completed, needs outcome.',
        queryParams: [{ name: 'calendar_id', type: 'uuid', description: 'Scope to one calendar.' }],
      },
      {
        method: 'GET',
        path: '/api/v1/appointments/availability',
        description: 'Free start times between two local dates of the calendar (inclusive, at most 62 days). Respects hours, work days, blocked dates, buffer, minimum notice and horizon, and never returns past times.',
        queryParams: [
          { name: 'from', type: 'YYYY-MM-DD', required: true, description: 'First local date.' },
          { name: 'to', type: 'YYYY-MM-DD', required: true, description: 'Last local date.' },
          { name: 'calendar_id', type: 'uuid', description: 'Defaults to the organization appointments calendar.' },
          { name: 'duration_minutes', type: 'number', description: 'Booking length (defaults to the slot size).' },
        ],
        note: 'Response: Array of { starts_at, ends_at } (UTC). n8n: offer these, then POST /appointments with the chosen starts_at.',
      },
      {
        method: 'GET',
        path: '/api/v1/appointments',
        description: 'List bookings.',
        queryParams: [
          { name: 'from / to', type: 'ISO date', description: 'Start-time range.' },
          { name: 'status', type: 'string', description: 'held | scheduled | confirmed | completed | cancelled | no_show.' },
          { name: 'calendar_id / contact_id', type: 'uuid', description: 'Filters.' },
          { name: 'needs_outcome', type: 'boolean', description: 'Ended bookings nobody marked completed or no-show.' },
          { name: 'limit / offset / sort', type: 'number / number / asc|desc', description: 'Paging (limit up to 200).' },
        ],
      },
      {
        method: 'POST',
        path: '/api/v1/appointments',
        description: 'Book an appointment. The contact receives a link to confirm, change the time or cancel. Calendars that charge a service answer 409 PAYMENT_REQUIRED (staff: send waive_payment) — API keys and the AI must use POST /payments with a booking.',
        bodyParams: [
          { name: 'contact_id', type: 'uuid', required: true, description: 'Contact.' },
          { name: 'calendar_id', type: 'uuid', required: true, description: 'Calendar to book on.' },
          { name: 'title', type: 'string', required: true, description: 'Title.' },
          { name: 'starts_at', type: 'ISO datetime', required: true, description: 'Start instant (from availability).' },
          { name: 'duration_minutes', type: '5–1440', required: true, description: 'Length.' },
          { name: 'description / location / meeting_url', type: 'string', description: 'Details shown to the contact.' },
          { name: 'conversation_id', type: 'uuid', description: 'Conversation the booking came from.' },
          { name: 'timezone', type: 'IANA zone', description: 'Zone for messages to the contact (defaults to the calendar zone).' },
          { name: 'override', type: '{ reason }', description: 'Owner/admin users only (not API keys): book outside the rules; the reason is kept.' },
          { name: 'waive_payment', type: 'boolean', description: 'Staff only: book a charging calendar without payment (recorded).' },
        ],
        note: 'origin is set by the API from who calls (API key = "webhook"); a value sent in the body is ignored.',
      },
      { method: 'PATCH', path: '/api/v1/appointments/:id', description: 'Edit title, description, location, meeting_url or notes. Time and status have their own routes.' },
      {
        method: 'POST',
        path: '/api/v1/appointments/:id/reschedule',
        description: 'Move to a new time under the same rules. A confirmed, unpaid booking moved by staff or an API key goes back to awaiting confirmation and the contact gets a new link.',
        bodyParams: [
          { name: 'starts_at', type: 'ISO datetime', required: true, description: 'New start ("new_start_time" still accepted).' },
          { name: 'duration_minutes', type: 'number', description: 'New length (defaults to the current one).' },
          { name: 'override', type: '{ reason }', description: 'Owner/admin users only (not API keys).' },
        ],
      },
      { method: 'POST', path: '/api/v1/appointments/:id/confirm', description: 'Confirm on behalf of the contact (recorded as staff confirmation).' },
      { method: 'POST', path: '/api/v1/appointments/:id/resend-confirmation', description: 'Send the contact a new confirmation link.' },
      {
        method: 'POST',
        path: '/api/v1/appointments/:id/cancel',
        description: 'Cancel; the contact is notified. Cancelling a paid booking puts its payment in Payments → Needs attention (no automatic refund).',
        bodyParams: [{ name: 'reason', type: '"staff" | "contact"', description: 'Who asked (default staff).' }],
      },
      { method: 'POST', path: '/api/v1/appointments/:id/complete', description: 'Record that it happened (only once it has started).' },
      { method: 'POST', path: '/api/v1/appointments/:id/no-show', description: 'Record that the contact did not come (only once it has started).' },
      { method: 'DELETE', path: '/api/v1/appointments/:id', description: 'Owner/admin users only (not API keys): delete a past or cancelled, unpaid booking. Upcoming bookings must be cancelled first.' },
    ],
  },
  {
    label: 'Follow-ups',
    description: 'Automated follow-up steps (send a message, email, call, notify the team, or a task for a person). They live on the follow-up calendar and are separate from bookings.',
    endpoints: [
      {
        method: 'POST',
        path: '/api/v1/automation/follow-ups',
        description: 'Schedule a step.',
        bodyParams: [
          { name: 'contact_id', type: 'uuid', required: true, description: 'Contact.' },
          { name: 'action', type: 'send_message | send_email | notify_agent | create_task | call', required: true, description: 'What to do.' },
          { name: 'due_at', type: 'ISO datetime', required: true, description: 'When.' },
          { name: 'executor', type: '"system" | "user"', description: '"user": a person does it; it waits in the agenda until marked done.' },
          { name: 'channel_strategy / message_content / title', type: 'string', description: 'Optional.' },
        ],
      },
      {
        method: 'GET',
        path: '/api/v1/automation/follow-ups',
        description: 'List steps (filters: status, action, contact_id, calendar_id, from, to, sort, limit, offset). Status: pending | processing | awaiting_user | completed | cancelled | failed.',
      },
      { method: 'PATCH', path: '/api/v1/automation/follow-ups/:id', description: 'Edit title/description/message or move due_at (pending steps).' },
      { method: 'POST', path: '/api/v1/automation/follow-ups/:id/complete', description: 'Mark done (n8n or a person); the sequence moves on once.' },
      { method: 'PATCH', path: '/api/v1/automation/follow-ups/:id/cancel', description: 'Skip the step; the sequence moves on.' },
      { method: 'DELETE', path: '/api/v1/automation/follow-ups/:id', description: 'Delete the step.' },
    ],
  },
  {
    label: 'Companies',
    description: 'Create and manage companies linked to contacts. Useful from n8n to enrich lead data with company information.',
    endpoints: [
      {
        method: 'GET',
        path: '/api/v1/companies',
        description: 'List all companies for the organization.',
        queryParams: [
          { name: 'search', type: 'string', description: 'Filter by company name.' },
          { name: 'page', type: 'number', description: 'Page number (default 1).' },
          { name: 'limit', type: 'number', description: 'Items per page (default 20).' },
        ],
      },
      {
        method: 'POST',
        path: '/api/v1/companies',
        description: 'Create a new company.',
        bodyParams: [
          { name: 'name', type: 'string', required: true, description: 'Company name.' },
          { name: 'company_type', type: 'string', description: 'Type of company (e.g. "agency", "brand", "startup").' },
          { name: 'website', type: 'string', description: 'Company website URL.' },
          { name: 'logo', type: 'string', description: 'Logo URL.' },
          { name: 'demo_link', type: 'string', description: 'Link to company demo or product.' },
          { name: 'company_context', type: 'string', description: 'Free-text context about the company (used by AI agents).' },
        ],
        note: 'n8n: use this after qualifying a lead to enrich the CRM with company data. Then link via PATCH /contacts/:id with company_id.',
      },
      {
        method: 'GET',
        path: '/api/v1/companies/:id',
        description: 'Get a single company by ID.',
      },
      {
        method: 'PATCH',
        path: '/api/v1/companies/:id',
        description: 'Update company fields.',
        bodyParams: [
          { name: 'name', type: 'string', description: 'Company name.' },
          { name: 'company_type', type: 'string', description: 'Type of company.' },
          { name: 'website', type: 'string', description: 'Website URL.' },
          { name: 'logo', type: 'string', description: 'Logo URL.' },
          { name: 'demo_link', type: 'string', description: 'Demo link URL.' },
          { name: 'company_context', type: 'string', description: 'Context for AI.' },
          { name: 'website_screenshot', type: 'string', description: 'Screenshot URL (generated automatically by the demo flow).' },
        ],
      },
      {
        method: 'DELETE',
        path: '/api/v1/companies/:id',
        description: 'Delete a company. Returns 204 No Content.',
      },
    ],
  },
  {
    label: 'Demo Magic Links',
    description: 'Public endpoints for the demo request flow. No API key required — call these from your landing page. The flow is: init → submit → poll status → experience.',
    endpoints: [
      {
        method: 'POST',
        path: '/api/v1/demo/init',
        description: 'Initialize a demo session. Returns a one-time token valid for 45 minutes. Rate limited to 3 requests/hour per IP. Public — no auth.',
        note: 'RESPONSE → { token: string }. Store this token and use it in the submit step.',
      },
      {
        method: 'POST',
        path: '/api/v1/demo/:token/submit',
        description: 'Submit the demo request form using the init token. Creates contact + company in the CRM, triggers n8n webhook to generate the personalized demo. Public — no auth.',
        bodyParams: [
          { name: 'first_name', type: 'string', required: true, description: 'Prospect first name.' },
          { name: 'last_name', type: 'string', description: 'Prospect last name.' },
          { name: 'email', type: 'string', required: true, description: 'Email — used to send the demo-ready notification.' },
          { name: 'phone', type: 'string', description: 'Phone number.' },
          { name: 'company_name', type: 'string', required: true, description: 'Company name.' },
          { name: 'website', type: 'string', description: 'Company website — passed to n8n for screenshot generation.' },
          { name: 'demo_type', type: '"live_chat" | "ai_voice" | "crm"', required: true, description: 'Type of demo to generate.' },
        ],
        note: 'RESPONSE → { request_id: string }. Use request_id to poll the status.',
      },
      {
        method: 'GET',
        path: '/api/v1/demo/status/:requestId',
        description: 'Poll the demo request status. Public — no auth.',
        note: 'RESPONSE → { status: "processing" | "ready" | "failed", demo_url?: string }. Poll every 3–5 seconds until status is "ready" or "failed". When ready, demo_url contains the personalized experience link.',
      },
      {
        method: 'GET',
        path: '/api/v1/demo/experience/:token',
        description: 'Validate a demo experience token (Link 2). Called when the prospect clicks the link in the email. Returns demo_type and contact_id. Public — no auth. Token expires in 7 days, max 3 uses.',
        note: 'RESPONSE → { demo_type: string, contact_id: string }. Use demo_type to render the correct demo experience on your landing page.',
      },
    ],
  },
  {
    label: 'Funnels & Stages',
    description: 'Read sales pipelines and stage IDs. Contacts move between stages through funnel rules, not through the API.',
    endpoints: [
      {
        method: 'GET',
        path: '/api/v1/funnels',
        description: 'List all funnels. Use to obtain funnel IDs.',
      },
      {
        method: 'GET',
        path: '/api/v1/funnels/stages',
        description: 'Get all stages across all funnels. Use to map stage IDs → names (e.g. the stage_id filter on GET /contacts).',
      },
      {
        method: 'GET',
        path: '/api/v1/funnels/:id/stages',
        description: 'Get stages for a specific funnel.',
      },
    ],
  },
  {
    label: 'AI Automation (n8n)',
    description: 'Execute CRM tools from n8n workflows. The trigger payload now includes contact info and upcoming_appointments automatically.',
    endpoints: [
      {
        method: 'POST',
        path: '/api/v1/ai/tools/execute',
        description: 'Execute a CRM tool action. Rate limited to 30 req/min.',
        bodyParams: [
          { name: 'tool', type: 'string', required: true, description: 'Tool name — see GET /api/v1/ai/tools/built-in for the full list and schemas.' },
          { name: 'parameters', type: 'object', required: true, description: 'Tool-specific parameters (see tool definitions).' },
          { name: 'contact_id', type: 'uuid', description: 'Contact context for the tool execution.' },
        ],
        note: 'Scheduling tools: get_calendars, get_available_slots (from/to local dates), create_appointment, reschedule_appointment, cancel_appointment, get_contact_appointments, create_payment_link (holds the slot while the contact pays). The trigger payload already includes upcoming_appointments.',
      },
      {
        method: 'GET',
        path: '/api/v1/ai/tools',
        description: 'List available automation tools with their parameter schemas.',
      },
    ],
  },
  {
    label: 'Knowledge Base',
    description: 'Search and manage the AI knowledge base.',
    endpoints: [
      {
        method: 'GET',
        path: '/api/v1/knowledge/search',
        description: 'Search knowledge entries by content.',
        queryParams: [
          { name: 'q', type: 'string', required: true, description: 'Search query.' },
        ],
        note: 'n8n: use this to retrieve relevant KB articles before sending AI responses.',
      },
      {
        method: 'GET',
        path: '/api/v1/knowledge',
        description: 'List all knowledge entries.',
      },
      {
        method: 'POST',
        path: '/api/v1/knowledge',
        description: 'Create a new knowledge entry.',
        bodyParams: [
          { name: 'title', type: 'string', required: true, description: 'Entry title.' },
          { name: 'content', type: 'string', required: true, description: 'Entry content (markdown supported).' },
          { name: 'tags', type: 'string[]', description: 'Tags for filtering.' },
        ],
      },
    ],
  },
  {
    label: 'Templates',
    description: 'Retrieve message templates for automated sends.',
    endpoints: [
      {
        method: 'GET',
        path: '/api/v1/templates',
        description: 'List message templates.',
        queryParams: [
          { name: 'channel', type: 'string', description: 'Filter by channel: whatsapp, email, sms.' },
        ],
        note: 'n8n: fetch templates then interpolate variables before sending via /conversations/:id/messages.',
      },
    ],
  },
];

// ─── Method badge ─────────────────────────────────────────────────────────────

const METHOD_STYLES: Record<HttpMethod, string> = {
  GET: 'bg-success/15 text-success',
  POST: 'bg-olive-dark text-accent',
  PUT: 'bg-chart-purple/15 text-chart-purple',
  PATCH: 'bg-warning/15 text-warning',
  DELETE: 'bg-danger/15 text-danger',
};

function MethodBadge({ method }: { method: HttpMethod }) {
  return (
    <span className={`inline-flex items-center rounded-sm px-1.5 py-0.5 text-[10px] font-bold tracking-wide ${METHOD_STYLES[method]}`}>
      {method}
    </span>
  );
}

// ─── Copy button ─────────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text);
        toast({ title: 'Copied', variant: 'default' });
      }}
      className="shrink-0 p-1 rounded-sm text-muted hover:text-secondary transition-colors"
      title="Copy"
    >
      <Copy className="h-3 w-3" />
    </button>
  );
}

// ─── Endpoint row ─────────────────────────────────────────────────────────────

function EndpointRow({ ep }: { ep: Endpoint }) {
  const [open, setOpen] = useState(false);
  const fullPath = `${BASE_URL}${ep.path}`;
  const hasDetail = ep.queryParams || ep.bodyParams || ep.note;

  return (
    <div className="border border-subtle rounded-lg overflow-hidden">
      <button
        className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-surface-raised transition-colors text-left"
        onClick={() => hasDetail && setOpen((v) => !v)}
      >
        <MethodBadge method={ep.method} />
        <code className="flex-1 text-xs text-primary font-mono truncate">{ep.path}</code>
        <span className="text-xs text-muted hidden sm:block truncate max-w-[280px]">{ep.description}</span>
        <div className="flex items-center gap-1 shrink-0">
          <CopyButton text={fullPath} />
          {hasDetail && (
            <span className="text-muted">
              {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            </span>
          )}
        </div>
      </button>

      {open && hasDetail && (
        <div className="border-t border-subtle px-4 py-3 bg-surface-raised space-y-3">
          <p className="text-xs text-secondary">{ep.description}</p>

          {ep.queryParams && (
            <div>
              <p className="text-[10px] font-semibold text-secondary uppercase tracking-wide mb-1.5">Query params</p>
              <div className="space-y-1">
                {ep.queryParams.map((p) => (
                  <div key={p.name} className="flex items-start gap-2 text-xs">
                    <code className="text-accent font-mono shrink-0">{p.name}</code>
                    <span className="text-muted shrink-0">{p.type}</span>
                    {p.required && <span className="text-danger shrink-0 text-[10px] font-medium">required</span>}
                    <span className="text-secondary">{p.description}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {ep.bodyParams && (
            <div>
              <p className="text-[10px] font-semibold text-secondary uppercase tracking-wide mb-1.5">Body (JSON)</p>
              <div className="space-y-1">
                {ep.bodyParams.map((p) => (
                  <div key={p.name} className="flex items-start gap-2 text-xs">
                    <code className="text-accent font-mono shrink-0">{p.name}</code>
                    <span className="text-muted shrink-0">{p.type}</span>
                    {p.required && <span className="text-danger shrink-0 text-[10px] font-medium">required</span>}
                    <span className="text-secondary">{p.description}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {ep.note && (
            <div className="flex items-start gap-2 bg-olive-dark border border-accent/12 rounded-lg px-3 py-2">
              <span className="text-accent text-[10px] font-bold uppercase tracking-wide shrink-0 mt-0.5">Note</span>
              <p className="text-xs text-accent">{ep.note}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Group accordion ──────────────────────────────────────────────────────────

function EndpointGroup({ group }: { group: EndpointGroup }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border border-subtle rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 bg-surface hover:bg-surface-raised transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-primary">{group.label}</span>
          <span className="text-xs text-muted">{group.endpoints.length} endpoints</span>
        </div>
        {open ? <ChevronDown className="h-4 w-4 text-muted" /> : <ChevronRight className="h-4 w-4 text-muted" />}
      </button>

      {open && (
        <div className="border-t border-subtle p-4 space-y-2 bg-surface">
          <p className="text-xs text-secondary mb-3">{group.description}</p>
          {group.endpoints.map((ep) => (
            <EndpointRow key={`${ep.method}-${ep.path}`} ep={ep} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function ApiDocsSection() {
  const [open, setOpen] = useState(false);

  return (
    <div className="space-y-4">
      {/* Section header */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between text-left"
      >
        <div className="flex items-center gap-2">
          <Book className="h-4 w-4 text-muted" />
          <h2 className="text-base font-semibold text-primary">API Reference</h2>
          <span className="text-xs text-muted">— endpoints available to n8n and external applications</span>
        </div>
        {open ? <ChevronDown className="h-4 w-4 text-muted" /> : <ChevronRight className="h-4 w-4 text-muted" />}
      </button>

      {open && (
        <div className="space-y-4">
          {/* Auth instructions */}
          <div className="bg-surface border border-subtle rounded-xl p-4 space-y-3">
            <p className="text-xs font-semibold text-primary uppercase tracking-wide">Authentication</p>
            <div className="space-y-2 text-xs text-secondary">
              <p>Include your API key in the header of every request:</p>
              <div className="flex items-center gap-2 bg-app text-primary rounded-lg px-3 py-2 font-mono text-[11px]">
                <span className="flex-1">x-api-key: <span className="text-success">crm_live_xxxxxxxxxxxx</span></span>
                <CopyButton text="x-api-key: YOUR_KEY" />
              </div>
                  <p className="text-secondary">
                Base URL: <code className="bg-surface-raised px-1.5 py-0.5 rounded-sm text-primary">{BASE_URL}</code>
              </p>
              <p className="text-secondary mt-1">
                <span className="font-medium text-success">Public (no auth):</span>{' '}
                <code className="bg-surface-raised px-1.5 py-0.5 rounded-sm text-primary">POST /api/v1/messages/incoming</code>
                {' '}— use this from your landing page chatbot without exposing any key.
              </p>
            </div>

            <div className="border-t border-subtle pt-3">
              <p className="text-xs font-semibold text-primary mb-2">n8n setup (HTTP Request node)</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-secondary">
                <div className="bg-surface-raised rounded-lg p-2.5 space-y-1">
                  <p className="font-medium text-primary">1. Authentication</p>
                  <p>Type: <code className="bg-surface-raised px-1 rounded-sm">Header Auth</code></p>
                  <p>Name: <code className="bg-surface-raised px-1 rounded-sm">x-api-key</code></p>
                  <p>Value: <code className="bg-surface-raised px-1 rounded-sm">your API key</code></p>
                </div>
                <div className="bg-surface-raised rounded-lg p-2.5 space-y-1">
                  <p className="font-medium text-primary">2. Request</p>
                  <p>Method: depends on the endpoint</p>
                  <p>Body: <code className="bg-surface-raised px-1 rounded-sm">JSON</code></p>
                  <p>Response: <code className="bg-surface-raised px-1 rounded-sm">Auto-detect</code></p>
                </div>
              </div>
            </div>
          </div>

          {/* Endpoint groups */}
          <div className="space-y-2">
            {GROUPS.map((g) => (
              <EndpointGroup key={g.label} group={g} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
