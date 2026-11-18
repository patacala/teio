# Automations — backlog (pending after v1)

Memory of everything found during the investigation and left out of v1.
Source plan: `automations-v1-plan.md`. Update this file when items are done, re-scoped or decided.

## Decided (do not reopen without the product owner)
- Platform notifications stay hard-coded: in-app alerts for new message, new contact, new appointment, call started, payment needs review / pending payment.
- No messaging-window restriction (Meta 24h). Sends are always attempted; provider rejections are ordinary step failures.
- One single incoming-message → AI automation for all channels (no per-channel AI automations).
- No plan gating for automations.
- Every org can create and build automations with any trigger (custom automations may also use `message.received`).
- A scheduled automation runs once for the whole organisation; its actions choose recipients.
- Automations are independent: no de-duplication across automations (10 automations sending an SMS = 10 SMS).
- n8n is not an automation engine for the product. Demo generation talks to a generic demo-generator endpoint.
- Adding a contact to an automation and stopping a run are open to every member and to API keys; building/publishing stays owner/admin.

## A. Cleanup right after the v1 cutover (next release)
Done in `059_drop_legacy_sequences.sql` / `1794200000000-DropLegacySequences.ts` (ship it in the release AFTER v1, once `install-all` has run):
- [x] Drop `sequence_templates`, `sequence_template_steps`, `automation_sequences`, `sequence_steps`, `scheduled_actions.sequence_id`, `settings.sequences_enabled`. The migration refuses to run while an organization with its own templates (or follow-ups turned off) has no automations installed.
- [x] Drop the follow-up columns left on `scheduling.appointments` (052) and the unused reminder flags; overlap constraint / unconfirmed index rebuilt without `action`; status/origin checks no longer accept step values (NOT VALID).
- [x] Installer: legacy template conversion and `sequences_enabled` removed; the follow-up cadence is a fixed default (`FOLLOW_UP_TOUCHES`).
- [x] Legacy follow-up-step filters removed (trigger normalizer, funnel consumer).
- [x] `N8N_DEMO_WEBHOOK_URL` fallback removed.
- [x] `AgentTriggerProcessor` fallback removed: `agent_id` is required; jobs without it are dropped with a warning.
- [x] `/config/sequences` redirect page deleted; `reset-org-data.cjs` updated.

Still open:
- [ ] Drop `ai_agents.agents.trigger_event` (the installer and ProSales provisioning still use it to pick the AI connections).
- [ ] Decide whether `/ai/agents` (AI connections) needs a UI again; the web no longer calls it.
- [ ] Rename the `sequence.exhausted` event (kept because organizations' "Lead lost" funnel rules are stored with that name: needs a data migration of `clients.funnel_rules`), or replace the rule with a "Move funnel stage" step at the end of the follow-up automation.

## B. Notifications (team-facing, platform level)
- [ ] Persistent notification centre. Today notifications are broadcast-only and kept in client memory: lost on refresh, never delivered to offline users.
- [ ] Per-user targeting (assigned user, role, specific users), plus email/SMS/push to team members.

## C. Triggers not in v1
- [ ] Date-relative waits and triggers ("X hours before appointment", "N days after a date field", birthdays). Appointment reminders still use `scheduling.appointment_reminders` + per-calendar offsets.
- [ ] Event-based inactivity ("no reply in X days" as a live trigger). A scheduled audience with `last_contacted_at older than N days` covers part of it in v1.
- [ ] "For each contact" scheduled mode: a schedule that starts one *contact run* per matching contact, so per-contact steps (tags, waits for a reply, AI) can be used. v1 only has organisation runs with bulk recipients.
- [ ] Contact field changed (needs field-level change events).
- [ ] Message delivered / read / failed (no delivery status events exist; WAHA/Meta status webhooks not ingested).
- [ ] Form / booking-link submitted, AI hand-over to human, follow-up task completed.
- [ ] Bulk enrolment from the contact list UI (the API `enroll` endpoint accepts several ids).
- [ ] Organisation-run conditions on aggregate data (e.g. "if more than N unpaid payments").
- [ ] Instagram/Facebook comment and keyword triggers (ManyChat-style).

## D. Builder capabilities not in v1
- [ ] Merges, "go to" steps and loops (v1 graphs are trees).
- [ ] A/B / random / percentage split.
- [ ] Several concurrent runs per contact in the same automation.
- [ ] HTTP request node (SSRF protection, secrets) and "send outgoing webhook" node.
- [ ] Enrol into / stop other automations nodes; AI tool `enroll_in_automation`.
- [ ] Assign conversation/contact to a user, round robin (conversation assignment doesn't exist today; `contact.assigned_to` has no logic).
- [ ] Test mode / dry run with a sample contact.
- [ ] Version history UI with diff and rollback.
- [ ] Folders, search, import/export, template gallery / snapshots shared between orgs.
- [ ] Analytics: goal conversion, drop-off per step, messages per automation.
- [ ] Free positioning, notes on canvas. If graphs stop being trees (merges, loops), move the canvas to React Flow (`@xyflow/react`); v1 uses an in-house tree canvas because web dependencies could not be added (lockfile pins an unpublished `typescript-eslint@8.73.0`).

## E. Content and language
- [ ] i18n: org locale, translated defaults, per-language keyword lists (opt-out keywords and lead-score tables are ES/EN today).
- [ ] Org-editable platform emails outside automations (welcome, password reset stay platform-level).
- [ ] Rich message content: media, buttons/quick replies, WhatsApp templates.
- [ ] Conditional template blocks (`{{#if}}`) beyond "drop empty lines".
- [ ] Quick replies (`message_templates`): variables stored but never substituted; reuse the automation renderer in the inbox.

## F. Channels and delivery
- [ ] WhatsApp Cloud API + approved templates (WAHA carries ban risk at automated volume); throttling and per-contact frequency caps; quiet hours per contact.
- [ ] Email as a real conversation channel (threaded email in the inbox).
- [ ] Count automated emails in billing usage (limit is checked but never incremented).

## G. CRM data for pickers/conditions
- [ ] Custom field definitions per org (type, label, options); `custom_fields` is schemaless.
- [ ] Tag catalogue per org.
- [ ] Move `FunnelRulesService` to the shared condition evaluator; expose funnel rules in the UI or replace them with automations.
- [ ] Configurable lead-score rules (`applyLeadScoreSignals` is hard-coded).

## H. Platform / AI
- [ ] ProSales outcome reporting (`PaymentEventConsumer`, `OutcomeFeedbackConsumer`) stays platform logic; revisit only if orgs need control.

## I. Smaller issues found during the investigation
- [ ] `ScheduledActionService.markFailed` retries without backoff.
- [ ] Three event vocabularies (RMQ topics, webhook names, analytics names). Align outgoing webhook names with the trigger catalog.
- [ ] `CONVERSATION_ASSIGN` emitted but only tracked in analytics.
- [ ] Outgoing `contact.created` webhook is not sent for contacts created from a channel (the automation trigger does fire).
- [ ] Dead web components from before v1: `app/(dashboard)/contacts/[id]/_components/*` (the route redirects to the inbox) and `components/inbox/contact-profile-panel.tsx` are not imported anywhere.
- [ ] Fix the lockfile pin `typescript-eslint@8.73.0` (not on the registry), so `pnpm install --frozen-lockfile` works again.
