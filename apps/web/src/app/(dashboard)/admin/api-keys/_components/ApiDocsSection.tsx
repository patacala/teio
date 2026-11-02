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
    label: '🚀 Webchat / Landing Page — Start here',
    description:
      'Use this endpoint to receive the first message from a new visitor on your landing page. No API key required — it is a public endpoint. The CRM automatically creates the contact and the conversation, then fires a webhook to n8n.',
    endpoints: [
      {
        method: 'POST',
        path: '/api/v1/messages/incoming',
        description:
          'Ingest an incoming message. Automatically find-or-create the contact (by sender_identifier + channel) and find-or-create an open conversation. Returns conversation_id, contact_id and message_id. Public — no auth required.',
        bodyParams: [
          { name: 'channel_id', type: 'uuid', required: true, description: 'Widget ID del canal webchat (Admin → Channels → abre el canal → copia el "Widget ID"). También acepta el ID interno del canal. El backend deriva el tipo de canal automáticamente.' },
          { name: 'content', type: 'string', required: true, description: 'Texto del mensaje.' },
          { name: 'sender_identifier', type: 'string', description: 'ID único del visitante. Genera un UUID al inicio de sesión y guárdalo en localStorage. El CRM lo usa para reconocer visitantes que regresan y reutilizar la conversación abierta.' },
          { name: 'sender_display_name', type: 'string', description: 'Nombre del visitante si está disponible (p.ej. de un formulario). Se usa como nombre del contacto.' },
          { name: 'channel_message_id', type: 'string', description: 'ID único del mensaje. Si no se envía, el backend lo genera automáticamente. Envíalo solo si necesitas deduplicación en reintentos.' },
          { name: 'direction', type: '"inbound" | "outbound"', description: 'Dirección del mensaje. El backend asume "inbound" si se omite.' },
          { name: 'sender_type', type: '"user" | "agent" | "ai"', description: 'Tipo de remitente. El backend asume "user" si se omite.' },
          { name: 'sent_at', type: 'ISO date', description: 'Timestamp del mensaje. Usa la hora del servidor si se omite.' },
          { name: 'metadata', type: 'object', description: 'Datos extra opcionales (p.ej. URL de página, parámetros UTM).' },
        ],
        note: [
          'RESPONSE → { conversation_id, contact_id, message_id }',
          'Guarda conversation_id en el estado del chat. En mensajes siguientes del mismo visitante, envía el mismo sender_identifier — el CRM reutiliza la conversación abierta automáticamente.',
          'Tras la ingestión, el CRM dispara un webhook (message.received) a n8n con conversation_id + contact_id + content.',
          'n8n responde via POST /api/v1/conversations/:conversation_id/messages usando un API key.',
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
        method: 'PATCH',
        path: '/api/v1/contacts/:id/stage',
        description: 'Move a contact to a specific funnel stage.',
        bodyParams: [
          { name: 'stage_id', type: 'uuid', required: true, description: 'Target funnel stage ID.' },
        ],
        note: 'Triggers a funnel_change event in the activity timeline.',
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
    description: 'Manage calendars and their schedule config (work days, hours, slots, timezone, blocked dates). Each calendar is an independent container for appointments.',
    endpoints: [
      {
        method: 'GET',
        path: '/api/v1/calendars',
        description: 'List all calendars for the organization. Auto-creates "Appointments" (blue) and "Follow-up" (green) if none exist.',
        note: 'Response: Array of calendar objects with id, name, color, is_active, work_days, start_time, end_time, slot_duration_minutes, buffer_minutes, timezone, blocked_dates.',
      },
      {
        method: 'POST',
        path: '/api/v1/calendars',
        description: 'Create a new calendar.',
        bodyParams: [
          { name: 'name', type: 'string', required: true, description: 'Calendar display name.' },
          { name: 'color', type: 'hex color', description: 'Color for the calendar dot. Example: "#2563EB".' },
        ],
      },
      {
        method: 'GET',
        path: '/api/v1/calendars/:calendarId',
        description: 'Get a single calendar with its full schedule config.',
      },
      {
        method: 'PATCH',
        path: '/api/v1/calendars/:calendarId',
        description: 'Update calendar name, color or active state.',
        bodyParams: [
          { name: 'name', type: 'string', description: 'New display name.' },
          { name: 'color', type: 'hex color', description: 'New color.' },
          { name: 'is_active', type: 'boolean', description: 'Enable or disable the calendar.' },
        ],
      },
      {
        method: 'PUT',
        path: '/api/v1/calendars/:calendarId/config',
        description: 'Update schedule config for a calendar (work days, hours, slot duration, buffer, timezone, blocked dates).',
        bodyParams: [
          { name: 'work_days', type: 'number[]', description: 'Active days of week (0=Sun … 6=Sat). Example: [1,2,3,4,5] for Mon–Fri.' },
          { name: 'start_time', type: 'string', description: 'Daily work start time in HH:MM format. Example: "09:00".' },
          { name: 'end_time', type: 'string', description: 'Daily work end time in HH:MM format. Example: "18:00".' },
          { name: 'slot_duration_minutes', type: '15 | 30 | 60', description: 'Duration of each appointment slot in minutes.' },
          { name: 'buffer_minutes', type: 'number', description: 'Buffer between appointments in minutes (0, 10, 15 or 30).' },
          { name: 'timezone', type: 'string', description: 'IANA timezone. Example: "America/Mexico_City".' },
          { name: 'blocked_dates', type: 'string[]', description: 'Dates to block in YYYY-MM-DD format. Example: ["2026-12-25"].' },
        ],
      },
      {
        method: 'DELETE',
        path: '/api/v1/calendars/:calendarId',
        description: 'Delete a calendar. Returns 400 if it is the last calendar.',
      },
    ],
  },
  {
    label: 'Appointments',
    description: 'Create and manage appointments for contacts. Filter by calendar to scope to a specific schedule.',
    endpoints: [
      {
        method: 'GET',
        path: '/api/v1/appointments/metrics',
        description: 'Get appointment metrics: today count, week count, pending and completed totals.',
      },
      {
        method: 'GET',
        path: '/api/v1/appointments/availability',
        description: 'Get available appointment slots for a date range. Excludes slots that overlap existing appointments (plus buffer time) and respects the calendar schedule, work days, and blocked dates.',
        queryParams: [
          { name: 'from', type: 'ISO date', required: true, description: 'Start of date range. Example: "2026-03-23".' },
          { name: 'to', type: 'ISO date', required: true, description: 'End of date range. Example: "2026-03-27".' },
          { name: 'duration_minutes', type: 'number', description: 'Slot duration override. Defaults to the calendar slot_duration_minutes.' },
          { name: 'calendar_id', type: 'uuid', description: 'Calendar whose schedule rules to use (defaults to first calendar).' },
        ],
        note: 'Response: Array of { starts_at: ISO, ends_at: ISO }. n8n: use this to let contacts pick an available slot before calling POST /appointments.',
      },
      {
        method: 'GET',
        path: '/api/v1/appointments',
        description: 'List appointments with optional date range, status and calendar filter.',
        queryParams: [
          { name: 'from', type: 'ISO date', description: 'Start of date range.' },
          { name: 'to', type: 'ISO date', description: 'End of date range.' },
          { name: 'status', type: 'string', description: 'Filter by status: pending | scheduled | confirmed | completed | cancelled | no_show.' },
          { name: 'calendar_id', type: 'uuid', description: 'Filter appointments belonging to a specific calendar.' },
          { name: 'limit', type: 'number', description: 'Max results (default 50).' },
          { name: 'cursor', type: 'ISO date', description: 'Cursor for pagination (starts_at of last item).' },
        ],
      },
      {
        method: 'POST',
        path: '/api/v1/appointments',
        description: 'Create a new appointment. ends_at is computed automatically from starts_at + duration_minutes.',
        bodyParams: [
          { name: 'contact_id', type: 'uuid', required: true, description: 'Contact to link.' },
          { name: 'title', type: 'string', required: true, description: 'Appointment title.' },
          { name: 'starts_at', type: 'ISO date', required: true, description: 'Start datetime (UTC).' },
          { name: 'duration_minutes', type: 'number', required: true, description: 'Duration in minutes. ends_at is derived from this.' },
          { name: 'calendar_id', type: 'uuid', description: 'Calendar to assign this appointment to.' },
          { name: 'description', type: 'string', description: 'Optional description or agenda.' },
          { name: 'timezone', type: 'string', description: 'IANA timezone (default: UTC).' },
          { name: 'location', type: 'string', description: 'Physical location or address.' },
          { name: 'meeting_url', type: 'string', description: 'Video call URL (Zoom, Meet, etc.).' },
          { name: 'assigned_to', type: 'uuid', description: 'User ID of the agent handling the appointment.' },
          { name: 'origin', type: '"human" | "ai" | "webhook"', description: 'Who created this (default: "human"). Pass "ai" from n8n workflows.' },
        ],
        note: 'n8n: use GET /appointments/availability?calendar_id=... first to get a valid slot, then POST here with the chosen starts_at and duration_minutes.',
      },
      {
        method: 'POST',
        path: '/api/v1/appointments/:id/complete',
        description: 'Mark an appointment as completed.',
      },
      {
        method: 'POST',
        path: '/api/v1/appointments/:id/reschedule',
        description: 'Reschedule an appointment to a new start time. Duration is preserved.',
        bodyParams: [
          { name: 'new_start_time', type: 'ISO date', required: true, description: 'New start datetime (UTC).' },
        ],
      },
      {
        method: 'PATCH',
        path: '/api/v1/appointments/:id/cancel',
        description: 'Cancel an appointment (sets status to "cancelled").',
      },
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
    description: 'Manage sales pipelines and query stage IDs needed for contact moves.',
    endpoints: [
      {
        method: 'GET',
        path: '/api/v1/funnels',
        description: 'List all funnels. Use to obtain funnel IDs.',
      },
      {
        method: 'GET',
        path: '/api/v1/funnels/stages',
        description: 'Get all stages across all funnels. Use to map stage names → IDs for PATCH /contacts/:id/stage.',
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
          { name: 'tool', type: 'string', required: true, description: 'Tool name: send_message | create_contact | update_contact | create_appointment | add_contact_note | get_contact_appointments.' },
          { name: 'parameters', type: 'object', required: true, description: 'Tool-specific parameters (see tool definitions).' },
          { name: 'contact_id', type: 'uuid', description: 'Contact context for the tool execution.' },
        ],
        note: 'Available tools: send_message, create_contact, update_contact, create_appointment, add_contact_note, get_contact_appointments. The trigger payload already includes upcoming_appointments — use the tool only if you need a fresh lookup mid-conversation.',
      },
      {
        method: 'GET',
        path: '/api/v1/ai/tools',
        description: 'List available automation tools with their parameter schemas.',
      },
    ],
  },
  {
    label: 'Communications',
    description: 'Map system events (appointment_created, demo_ready, etc.) to external email templates (Resend, SendGrid). Includes delivery audit log.',
    endpoints: [
      {
        method: 'GET',
        path: '/api/v1/communications/templates/events',
        description: 'List all available event types: appointment_created, appointment_rescheduled, appointment_cancelled, appointment_reminder, demo_ready, welcome, contact_created, custom.',
      },
      {
        method: 'GET',
        path: '/api/v1/communications/templates',
        description: 'List communication templates for your organization.',
        queryParams: [
          { name: 'event_type', type: 'string', description: 'Filter by event type (e.g. "appointment_created").' },
          { name: 'channel_type', type: 'string', description: 'Filter by channel (e.g. "email").' },
        ],
      },
      {
        method: 'POST',
        path: '/api/v1/communications/templates',
        description: 'Create a communication template mapping an event to an external provider template.',
        bodyParams: [
          { name: 'event_type', type: 'string', required: true, description: 'Event type (e.g. "appointment_created").' },
          { name: 'channel_type', type: 'string', required: true, description: 'Channel: email, sms, whatsapp.' },
          { name: 'provider', type: 'string', required: true, description: 'Provider: resend, sendgrid, ses.' },
          { name: 'provider_template_id', type: 'string', required: true, description: 'Template ID in the external provider.' },
          { name: 'name', type: 'string', description: 'Display name for this mapping.' },
          { name: 'from_override', type: 'string', description: 'Override sender address.' },
          { name: 'variables_schema', type: 'object', description: 'Document expected template variables.' },
          { name: 'is_active', type: 'boolean', description: 'Enable/disable (default: true).' },
          { name: 'priority', type: 'number', description: 'Priority when multiple templates match (higher wins).' },
        ],
        note: 'Only one active template per (org, event_type, channel_type, provider). The system uses this to resolve which external template to send when an event fires.',
      },
      {
        method: 'GET',
        path: '/api/v1/communications/templates/:id',
        description: 'Get a single communication template by ID.',
      },
      {
        method: 'PATCH',
        path: '/api/v1/communications/templates/:id',
        description: 'Update a communication template.',
      },
      {
        method: 'DELETE',
        path: '/api/v1/communications/templates/:id',
        description: 'Delete a communication template.',
      },
      {
        method: 'GET',
        path: '/api/v1/communications/deliveries',
        description: 'Audit log of all dispatched communications (paginated).',
        queryParams: [
          { name: 'page', type: 'number', description: 'Page number (default 1).' },
          { name: 'limit', type: 'number', description: 'Items per page (default 20, max 100).' },
        ],
        note: 'Each entry shows: event_type, recipient, provider, status (pending/sent/delivered/failed/bounced), error_message, and timestamps.',
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
  GET: 'bg-emerald-100 text-emerald-700',
  POST: 'bg-blue-100 text-blue-700',
  PUT: 'bg-violet-100 text-violet-700',
  PATCH: 'bg-amber-100 text-amber-700',
  DELETE: 'bg-red-100 text-red-600',
};

function MethodBadge({ method }: { method: HttpMethod }) {
  return (
    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wide ${METHOD_STYLES[method]}`}>
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
      className="shrink-0 p-1 rounded text-gray-300 hover:text-gray-600 transition-colors"
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
    <div className="border border-border rounded-lg overflow-hidden">
      <button
        className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-surface transition-colors text-left"
        onClick={() => hasDetail && setOpen((v) => !v)}
      >
        <MethodBadge method={ep.method} />
        <code className="flex-1 text-xs text-gray-800 font-mono truncate">{ep.path}</code>
        <span className="text-xs text-gray-400 hidden sm:block truncate max-w-[280px]">{ep.description}</span>
        <div className="flex items-center gap-1 shrink-0">
          <CopyButton text={fullPath} />
          {hasDetail && (
            <span className="text-gray-400">
              {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            </span>
          )}
        </div>
      </button>

      {open && hasDetail && (
        <div className="border-t border-border px-4 py-3 bg-surface space-y-3">
          <p className="text-xs text-gray-600">{ep.description}</p>

          {ep.queryParams && (
            <div>
              <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Query params</p>
              <div className="space-y-1">
                {ep.queryParams.map((p) => (
                  <div key={p.name} className="flex items-start gap-2 text-xs">
                    <code className="text-blue-700 font-mono shrink-0">{p.name}</code>
                    <span className="text-gray-400 shrink-0">{p.type}</span>
                    {p.required && <span className="text-red-500 shrink-0 text-[10px] font-medium">required</span>}
                    <span className="text-gray-500">{p.description}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {ep.bodyParams && (
            <div>
              <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Body (JSON)</p>
              <div className="space-y-1">
                {ep.bodyParams.map((p) => (
                  <div key={p.name} className="flex items-start gap-2 text-xs">
                    <code className="text-blue-700 font-mono shrink-0">{p.name}</code>
                    <span className="text-gray-400 shrink-0">{p.type}</span>
                    {p.required && <span className="text-red-500 shrink-0 text-[10px] font-medium">required</span>}
                    <span className="text-gray-500">{p.description}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {ep.note && (
            <div className="flex items-start gap-2 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
              <span className="text-blue-600 text-[10px] font-bold uppercase tracking-wide shrink-0 mt-0.5">Note</span>
              <p className="text-xs text-blue-700">{ep.note}</p>
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
    <div className="border border-border rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 bg-panel hover:bg-surface transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-gray-900">{group.label}</span>
          <span className="text-xs text-gray-400">{group.endpoints.length} endpoints</span>
        </div>
        {open ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronRight className="h-4 w-4 text-gray-400" />}
      </button>

      {open && (
        <div className="border-t border-border p-4 space-y-2 bg-white">
          <p className="text-xs text-gray-500 mb-3">{group.description}</p>
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
          <Book className="h-4 w-4 text-gray-400" />
          <h2 className="text-base font-semibold text-gray-900">API Reference</h2>
          <span className="text-xs text-gray-400">— endpoints disponibles para n8n y aplicaciones externas</span>
        </div>
        {open ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronRight className="h-4 w-4 text-gray-400" />}
      </button>

      {open && (
        <div className="space-y-4">
          {/* Auth instructions */}
          <div className="bg-panel border border-border rounded-xl p-4 space-y-3">
            <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Autenticación</p>
            <div className="space-y-2 text-xs text-gray-600">
              <p>Incluye tu API key en el header de cada petición:</p>
              <div className="flex items-center gap-2 bg-gray-900 text-gray-100 rounded-lg px-3 py-2 font-mono text-[11px]">
                <span className="flex-1">x-api-key: <span className="text-emerald-400">crm_live_xxxxxxxxxxxx</span></span>
                <CopyButton text="x-api-key: YOUR_KEY" />
              </div>
                  <p className="text-gray-500">
                Base URL: <code className="bg-gray-100 px-1.5 py-0.5 rounded text-gray-800">{BASE_URL}</code>
              </p>
              <p className="text-gray-500 mt-1">
                <span className="font-medium text-emerald-700">Public (no auth):</span>{' '}
                <code className="bg-gray-100 px-1.5 py-0.5 rounded text-gray-800">POST /api/v1/messages/incoming</code>
                {' '}— use this from your landing page chatbot without exposing any key.
              </p>
            </div>

            <div className="border-t border-border pt-3">
              <p className="text-xs font-semibold text-gray-700 mb-2">Configuración en n8n (HTTP Request node)</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-gray-600">
                <div className="bg-surface rounded-lg p-2.5 space-y-1">
                  <p className="font-medium text-gray-800">1. Authentication</p>
                  <p>Type: <code className="bg-gray-100 px-1 rounded">Header Auth</code></p>
                  <p>Name: <code className="bg-gray-100 px-1 rounded">x-api-key</code></p>
                  <p>Value: <code className="bg-gray-100 px-1 rounded">tu API key</code></p>
                </div>
                <div className="bg-surface rounded-lg p-2.5 space-y-1">
                  <p className="font-medium text-gray-800">2. Request</p>
                  <p>Method: según el endpoint</p>
                  <p>Body: <code className="bg-gray-100 px-1 rounded">JSON</code></p>
                  <p>Response: <code className="bg-gray-100 px-1 rounded">Auto-detect</code></p>
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
