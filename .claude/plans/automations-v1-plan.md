# Automations v1 — detailed plan

Status: APPROVED (v3). Steps 1–11 of §11 implemented (see §15 for what changed while implementing). Step 12 (staging rehearsal) is pending.
Pending / out-of-scope items live in `automations-backlog.md` (same folder).

## 0. Decisions this plan implements

| # | Decision | How v1 implements it |
|---|---|---|
| D1 | First iteration with the most important; keep a memory of the rest | This plan + `automations-backlog.md` |
| D2 | Automations are the only source that decides. **No active automation → the AI never receives a message** | Every direct call to the AI trigger queue is removed. The action "Send to AI agent" is the only way to reach the AI |
| D3 | The incoming-message automation is **one and the same for all channels** | A single system automation "Incoming message → AI agent", no channel filter. Nothing is installed per channel |
| D4 | Booking messages move to the builder | `AppointmentEmailConsumer` is replaced by 5 system automations with editable email/SMS content |
| D5 | English only, open to more languages | English copy; `locale` stored on each automation; variable layer is language-agnostic |
| D6 | Remove n8n | n8n hand-off, `follow_up.due`, both n8n tools, routing switch and n8n docs removed; demo generation becomes a generic "demo generator" endpoint |
| D7 | Branching + visual builder | Tree workflows with if/else and wait-for-event branches, drawn with React Flow |
| D8 | No messaging-window restriction | No 24h check. A send is always attempted; if a provider rejects it, that's a normal step failure (retry, then `failed` branch or failed run) |
| D9 | Legacy sequences: cancel and remove | Single global cutover. Active sequences are cancelled by migration; the legacy engine code is deleted in the same release |
| D10 | Automations run on any event they need, **and on a schedule** (no event) | New `schedule` trigger (once / daily / weekly / monthly at a time, with an audience filter). No plan gating: automations run on every plan |
| D11 | Only owner/admin edit and publish; everyone can see runs | Role check on write endpoints |
| D12 | Human takeover stays an editable condition | The default AI automation contains an "AI active on conversation?" condition; the Send to AI node has no hidden check |
| D13 | Platform notifications stay hard-coded | In-app alerts (new message, new contact, new appointment, call started, payment needs review / pending payment) stay as they are |
| D14 | Every org can create and build its own automations, with any trigger | No reserved triggers: custom automations can also use `message.received`, next to the system AI automation |
| D15 | A scheduled automation runs **once for the whole organisation** | Schedule firing creates **one organisation-level run** (no contact). Its actions choose recipients (contacts matching a filter, specific contacts, team, a phone/email) |
| D16 | Automations are independent of each other | No de-duplication across automations: 10 automations that each send an SMS send 10 SMS; 2 automations that each "Send to AI" send the message to the AI twice. Idempotency exists only *inside* a run (retries never send twice) |

## 1. Guiding principles
1. **Reuse the engine pieces that already work.** Scheduler cron, BullMQ/direct-mode processor, conditional-update claims, outbox, event de-duplication, channel resolution, senders, email layout, ICS, timezone helpers, agenda, UI kit. Replace only what is follow-up specific.
2. **Behaviour parity at cutover.** The installer creates, for each org, system automations that reproduce what the org gets today. The only exception is the legacy sequences that were running, which are cancelled (D9).
3. **The ProSales contract does not change.** Same payload, same `event_type` values, same tools API (minus the two n8n tools).
4. **Everything an automation does is visible.** Every run and step is recorded and shown.

## 2. Concepts

| Concept | Meaning | Replaces |
|---|---|---|
| Automation | Org-owned workflow: triggers + graph + settings, with a status (draft / active / paused / archived) | `sequence_templates` |
| Version | Immutable snapshot created on Publish; runs pin to it | clone-into-`sequence_steps` |
| Trigger | Event + filters, or a schedule + audience, that enrols contacts | hard-coded call sites, `sequence_type` |
| Run | One execution of one version: cursor, context, status. **Contact run** (event/manual triggers, one contact) or **organisation run** (schedule trigger, no contact) | `automation_sequences` |
| Run step | Log of one node execution: status, branch, output, error | `sequence_steps` outcome columns |
| System automation | Installed from a code template (`template_key`); editable, pausable with a warning, not deletable | hard-coded consumers |
| Human task | Node that creates an agenda task (`scheduled_actions`, executor = user) | same table, reused |

## 3. Data model

New schema `automation`, plus small changes to `scheduling.scheduled_actions`.
Files: `packages/database/schemas/058_automations.sql`, mirrored by `apps/api/src/migrations/1794100000000-Automations.ts` (repo convention).

### 3.1 `automation.automations`
- `id`, `organization_id` (FK, cascade)
- `name`, `description`
- `status` (`draft | active | paused | archived`)
- `category` (`ai | messaging | booking | follow_up | custom`)
- `template_key` (nullable), `is_system`
- `locale` (default `'en'`)
- `draft` jsonb (`{ triggers, graph, settings }`)
- `published_version_id`
- `created_by`, `updated_by`, timestamps
- Unique `(organization_id, template_key) WHERE template_key IS NOT NULL` (idempotent installer)

### 3.2 `automation.automation_versions`
- `id`, `automation_id`, `organization_id`, `version` (unique per automation)
- `triggers` jsonb, `graph` jsonb, `settings` jsonb
- `published_by`, `published_at`

### 3.3 `automation.automation_triggers` (event lookup, rebuilt on publish/pause)
- `id`, `organization_id`, `automation_id`, `version_id`, `event_type`, `filters` jsonb, `is_active`
- Index `(organization_id, event_type) WHERE is_active`

### 3.4 `automation.automation_schedules` (schedule triggers, rebuilt on publish/pause)
- `id`, `organization_id`, `automation_id`, `version_id`, `trigger_key`
- `spec` jsonb (frequency, time, days, date), `timezone`
- `next_run_at`, `last_run_at`, `is_active`
- Index `(next_run_at) WHERE is_active`

### 3.5 `automation.automation_runs`
- `id`, `organization_id`, `automation_id`, `version_id`, `scope` (`contact | organization`), `contact_id` (**nullable**, required when scope = contact), `conversation_id`
- `status` (`waiting | running | completed | exited | failed | cancelled`)
- `current_node_key`
- `resume_at`, `waiting_for` jsonb (`{ events, filters, timeout_at }`)
- `context` jsonb (trigger data + variables)
- `seq` (optimistic lock), `locked_until`, `attempts`
- `trigger_type`, `trigger_event_id`, `exit_reason`, `last_error`
- `started_at`, `finished_at`
- Partial unique `(automation_id, contact_id) WHERE status IN ('waiting','running') AND contact_id IS NOT NULL` (one active run per contact per automation)
- Partial unique `(automation_id, trigger_event_id) WHERE scope = 'organization'` (a schedule firing creates exactly one run, even on several instances)
- Index `(status, resume_at) WHERE status = 'waiting'`
- Index `(organization_id, contact_id) WHERE status IN ('waiting','running')`

### 3.6 `automation.automation_run_steps`
- `id`, `run_id` (cascade), `organization_id`, `step_no` (unique per run)
- `node_key`, `node_type`, `status` (`running | completed | failed | skipped`), `branch`
- `output` jsonb, `error`
- `started_at`, `finished_at`

### 3.7 `scheduling.scheduled_actions`
- Add `run_id` (nullable FK, `ON DELETE SET NULL`) and `node_key`. Human tasks created by a run can resume it when done.
- `sequence_id` stays until the legacy tables are dropped (backlog A).

### 3.8 Legacy data (D9)
The migration cancels what is running:
- `UPDATE scheduling.automation_sequences SET status='cancelled', completion_reason='migrated', completed_at=NOW() WHERE status='active'`
- `UPDATE scheduling.scheduled_actions SET status='cancelled' WHERE sequence_id IS NOT NULL AND status IN ('pending','processing','awaiting_user')`

The legacy tables stay **read-only, with no code using them except the installer**. The installer reads them once to convert each org's no-response cadence and custom templates. They are dropped by a migration in the next release, once the backfill has run for every org (backlog A).

### 3.9 Org settings
- `settings.automations_installed` (installer version marker). No engine flag: the cutover is global (D9).
- `settings.sequences_enabled` is no longer read after install. Its value is used once to set the no-response automation's status, and it is removed with the legacy tables.

## 4. Triggers

### 4.1 One canonical catalog
`packages/shared/src/automation/trigger-catalog.ts` is used by the API and the web. For each trigger it lists:
- the key and label;
- the source (RMQ topic or schedule);
- how to read `contact_id` / `conversation_id`;
- the filter fields;
- the variables it provides.

### 4.2 Event triggers (v1)

| Trigger key | Source topic | Notes / changes needed |
|---|---|---|
| `message.received` | `message.received` | Inbound only. Filters: channel, text contains / keywords, AI active on conversation, first message of conversation |
| `message.sent` | `message.send` | **Add `sender_type` (ai / agent / automation / system) and `automation_run_id` to the payload.** Messages sent by automations are excluded by default (fixes the self-trigger loop) |
| `conversation.opened` | **new** | Emitted by `findOrCreateActiveConversation` when `created = true` |
| `contact.created` | `contact.created` | **Also emitted from `findOrCreateByChannel` / `findOrCreatePhoneContact`**; payload gains `source` |
| `contact.tag_added` / `contact.tag_removed` | **new** | Emitted by every tag change (`addTag`, `removeTag`, `update()` tag diffs, automation actions) |
| `contact.stage_changed` | `contact.stage.changed` | Filter: to/from stage |
| `appointment.created / confirmed / rescheduled / cancelled / completed / no_show` | existing (outbox) | |
| `appointment.confirmation_requested` | existing (outbox) | Needed for D4 |
| `appointment.reminder_due` | existing (outbox) | Filter: `offset_minutes`. Scheduling keeps owning reminder timing |
| `payment.completed` / `payment.expired` | existing (outbox) | Needed for D2 |
| `call.completed` | `call.completed` | Needed for D2 |
| `conversation.closed` | `conversation.closed` | |
| `manual` | API / UI | Enrol selected contacts |

### 4.3 Schedule trigger (D10, D15)
- **Spec:**
  - `frequency`: `once | daily | weekly | monthly`
  - `time`: `HH:MM`
  - `days_of_week` (weekly), `day_of_month` (monthly), `date` (once)
  - `timezone` (defaults to the org timezone via `findOrganizationTimezone`)
- **Next occurrence:** computed with the existing `scheduling/domain/timezone` helpers (`localDate`, `addDays`, `weekdayOf`, `zonedTimeToUtc`). The UI never asks for raw cron.
- **Firing:**
  - Every minute the scheduler claims due rows: `UPDATE … SET last_run_at=NOW(), next_run_at=<next> WHERE id IN (SELECT … WHERE is_active AND next_run_at<=NOW() FOR UPDATE SKIP LOCKED)`. `once` schedules deactivate after firing.
  - Each firing creates **one organisation run** (`scope = organization`, no contact, `trigger_event_id = <schedule_id>:<fire_time>`).
  - Missed firings after downtime run once; then the next future occurrence is computed.
- **Who receives messages** is decided by the actions, not by the trigger (§5.7 "Recipients"). Example: "Every Monday 09:00 → Send SMS to contacts tagged `vip`" is one run in the history, and one SMS per matching contact.
- Nodes that need "the contact of the run" (tags, fields, stage, AI on/off, call, Send to AI, contact conditions, wait for event) are not allowed in organisation runs; the validator rejects them with a clear message.

### 4.4 Reliability
- These emitters move from `rmqClient.emit` to `OutboxService.publish`, which gives each event an `event_id`: `message.received`, `message.send`, `conversation.opened`, `conversation.closed`, `contact.created`, `contact.updated`, `contact.tag_*`, `contact.stage.changed`, `call.completed`.
- The inbound → AI path stays at least as reliable as today's direct BullMQ enqueue.
- Existing consumers keep working (the payload only gains `event_id`).
- The trigger consumer de-duplicates with `ProcessedEventsService`.

## 5. Engine (API) — `apps/api/src/modules/automation-engine/`

```
automation-engine/
  automation-engine.module.ts
  core/
    action-guard.service.ts              billing operational + metered limits (extracted from ActionExecutionService)
    channel-strategy-resolver.service.ts (moved as-is)
    scheduled-action.*                   agenda tasks (sequence coupling removed)
    agenda-scheduler.cron.ts             existing ActionSchedulerCron, tasks only
  workflows/
    entities/                            automation, version, trigger, schedule, run, run-step
    automations.service.ts               CRUD, draft, duplicate, publish, pause/resume
    automations.controller.ts
    graph/graph.types.ts, graph-validator.ts
    conditions/condition-evaluator.ts, audience-sql.compiler.ts
    variables/variable-context.builder.ts
    runtime/automation-runtime.service.ts
    runtime/run-scheduler.cron.ts        due runs, due schedules, stuck-run reaper
    runtime/automation-run.processor.ts  BullMQ worker + direct mode fallback
    triggers/automation-event.consumer.ts, enrollment.service.ts, schedule-trigger.service.ts
    nodes/recipients/recipient-resolver.ts  recipient modes + batched bulk sends
    nodes/node-executor.interface.ts, node-registry.ts, one file per node
    system/templates/*.ts                system automation definitions (code)
    system/automation-installer.service.ts
```

**Deleted in v1:**
- `automation-sequence.service.ts`, `automation-sequence.entity.ts`, `sequence-*.entity.ts`
- `outbound-message.consumer.ts`
- the sequence and n8n parts of `action-execution.service.ts` and the old `handlers/*`
- `context-builder.service.ts`, `follow-up.dto` parts for sequences
- `automated-appointment.service.ts`

**Correction found while implementing:** the agenda's one-off follow-ups (a person schedules "send a WhatsApp at 10:00" from the schedule page) also run through `ActionExecutionService` + `ActionExecutionProcessor`. That feature stays: the executor keeps running agenda items (without sequences or n8n). The BullMQ worker now also runs automation jobs (`automation-run`).

### 5.1 Graph model
- `graph = { nodes: [{ key, type, config, position }], edges: [{ source, sourceHandle, target }] }`.
- **Tree-shaped:** one parent per node, no loops, no merges.
- Handles: `next`; `yes` / `no`; `matched` / `timeout`; optional `failed` on action nodes.
- `graph-validator.ts` checks:
  - single root;
  - edges valid;
  - tree shape;
  - node config per type schema;
  - variables known for the trigger(s);
  - action availability (ICS only with appointment triggers; contact-based nodes only when the trigger provides a contact; Send to AI only when an AI connection exists).

### 5.2 Runtime

**Start.** Create the run `waiting` with `resume_at = now`, then enqueue job `run:{id}:{seq}`.

**Execute.** Claim:
```
UPDATE … SET status='running', seq=seq+1, locked_until=now()+5min
 WHERE id=$1 AND status='waiting' AND seq=$2
```
Then loop:
1. Insert `run_step(step_no)`.
2. Execute the node.
3. The node returns one of:
   - `next(handle)`
   - `wait_until(at)`
   - `wait_for(events, filters, timeout_at)`
   - `end(reason)`
   - `fail(error, retryable)`

Safety cap: 100 nodes per execution.

**Wait / finish.**
- Waiting sets `status='waiting'` plus `resume_at` and `waiting_for`.
- Finishing sets `completed / exited / failed` plus the reason.

**Retries.**
- Retryable failures: exponential `resume_at`, max 3 attempts.
- Otherwise the node's `failed` handle is followed if it is connected; if not, the run is `failed`.
- Provider rejections (e.g. Meta) are ordinary failures (D8).

**Side-effect idempotency.** Messages and emails carry `metadata.automation_step_id`; a retry checks for it before sending.

### 5.3 Scheduler (reuses the `ActionSchedulerCron` / `ActionExecutionProcessor` patterns)
- Every minute:
  - claim due runs and enqueue them;
  - claim due schedules and enqueue fan-out jobs.

  If Redis is unreachable, both run in direct mode (the current behaviour).
- Every 5 minutes: reaper for runs stuck in `running` past `locked_until` (back to `waiting`, counts an attempt).
- The agenda task tick is unchanged.

### 5.4 Trigger consumer
One `@EventPattern` per catalog topic. For each event:
1. `ensureInstalled(org)`: lazy installer check, cached per process (§9).
2. De-duplicate with `ProcessedEventsService.claim('automations:<topic>', event_id)`.
3. Normalise into a `TriggerEvent`.
4. **Exit rules:** matching active runs of the contact → `exited`.
5. **Wait-for-event:** matching waiting runs → resume on `matched`.
6. **Enrolment:** `automation_triggers` for (org, event) → filters → policy → start runs.

Global rule: contacts tagged `opt-out` are not enrolled into automations with `respect_opt_out = true` (default; booking automations set it to false).

### 5.5 Condition evaluator
- In-memory evaluator shared by trigger filters, if/else, wait-for-event filters and exit rules. `audience-sql.compiler.ts` compiles the same structure to SQL for the "contacts matching a filter" recipient mode (§5.7).
- Shape: OR of AND-groups; rule `{ field, operator, value }`.
- Fields:
  - `contact.*`: names, email, phone, tags, `lead_score`, `handled_by`, `assigned_to`, `custom.<key>`, stage, `created_at`, `last_contacted_at`, channels
  - `conversation.*`: channel, status, `ai_active`
  - `trigger.*`
- Operators: equals, not_equals, contains, not_contains, starts_with, is_empty, is_not_empty, gt, gte, lt, lte, in, not_in, has_tag, not_has_tag, matches_keywords, older_than_days, newer_than_days.
- Loose booleans as in `FunnelRulesService.matchesFields` (true / "true" / "yes").

### 5.6 Variables
- `renderTemplate` gains dotted placeholders: `{{contact.first_name}}`, `{{contact.custom.budget}}`, `{{organization.name}}`, `{{appointment.date}}`, `{{appointment.confirm_url}}`, `{{message.content}}`, `{{payment.amount}}`, …
- The old flat keys stay as aliases, so the catalog booking templates render unchanged.
- SMS / chat rule: a line whose variables all render empty is dropped (replaces the hard-coded SMS manage-link suffix).
- `GET /automations/catalog` lists the variables per trigger.

### 5.7 Node catalog

| Node | Reuses | Notes |
|---|---|---|
| Send message | `ChannelStrategyResolverService`, `ConversationManagementService.sendMessage` | Text with variables + channel strategy. When the resolver picks `email`, it goes through the email sender (fixes the silent loss). No window restriction (D8) |
| Send email | `MailService`, `EmailTemplate` / `renderEmail`, `notifications/ics.ts` | Config = `EmailTemplate` (subject, heading, greeting, paragraphs, details, button, links, notes). Options: appointment details block; calendar invite (request/cancel) |
| Send SMS | `SmsService` | |
| Send to AI agent | `AgentTriggerProcessor` | Job carries `agent_id` (default: the org's AI connection) and `automation_run_id`; same payload as today. BullMQ jobId = `ai:<run_id>:<step_no>` (a retry of the same step never calls the AI twice; different automations are independent, D16) |
| Notify team | `RealtimeBroadcastService.notifyOrg` + owners/admins email pattern (`payments.service.ts`) | In-app and/or email to roles |
| Create task | `ScheduledActionService.create` | Option "wait until done" (the task's `run_id` resumes the run) |
| Call | `ProsalesClientService.startOutboundCall` | Falls back to a message without phone / voice channel (current `CallHandler` behaviour) |
| Add tag / Remove tag | `ClientManagementService` | Emits the tag events |
| Update contact field | `ClientManagementService.update` | Standard + `custom.<key>` |
| Move funnel stage | `moveStageIfUnchanged` | |
| Turn AI on/off for conversation | new explicit `bot_active` setter next to `handoff()` | |
| Wait | timezone helpers, follow-up calendar hours | Duration, or "until business hours" (follow-up calendar `work_days` / `start_time` / `end_time` / timezone) |
| Wait for event | trigger consumer | Events + filters + timeout → `matched` / `timeout` |
| If / else | condition evaluator | `yes` / `no` |
| End | — | |

**Recipients (Send message / Send email / Send SMS).** Each messaging node has a recipient mode:

| Mode | Available in | Behaviour |
|---|---|---|
| The run's contact (default) | contact runs | Current behaviour |
| Contacts matching a filter | contact and organisation runs | Condition group compiled to SQL (`audience-sql.compiler.ts`); one message per matching contact, personalised with that contact's variables; the editor shows the live match count |
| Specific contacts | both | Picked in the editor |
| Team members | both | Roles or specific users (email/SMS to users) |
| Custom address | both | A phone number or email typed in the editor (variables allowed) |

- Bulk sends (filter mode) are processed in batches of 200. Progress is stored in the run step (`output.cursor`), so a long send resumes where it stopped after a restart.
- Each recipient is sent once per step: the message metadata holds `automation_step_id` + `contact_id`, and that pair is checked before sending.
- Per-step cap: 5,000 recipients by default (platform config). The editor warns above the cap.
- `respect_opt_out` applies to every recipient in filter / specific modes.

Every action goes through `action-guard.service.ts`: the current `isOperational` + `checkLimit` logic with the same metered mapping.

### 5.8 Settings (per version)
- `reentry`: `never | after_finish` (default `after_finish`)
- `exit_on`: list of `{ event, filters }`
- `respect_opt_out` (default true)
- `send_window`: `anytime | business_hours`

### 5.9 AI routing (D2, D3, D12)
- **Deleted:** the direct AI enqueues in `conversation-management.service.ts` (inbound), `payments.service.ts` (`triggerAgent`) and `voice/calls.service.ts` (call ended/analyzed).
- **Also deleted:** the hard-coded inbound logic in `conversation-management.service.ts` (`isOptOutMessage`, sequence reset/cancel). It is replaced by system automations.
- **`AgentTriggerProcessor`:** uses the job's `agent_id`. `findAgentsForEvent` and the payment fallback are deleted. Billing checks and the payload builder stay; the `n8nPayload` naming goes.
- **`ai_agents.agents`** rows become **AI connections**. `trigger_event` is no longer read; the column is dropped later (backlog).
- **`ProsalesClientService.provisionAgent`** keeps creating/updating the connection, then calls the installer so the AI automations point to it.

### 5.10 System automations (installer)
Templates live in code. The installer is idempotent (unique `template_key`) and versioned (`settings.automations_installed`). It runs:
- lazily before the first event of an org;
- in the post-deploy backfill;
- on org creation;
- on AI provisioning.

| template_key | Trigger | Graph | Initial status |
|---|---|---|---|
| `ai_incoming_message` | `message.received` (all channels) | AI active on conversation? → yes: Send to AI agent | Active iff the org has an active `message.received` agent today |
| `ai_payment_update` | `payment.completed`; `payment.expired` with `payment_status = expired` (a *failed* payment is published on the same topic but never reached the AI — golden `ai-agent-requests.json`) | Send to AI agent (`event_type` payment.received / payment.expired) | Active iff the org has an active agent for `payment.received`/`payment.expired`, or for `message.received` (legacy fallback) |
| `ai_call_completed` | `call.completed` | Send to AI agent | Active **only** iff the org has an active agent registered for `call.completed`. ProSales provisioning never creates one, so for almost every org this starts **paused**: today calls don't reach the AI (golden `ai-agent-requests.json`) |
| `booking_confirmation_request` | `appointment.confirmation_requested` | Has email? → email (variant via if/else on `trigger.reminder` / `trigger.rescheduled`) : SMS with confirm link | Active |
| `booking_confirmed` | `appointment.confirmed` | Email + ICS request if email; SMS if phone | Active |
| `booking_rescheduled` | `appointment.rescheduled` | Status = scheduled → end; else email + ICS request; SMS | Active |
| `booking_cancelled` | `appointment.cancelled` | Email + ICS cancel; SMS | Active |
| `booking_reminder` | `appointment.reminder_due` | Confirm link present → confirmation-reminder email/SMS; else reminder email, SMS only if no email | Active |
| `opt_out_keywords` | `message.received`, `matches_keywords` (current regex list as default keywords) | Add tag `opt-out`; `exit_on` opt-out ends every other run | Active |
| `no_response_follow_up` | `message.sent`, `sender_type in (ai, agent)`, chat channels | Wait 2h → step 1 → wait (delay, business hours) → step 2 … converted from the org's effective `no_response` template; `exit_on`: contact replied, appointment created | Active iff `sequences_enabled !== false` |

Notes:
- **AI connection picked by the installer:** the active `message.received` row named `ProSales`, else the most recently updated active `message.received` row. Other rows (custom/n8n workflow endpoints) are no longer called (D6). The golden file records that legacy routing called *every* active row for an event.
- The booking automations reproduce `AppointmentEmailConsumer` rule by rule. Its spec is ported to automation-level tests, then the consumer is deleted.
- Org-customised sequence templates become **paused** custom automations (manual trigger), so no configuration is lost.

### 5.11 API endpoints (under `/automations`)

| Method | Path | Purpose |
|---|---|---|
| GET | `/automations` | List with counters |
| POST | `/automations` | Create blank or from a template |
| GET / PATCH / DELETE | `/automations/:id` | Read, rename, delete (not system) |
| PUT | `/automations/:id/draft` | Save draft |
| POST | `/automations/:id/validate` | Validation errors |
| POST | `/automations/:id/publish` | Publish |
| POST | `/automations/:id/pause` / `resume` | Pause / resume |
| POST | `/automations/:id/duplicate` | Duplicate |
| GET | `/automations/:id/versions` | List versions |
| GET | `/automations/:id/runs` | Runs |
| GET | `/automation-runs/:id` | Run + steps |
| POST | `/automation-runs/:id/cancel` | Cancel a run |
| POST | `/automations/:id/enroll` | Manual trigger |
| POST | `/automations/audience/preview` | Count of contacts matching a recipient filter |
| GET | `/contacts/:id/automation-runs` | Runs for the contact card |
| GET | `/automations/catalog` | Triggers, nodes, operators, variables + org data for pickers |

- Writes: owner/admin only (D11). Reads: every org member.
- No plan gating (D10). The existing `@RequiresPlanFeature(AUTOMATION)` on sequences disappears with the endpoint.
- `/automation/follow-ups*` (agenda) is unchanged. `/automation/sequences*` is deleted.

## 6. n8n removal and demo generator (D6)

| Change | Where |
|---|---|
| Delete the n8n hand-off, the `follow_up.due` event and the n8n payload builder | old `send-message.handler.ts`, `context-builder.service.ts`, `WebhookEventType.FOLLOW_UP_DUE`, web `WebhookEditor.tsx` |
| Delete the `complete_follow_up` and `create_follow_up_sequence` tools + schemas | `tool-execution.service.ts` |
| Delete the "ProSales vs n8n" routing switch | web `MessageRoutingSection.tsx` |
| Rewrite the n8n instructions (API usage for integrators, no n8n) | web `ApiDocsSection.tsx` |
| Remove n8n naming/comments | `agent-trigger.processor.ts`, `payments.service.ts`, `client-management.*`, `funnel-automation.consumer.ts`, `platform-analytics/organization-insights.ts`, `.env.example` |
| **Demo generator:** rename `callN8nWebhook` → `requestDemoGeneration`; env `DEMO_GENERATOR_URL` (read `N8N_DEMO_WEBHOOK_URL` as a deprecated fallback for one release); sign the request with `DEMO_WEBHOOK_SECRET` (HMAC header, same scheme as `WebhookDispatcherService`); document it in `.env.example`. The callback `/webhooks/demo-ready` contract is unchanged, so any service can generate demos | `demo.service.ts`, `configuration.ts`, `.env.example` |

## 7. Web (`apps/web`)

### 7.1 Dependency
- `@xyflow/react` (React Flow v12, MIT, React 19). Tree layout computed in-house.

### 7.2 Routes and navigation
- `/config/automations`: list. Groups are System (AI, Booking, Follow-up) and Custom. Each row shows a status toggle, counters and trigger summary (event name or "Every Monday 09:00"). "New automation" opens a template gallery (Blank, Welcome message, Keyword reply, Weekly SMS to a segment, No-response follow-up). Every org member with owner/admin role can create and build automations (D14).
- `/config/automations/[id]`: builder.
- `/config/automations/[id]/runs`: runs.
- Sidebar "Automation → Follow-up sequences" becomes "Automations"; header mapping updated.
- `/config/sequences` is deleted and redirects.

### 7.3 Builder
- **Top bar:** name, status, Save draft, Validate, Publish, Pause/Resume, version, unsaved-changes guard.
- **Canvas (React Flow):**
  - trigger card at the top (several triggers allowed);
  - vertical auto-layout;
  - "+" on every edge opens the node picker;
  - labelled branch handles (Yes/No, Replied/Timed out, Failed);
  - delete node / branch with confirmation;
  - pan, zoom, fit, mini-map.
- **Right panel**, driven by `/automations/catalog`:
  - **Trigger panel:** event + filters, or schedule (frequency, time, days, timezone).
  - **Recipient picker** in messaging nodes: run's contact / contacts matching a filter (live "N contacts match") / specific contacts / team / custom address.
  - **Node panels:** one per type.
  - Variable picker + preview with a sample contact.
  - Condition builder.
  - Email editor bound to `EmailTemplate`, with preview rendered by the API.
  - Channel strategy select (existing labels and hints).
  - Wait and wait-for-event editors.
  - Settings panel (re-entry, exit on, opt-out, send window).
- **Validation:** node badges + error bar; Publish is disabled while there are errors.
- **System automations** show a banner (pausing `ai_incoming_message` shows "the AI will stop answering all channels").
- **Read-only for non-admins** (D11).

### 7.4 Other screens
- **Runs:** table + drawer with the step timeline.
- **Contact page / inbox sidebar:** `FollowUpCard` is replaced by `AutomationsCard` (all active runs, cancel, "Add to automation").
- **Appointment drawer:** "Start automatic sequence" becomes "Add to automation" (manual-trigger automations).
- **Agents page:** routing section deleted; the AI connection card links to the AI automations.

### 7.5 Reused / deleted
- **Reused:** UI kit, `sequence-constants.ts` content (icons, channel strategies, `formatDelay` → `components/automations/constants.ts`), react-query conventions, msw + fixtures.
- **Deleted:** `config/sequences/*`, `components/sequences/*`, `useSequenceTemplates.ts`, the sequence parts of `automation.service.ts` / `useAutomation.ts`, `FollowUpCard.tsx`, `MessageRoutingSection.tsx`, the sequences toggle (`useUpdateSequenceSettings`, `PATCH /organizations/me/sequences`).

### 7.6 New files
- `services/automations.service.ts`, `hooks/useAutomations.ts`
- `components/automations/builder/`: `AutomationCanvas`, `nodes/*`, `NodePicker`, `panels/*`, `ConditionBuilder`, `ScheduleEditor`, `VariablePicker`, `EmailTemplateEditor`, `ValidationBar`, `layout.ts`, `graph-ops.ts`
- `components/automations/AutomationsCard.tsx`, `RunTimeline.tsx`, `TemplateGallery.tsx`

## 8. Shared package
- `types/automation-builder.types.ts`: statuses, node types and configs, `Graph`, `TriggerDefinition` (event / schedule / manual), `ScheduleSpec`, `ConditionGroup`, `AutomationSettings`, run types, DTOs.
- `automation/trigger-catalog.ts`, `automation/node-catalog.ts`.
- Sequence types (`SequenceType`, `CreateSequenceInput`, `FIRST_FOLLOW_UP_DELAY_HOURS`, …) and `CreateAutomatedAppointmentInput` are deleted. `ActionType` stays for the agenda.

## 9. Cutover (global, single release — D9)
1. **Staging first.**
   - Run the migration and the installer backfill on a copy of production data.
   - Compare, per org, the installed automations with the current config (AI active, sequences on/off, custom templates).
   - Run the parity tests.
2. **Deploy.** Migration 058 runs at boot: new tables, new columns, active legacy sequences and their open steps cancelled. The new code has no legacy paths.
3. **Install.**
   - Every event first calls `ensureInstalled(org)` (lazy, cached), so no org can receive an event before its system automations exist.
   - The backfill is an endpoint, not a script: a platform admin calls `POST /api/v1/automations/install-all` right after deploy. It installs every org (idempotent). The lazy check is only a safety net.
4. **Rollback.** Redeploy the previous version. The legacy tables still exist; the cancelled sequences stay cancelled (accepted by D9).
5. **Next release:** migration `059_drop_legacy_sequences` drops the legacy tables, `scheduled_actions.sequence_id` and the old follow-up columns of appointments (backlog A). It refuses to run until every organization with something to convert has been installed.

## 10. Bugs fixed by v1
- `send_message` resolved to `email` silently lost → handled by the Send message node.
- Double advance and self-re-arming follow-up loop → the legacy engine is deleted; `message.sent` triggers exclude `sender_type = automation`.
- First step delay ignored → explicit wait nodes.
- `findActive` single-run ambiguity and inconsistent exits (only AI bookings) → per-automation runs + `exit_on` (any booking).
- Contacts created from channels and tag changes emit nothing → new events.
- Lossy conversation/contact events → outbox.

## 11. Work breakdown (order; each step reviewable on its own)

| Step | Content | Main files |
|---|---|---|
| 1 ✅ | Golden files recording current behaviour: `booking-messages.json` (30 scenarios), `ai-agent-jobs.json` (event → AI job, 11 scenarios), `ai-agent-requests.json` (HTTP request + routing to the AI, 11 scenarios) in `apps/api/src/test-support/golden/` | specs in conversation-management, payments, voice, notifications |
| 2 ✅ | Event layer: catalog, outbox for trigger events, new events, `sender_type` | shared catalog, `conversation-management.service.ts`, `client-management.service.ts`, `calls.service.ts`, `rabbitmq.constants.ts` |
| 3 ✅ | Schema + entities + migration (including the legacy cancellation). Added `automation_deliveries` (one row per step and recipient, written before sending) | `058_automations.sql`, `1794100000000-Automations.ts`, `workflows/entities/*` |
| 4 ✅ | Engine core: graph, validator, conditions, audience compiler, variables, runtime, scheduler (runs + schedules), processor, trigger consumer, enrolment, exit, wait-for-event, organisation runs | `workflows/*`, `template.ts` |
| 5 ✅ | Nodes + `action-guard` (logic moved from the old handlers) | `workflows/nodes/*`, `core/*` |
| 6 ✅ | AI routing: `agent_id` jobs, delete the direct enqueues and the hard-coded inbound logic | `agent-trigger.processor.ts`, `conversation-management`, `payments`, `voice` |
| 7 ✅ | System templates + installer + hooks + backfill script + template conversion | `workflows/system/*`, `organizations.service.ts`, `prosales-client.service.ts`, `apps/api/scripts/` |
| 8 ✅ | Controllers, catalog, audience preview, permissions, Swagger | `workflows/automations.controller.ts` |
| 9 ✅ | Delete the legacy engine, `AppointmentEmailConsumer`, sequence endpoints/types | §5 deleted list, `notifications/appointment-email.consumer.ts` |
| 10 ✅ | Web: list, builder, panels, schedule editor, runs, contact card, drawer, nav, deletions | §7 |
| 11 ✅ | n8n removal + demo generator | §6 |
| 12 | Staging rehearsal + backfill + release notes | §9 |

## 12. Verification
- **API unit (Jest):** condition evaluator; audience SQL compiler (snapshot of generated SQL + parameters); next-occurrence calculation (DST, month ends, weekly sets); renderer; graph validator; runtime transitions; enrolment policy; installer idempotency and conversion; every node with mocked services; two automations reacting to the same event both execute (no cross-automation de-duplication); recipient modes; bulk send resume after a restart with no duplicate per recipient.
- **API DB integration (`TEST_DATABASE_URL`):**
  - claim races;
  - one active run per contact;
  - exit + re-enrol on one event;
  - wait-for-event vs timeout race;
  - no double send on retry;
  - schedule claim on two instances creates exactly one organisation run;
  - a bulk "contacts matching a filter" send over 1,200 contacts honours the cap and the filter;
  - the migration cancels legacy sequences and their steps.
- **Parity:** booking automations vs `appointment-email.consumer.spec.ts` expectations; AI job payload for inbound / payment / call identical to today.
- **Web (Vitest + msw):** graph operations, layout, panels, schedule editor, validation, list, runs, contact card, read-only mode.
- **Manual e2e (seeded org):**
  - WhatsApp inbound → AI reply;
  - pause the AI automation → AI silent on every channel;
  - booking → confirmation email with invite;
  - no reply → follow-up, reply → exit;
  - weekly schedule → one organisation run → every contact with tag X gets one SMS at the set time;
  - a keyword auto-reply automation and the AI automation both react to the same incoming message.

## 13. Answers received
Round 1:
1. The incoming-message automation is one, for all channels (D3).
2. No 24h restriction; agents can answer any time (D8).
3. Remove both n8n tools.
4. Cancel legacy sequences and remove the engine (D9).
5. Automations run on any event, and can also run on a schedule without an event; no plan gating (D10).
6. Owner/admin edit, everyone views (D11).
7. Human takeover stays an editable condition (D12).
8. Demo creation becomes a generic demo-generator endpoint (§6).
9. Platform notifications stay hard-coded (D13).

Round 2:
1. Every org can create and build automations, with any trigger (D14).
2. A scheduled automation runs once for the whole organisation; automations are independent of each other (D15, D16).

Round 3 (confirmed readings of round 2):
- (a) "Every Monday 09:00 → Send SMS to contacts tagged `vip`": one run, one SMS per matching contact.
- (b) 10 automations that each send an SMS on the same event: 10 SMS.
- (c) 2 active automations that both "Send to AI" on the same incoming message: the AI receives it twice. The builder warns when more than one active automation sends incoming messages to the AI; the org decides.

## 14. Open questions
None.

## 15. Changes made while implementing (read before reviewing)
- **No React Flow.** Installing web dependencies needs a lockfile change, and the lockfile pins `typescript-eslint@8.73.0`, which is not on the registry. The canvas is in-house instead (`builder/AutomationCanvas.tsx`: SVG edges, pan, zoom, fit, a "+" on every path, labelled branches). v1 graphs are trees, so the in-house tree layout is enough. React Flow stays an option for free-form graphs (backlog D).
- **Runs are a tab in the builder**, not a separate `/config/automations/[id]/runs` route. The same run drawer is used from the inbox contact sidebar.
- **Adding contacts and stopping runs are open to every member** (`POST /automations/:id/enroll`, `POST /automations/runs/:id/cancel`), and to API keys. Before, agents could start and cancel sequences from the agenda, so this keeps that. Building, publishing, pausing and deleting stay owner/admin (D11).
- **Agenda executor kept.** See the correction note in §5.
- **Agents page:** the routing section is replaced by a card that says whether the incoming-message AI automation is on, with a link to it. The web no longer calls `/ai/agents` (the automation-agents service and hook were deleted). The API endpoints stay.
- **`AgentTriggerProcessor`:** when a job has no `agent_id` (jobs queued before the deploy), it falls back to the org's default AI connection. Remove the fallback after the first deploy (backlog A).
- **Contact created from a channel** now emits `contact.created` with `source`. The outgoing `contact.created` webhook is still only sent for contacts created in the CRM/API (backlog I).
- **Baseline build fix:** `apps/api/src/metadata.ts` (Swagger plugin output) was stale and broke `nest build`. It is regenerated by deleting it and building.
- **Double AI warning (§13 round 3 c):** the list API returns `sends_to_ai`; the builder shows a warning when this automation and another active one both send incoming messages to the AI.
- **Web bug fixed while testing:** list values in conditions ("is any of", keywords) lost the comma while typing. The input now keeps the raw text.

### Verification done
- API: 68 suites / 979 tests (including Postgres suites and the golden parity files: 30/30 booking messages byte-identical, 11/11 AI jobs), `tsc`, `eslint`, `nest build`, schema drift check (52 entities).
- Web: 73 files / 566 tests (vitest + msw), `tsc`, `next lint`, `next build` (with Google Fonts mocked, there is no network here).
