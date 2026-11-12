# Funnel investigation 01 — Current state (rules, history, rotting)

Status: investigation only, no code changed. Follow-up: `funnel-investigation-02-impact-and-stages.md`.
Original design plan this builds on: `serialized-riding-hopper.md` (phases 1–4).

Scope, as asked:
1. `FunnelRuleEntity` moves contacts on events, but this is invisible in the UI.
2. There is no usable movement history per contact (manual vs automated).
3. "Rating dates" = `rotting_days`: intended to measure time-in-stage / stuck contacts.

---

## How the funnel works today

```
domain event (RabbitMQ, queue crm_main)
  -> FunnelAutomationConsumer            client-management/funnel-automation.consumer.ts
  -> FunnelRulesService.evaluate()       client-management/funnel-rules.service.ts
       1. contact.lead_stage -> current stage (skip if none)
       2. skip if current.is_terminal (won/lost)
       3. skip if last history row is source='manual' and < 24h old (anti-override)
       4. active rules for the event (org-specific + system NULL-org), priority DESC
       5. filter: funnel_id, from_stage_types, conditions (custom_fields only)
       6. resolve to_stage_type -> a real stage in the contact's funnel
       7. forward_only: skip if target.position <= current.position
       8. ClientManagementService.updateStage(..., 'automation', rule.name); first match wins
  -> updateStage()                       client-management.service.ts:647
       saves contacts.lead_stage, inserts contact_funnel_history (fire-and-forget),
       emits contact.stage.changed, dispatches webhook funnel.stage.changed
```

Events consumed: `message.received` (inbound only), `contact.data.captured`,
`appointment.created` (origin human/ai only), `appointment.confirmed`,
`appointment.completed`, `appointment.no_show`, `sequence.exhausted`.

Seeded system rules (038 + 040):

| Rule | Trigger | From | To |
|---|---|---|---|
| Lead contacted | message.received | new | contacted |
| Qualified (BANT) | contact.data.captured + 4 custom_fields | new, contacted | qualified |
| Appointment scheduled | appointment.created | any | appointment_scheduled |
| Appointment confirmed | appointment.confirmed | any | appointment_confirmed |
| Deal won | appointment.completed | appointment_confirmed | won |
| Lead lost | sequence.exhausted | any | lost |

---

## 1. Funnel rules — invisible in the UI

- No API: `FunnelsController` has no rules endpoints; `FunnelsModule` does not even register
  `FunnelRuleEntity` (only `ClientManagementModule` does).
- Rules exist only as migration seeds (038, 040). Org-scoped rules are supported by the schema
  but cannot be created by anyone.
- The only UI trace is the "Stage type" select in `config/funnel/_components/StageListView.tsx`.
  Nothing shows which rule targets which stage.
- Silently inert rules, with no way to notice:
  - `appointment.no_show` is consumed but no rule uses it.
  - "Deal won" is dead if the funnel has no `won` stage type.
  - Generic / Agency / Real Estate templates have no `appointment_*` stages, so the appointment
    rules never fire for them.
- Tests: `apps/api/test/funnel-flow.integration.js` re-implements the logic in JS against the live
  DB. `FunnelRulesService` has no unit test.

## 2. Movement history — recorded, not exposed

The table is right: `contact_funnel_history` has `from_stage_id`, `to_stage_id`, `changed_by`,
`source` ('manual' | 'automation'), `reason` (rule name). Automation writes both correctly.

Where it breaks:
- `getActivity()` fetches `source`/`reason` (raw `h.*`) but drops them when mapping
  `funnel_change` events (`client-management.service.ts:550-557`).
- Actor label is inferred: `actor_name ?? (changed_by ? 'Agent' : 'System')` (line 555).
- `components/inbox/funnel-stage-event.tsx` already renders a `reason` prop that the API never sends.
- No dedicated history view. Stage changes are only mixed into the activity timeline (paginated
  by message window). The stage mutation (`useUpdateContactStage`) does not invalidate `contact-activity`.

Gaps that make the data incomplete or misleading:
1. Initial placement writes no history: `create`, `findOrCreateByChannel`, `findOrCreatePhoneContact`.
2. `PATCH /contacts/:id` accepts `lead_stage` and `Object.assign`s it (line 323), bypassing
   history/events. DTOs are TS interfaces, so the global `ValidationPipe` whitelist cannot strip it.
   The n8n `update_contact` tool passes its raw input through the same path
   (`ai-automation/tool-execution.service.ts:64`).
3. API-key requests get `user_id = apiKey.created_by` (`tenant-context.middleware.ts:202`), so an
   n8n call to `PATCH /contacts/:id/stage` is logged as a manual move by that user and arms the
   24h guard. The API docs (`ApiDocsSection.tsx:121`) tell integrators to use exactly that endpoint.
4. History insert is `void` (fire-and-forget, line 668): a failed insert loses the record, and it
   can race with the 24h guard read.
5. Stage FKs are `ON DELETE SET NULL`, so deleted stages render as "Unknown".
6. `contact.stage.changed` and the `funnel.stage.changed` webhook carry no `source`/`reason`.
7. History has no `organization_id` and no `rule_id` (reason is free text; renaming a rule rewrites meaning).

## 3. Rotting days — stored, never used

- Column exists on `funnel_stages` and `funnel_template_stages` (037). Accepted by the create/update
  stage DTOs. Typed on the frontend (`FunnelStage.rotting_days`).
- Nothing reads it: no cron, no query, no badge. No input in the UI. Every template seeds NULL.
  Phase 4 of `serialized-riding-hopper.md` ("daily job comparing time since last stage change vs
  rotting_days") was never built (comment at `client-management.service.ts:626`).
- No "entered stage at" on the contact. Deriving it from history fails for contacts whose only
  placement was the initial auto-placement (gap 1), for `PATCH` bypasses (gap 2), and for data
  older than migration 018. Fallback would be `contacts.created_at`. `updated_at` is useless (any edit bumps it).
- Infrastructure already available: `@nestjs/schedule` (`automation-engine/action-scheduler.cron.ts`)
  and a `reactivation` sequence template (030).

---

## Other issues found

| # | Issue | Where |
|---|---|---|
| 1 | Target lookup drops the funnel filter when `current.funnel_id` is NULL (`?? undefined`), with no org filter, so it can resolve another org's stage | `funnel-rules.service.ts:78` |
| 2 | `updateStage` does not validate the stage belongs to the org / contact's funnel | `client-management.service.ts:664` |
| 3 | `contacts.lead_stage` is `VARCHAR(100)` with no FK. Deleting a stage orphans contacts: they disappear from Kanban and automation skips them | migration 014, `funnel-rules.service.ts:44` |
| 4 | Default placement uses the oldest funnel; inbox `LeadStageSelector` and config page default to the newest (`getFunnels` orders DESC); `FunnelStageCard` lists stages of all funnels mixed | `resolveDefaultStage`, `lead-stage-selector.tsx`, `FunnelStageCard.tsx` |
| 5 | Kanban column count = loaded items, capped at 50 | `KanbanColumn.tsx` |
| 6 | Kanban card reads `contact.last_activity`, which the API never returns (entity has `last_contacted_at`) | `KanbanContactCard.tsx` |
| 7 | Automated moves are not broadcast in realtime; the board only updates on refetch | `updateStage` |

---

## Open decisions

1. Rules UI: read-only visibility first, or full CRUD with per-org overrides?
2. History: dedicated stage-history component, or enrich existing timeline events with a source
   badge and reason? Also fix initial placement and the `PATCH` bypass?
3. n8n / API moves: add a third `source` value (e.g. `'api'`) so they don't arm the manual guard?
4. Rotting: denormalized `contacts.stage_entered_at`, or derive from history (requires gaps 1–4
   fixed first)? Action on rot: badge only, or notify / start a `reactivation` sequence?
