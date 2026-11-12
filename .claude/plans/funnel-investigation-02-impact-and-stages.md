# Funnel investigation 02 — Application impact + more granular stages

Status: investigation only, no code changed. Builds on `funnel-investigation-01-current-state.md`.

> **Superseded in part by `funnel-investigation-03-decisions-and-ui.md`.** Product decisions taken
> after this document: post-sale is out of scope (goal = qualify → schedule → advance payment), so
> the post-sale stages in §B.2 and step 7 of §C are dropped; `needs_human` is not a stage; companies
> build their own rules on top of system defaults. The revised stage vocabulary is in 03 §1.1.

Questions:
- A. How will evolving the funnel (rules UI, history, rotting, new stages) modify the application?
- B. Which additional stages would make the funnel more granular and more valuable to companies?

---

## 0. New problems found in this pass (fix before adding stages)

| # | Problem | Evidence | Severity |
|---|---|---|---|
| 1 | **Any exhausted sequence marks the contact Lost.** All sequence types (`no_response`, `reactivation`, `post_service`, `appointment_reminder`, `manual`) end through `advanceOrComplete()`, which emits `sequence.exhausted` with `sequence_type`. The consumer ignores `sequence_type`, and rule `conditions` can only read `custom_fields`, so "Lead lost" (from any stage, forward_only) fires. Example: contact in *Appointment Confirmed* whose 2-step `appointment_reminder` finishes → moved to *Lost* (Lost is after it). | `automation-sequence.service.ts:516-531`, `action-execution.service.ts:145`, `funnel-automation.consumer.ts:72`, `038_funnel_rules.sql` | High |
| 2 | **Two stages with the same `stage_type` in one funnel.** Generic template: "Qualified" and "Interested" both map to `qualified` (037 backfill). Target resolution is `findOne({ funnel_id, stage_type })` with no order, so the destination is arbitrary. | `037_funnel_semantics.sql` mapping, `funnel-rules.service.ts:77` | Medium |
| 3 | **BANT rule is hardcoded, agent qualification is configurable.** The AI agent config defines `QualificationField { crm_field, bant_dimension }` per org (external prosales service), but the rule requires exactly `is_decision_maker`, `has_budget`, `timeline`, `service_needed`. An org mapping budget to e.g. `presupuesto` never reaches Qualified. | `040_qualified_bant_rule.sql`, `web/src/services/ai-agents.service.ts:63-76` | Medium |
| 4 | **Post-sale stages exist in templates but are unreachable.** Local Services has "Returning Customer" after "Service Completed" (won, terminal). Ecommerce has "Potential Rebuy" after "Purchase Completed" (won). Automation never leaves a terminal stage. | `018_funnel_templates.sql`, `funnel-rules.service.ts:45` | Medium |
| 5 | **Dashboard "Funnel Conversion" is not conversion.** It divides *current* headcount of a stage by the previous stage's current headcount. It also ignores the dashboard date range, and groups by stage name/position across all funnels, so multiple funnels get merged. | `analytics.service.ts:412-420`, `web/src/app/(dashboard)/page.tsx:169-240` | Medium |
| 6 | **n8n/AI gets a raw stage UUID.** `agent-trigger.processor.ts:128` sends `lead_stage` (id) with no name/type/days-in-stage, so the agent cannot adapt tone or strategy to the stage. | `agent-trigger.processor.ts:120-130` | Low (opportunity) |
| 7 | **Rule naming mismatch.** "Lead contacted" fires on an *inbound* reply, so it really means "responded". Outbound first touch has no stage. | `funnel-automation.consumer.ts:37-42` | Low |

---

## A. How the funnel modifies the application

The funnel is not an isolated page. `contacts.lead_stage` + `contact_funnel_history` are read or
written by 7 backend modules and 6 UI surfaces. Every change below lists the touch points.

### A.1 Current touch points

| Layer | Module / file | Today | Role |
|---|---|---|---|
| DB | `clients.funnels`, `funnel_stages`, `funnel_rules`, `contact_funnel_history`, `contacts.lead_stage` | 014, 018, 037–040 | Source of truth |
| API | `funnels` | stage + template CRUD | Config |
| API | `client-management` | `updateStage`, default placement, rules engine + consumer, activity timeline | Core engine |
| API | `scheduling`, `automation-engine`, `conversation-management` | emit the events the engine consumes | Signal producers |
| API | `analytics` | stage headcount for dashboard; `contact.stage.changed` tracked as an analytics event | Reporting |
| API | `ai-automation` | passes `lead_stage` id to n8n; `update_contact` tool can write `lead_stage` unchecked | AI integration |
| API | `webhooks` | `funnel.stage.changed` (ids only) | External integrations |
| Web | `/config/funnel` (Kanban + List) | drag & drop, stage CRUD, stage_type select | Main UI |
| Web | `/contacts/[id]` | `FunnelStageCard` select, timeline "Stage changed" | Contact UI |
| Web | `/contacts` | stage column, stage filter, CSV (exports raw UUID) | List |
| Web | Inbox `contact-sidebar` | `LeadStageSelector` (newest funnel only) | Agent workspace |
| Web | Dashboard | "Funnel Conversion" chart | Reporting |
| Web | Admin API docs, Webhook editor | documents `PATCH /contacts/:id/stage`, `funnel.stage.changed` | Dev surface |

### A.2 Impact of each planned change

**1) Rules visibility / management**
- API: rules endpoints in `funnels` (register `FunnelRuleEntity` there). The engine stays in
  `client-management` (it depends on `ClientManagementService.updateStage`).
- Web: new "Automation" tab in `/config/funnel`. Show rules per stage. Warn when a rule's
  `to_stage_type` does not exist in the selected funnel, or when a stage_type is duplicated (problem 2).
- Engine: conditions on event payload are needed (problem 1, and most new stages below).
- Risk: org-level overrides change behavior silently. Every rule move must carry `rule_id` in history.

**2) Movement history**
- DB: `contact_funnel_history` + `organization_id`, `rule_id`, `source` adds `'api'` and
  (optionally) `'ai'`. Index `(contact_id, created_at DESC)`.
- API: `updateStage` becomes the only writer. Close the `PATCH /contacts/:id` and `update_contact`
  bypass. Write a history row on initial placement. Await the insert or use one transaction.
  Add `source`/`reason`/stage names to the `contact.stage.changed` event and the webhook.
- Anti-override guard: decide which sources arm it (today everything not `automation`).
- Web: stage-history component on `/contacts/[id]`. Source badge + reason in both timelines.
  Invalidate `contact-activity` on stage change.
- External: webhook payload shape changes. Add fields only, never rename, to stay backward compatible.

**3) Time in stage / rotting**
- DB: `contacts.stage_entered_at TIMESTAMPTZ` (set by `updateStage` and initial placement;
  backfill from latest history row, else `created_at`). Optional: `contacts.is_rotting` or computed on read.
- API: `findAll` returns `stage_entered_at`. A cron (`@nestjs/schedule`, daily or hourly) flags
  contacts where `now - stage_entered_at > stage.rotting_days`. It can emit a new
  `contact.stage.rotting` event and optionally start a `reactivation` sequence.
- Analytics: add `stuck_in_stage` to the existing attention list (`AttentionReason.kind` already has
  `hot_lead | stale_payment | unconfirmed_appt`). Add avg time-in-stage per stage (velocity).
- Web: "X days in stage" on Kanban cards, rotting highlight, `rotting_days` input in `StageListView`,
  "stuck" filter on `/contacts`. Seed sensible `rotting_days` in templates.
- n8n: include `stage_name`, `stage_type`, `days_in_stage` in the agent trigger context.

**4) Cross-cutting fixes that the above depends on**
- `lead_stage` FK (or at least validation + a "move contacts before deleting a stage" flow).
- Org check in `updateStage` and in target resolution (investigation 01, issues 1–2).
- One funnel resolution rule used everywhere (default placement vs UI selectors).
- Realtime: Supabase realtime only subscribes to `messages`, `conversations`, `calls`
  (`realtime-provider.tsx`). The Kanban needs a stage-change broadcast or a `contacts` subscription.
- Real conversion analytics must read `contact_funnel_history` (who *passed through* a stage in the
  range), not current headcount.

---

## B. More granular stages

### B.1 Signals inventory — what can drive a stage today

| Event (RabbitMQ) | Emitted | Has `contact_id` | Used by funnel |
|---|---|---|---|
| `message.received` (inbound) | yes | yes | yes → contacted |
| `message.send` (outbound) | yes | yes | no |
| `contact.data.captured` | yes | yes | yes → qualified (BANT) |
| `appointment.created` / `confirmed` / `completed` | yes | yes | yes |
| `appointment.no_show` | yes | yes | consumed, **no rule** |
| `appointment.cancelled` / `rescheduled` | yes | yes | no |
| `payment.completed` | yes | yes | no |
| `payment.expired` | yes | yes | no |
| `call.started` / `call.completed` (with summary) | yes | yes | no |
| `sequence.exhausted` (with `sequence_type`) | yes | yes | yes → lost (buggy, problem 1) |
| `followup.completed` / `followup.failed` | yes | yes | no (no consumer at all) |
| `conversation.closed` | yes | yes | no |
| `conversation.assign` (handoff, `bot_active`) | yes | **no** | no |
| payment link created | **not emitted** | — | — |
| sequence started | **not emitted** | — | — |
| opt-out (`opt_out` tool adds tag) | **not emitted** | — | — |

Also available as state: `lead_score` (0–100, hot ≥ 70), `ai_insights.intent/sentiment`,
`custom_fields`, `handled_by`, payment status, `rotting_days`.

### B.2 Proposed stage_types

Readiness: **Ready** = event already exists, only a rule + stage_type needed.
**Small** = add a field/emit to an existing flow. **New** = needs a new concept.

**Engagement (top of funnel)**

| stage_type | Enters when | Readiness | Value for the company |
|---|---|---|---|
| `new` | created | exists | — |
| `attempting_contact` | first outbound message/call, no reply yet | Ready for messages (`message.send` carries `direction`); Small for calls (`call.started` payload has no direction) | Separates "we haven't touched it" from "we tried". Measures speed-to-lead |
| `engaged` (rename of today's "contacted" semantics) | first inbound reply | exists (rule "Lead contacted") | Response rate per channel |
| `unresponsive` | `no_response` sequence running/exhausted | Small (filter `sequence_type` in payload) | Shows how much of the base is going cold; feeds reactivation |
| `needs_human` | AI hands off (`bot_active=false`) | Small (add `contact_id` to `conversation.assign`) | A human work queue inside the funnel; measures AI containment rate |

**Qualification**

| stage_type | Enters when | Readiness | Value |
|---|---|---|---|
| `qualifying` | some but not all qualification fields captured | Small ("any-of" conditions) | Shows where qualification stalls |
| `qualified` | all required fields (from the agent's own BANT mapping) | exists, fix problem 3 | — |
| `disqualified` (terminal, ≠ lost) | explicit negative answer (no budget, not a fit, wrong service) | Small (negative conditions) | Separates bad lead *quality* (marketing/channel) from lost *deals* (sales). Combines with existing channel ROI |

**Conversion (mid funnel)**

| stage_type | Enters when | Readiness | Value |
|---|---|---|---|
| `proposal` / `negotiation` | manual (already in vocabulary) | exists, manual only | — |
| `payment_pending` | payment link sent, not paid | Small (emit on `createCheckoutLink`) | Checkout drop-off. Complements existing `stale_payment` alert |
| `appointment_scheduled` | booking | exists | — |
| `appointment_confirmed` | confirmed / paid | exists | — |
| `no_show` | `appointment.no_show` | Ready (event consumed, no rule) | No-show rate: a key KPI for clinics and services. Trigger recovery sequence |
| `appointment_cancelled` | `appointment.cancelled` | Ready | Cancellation rate. Needs `direction_policy: 'any'` to return to scheduled on reschedule |

**Outcome**

| stage_type | Enters when | Readiness | Value |
|---|---|---|---|
| `won` | `appointment.completed` **or** `payment.completed` without appointment | Ready (second rule) | Direct-sale businesses (ecommerce, paid services) can reach Won today only manually |
| `lost` | sequence exhausted (`no_response` only) / manual | exists, fix problem 1 | Add `lost_reason` as an attribute, not more stages |

**Post-sale (biggest gap — today `won` is a dead end)**

| stage_type | Enters when | Readiness | Value |
|---|---|---|---|
| `customer` / `onboarding` | after won | New (won must stop being "no automation out") | Lifecycle beyond the first sale |
| `service_completed` | `appointment.completed` when already a customer | Ready once post-won moves are allowed | Triggers `post_service` sequence (already seeded) |
| `review_requested` | `post_service` sequence completed | Small | Reputation/referrals |
| `repeat_customer` | second `payment.completed` / second completed appointment | Small (count in conditions) | Retention / LTV |
| `dormant` | rotting past N days as customer | depends on rotting job | Reactivation campaigns (template `reactivation` exists) |

### B.3 Keep these as flags, not stages

Adding them as stages would explode the board and fight the "one stage per contact" model:
- **Rotting / stuck**: badge from `stage_entered_at` + `rotting_days`.
- **Hot**: already `lead_score >= 70`.
- **Opt-out / do-not-contact**: a flag that stops automation (today only a tag).
- **Human vs AI handling**: `handled_by` / `bot_active`. Keep `needs_human` as a stage only if the org wants a human queue column.
- **Lost reason / disqualify reason**: attribute on the contact or history row.

### B.4 Engine changes required by the new stages

1. **Payload conditions**: rules must match on event data (`sequence_type`, `direction`,
   `payment.appointment_id IS NULL`, counts), not only `custom_fields`.
2. **Re-entry**: `no_show` / `cancelled` → back to `appointment_scheduled` needs
   `direction_policy: 'any'` per rule, or an explicit allowed-transition list.
3. **Terminal vs outcome**: split "is an outcome" (won/lost, for reporting) from "automation may
   not move it" (terminal). Otherwise post-sale is impossible.
4. **Unique stage_type per funnel**, or a deterministic tie-break (lowest position).
5. **Qualification rule generated from the agent's qualification config** (`bant_dimension` → `crm_field`).
6. **Multi-funnel routing**: one `lead_stage` per contact, default = oldest funnel. If post-sale
   lives in a separate funnel, either a contact moves funnels (history must record it) or a
   contact needs one position per funnel (bigger change: `contact_funnel_positions` table).

### B.5 Example templates with the granular vocabulary

- **Clinic / appointment services**: New → Attempting contact → Engaged → Qualified →
  Appointment scheduled → Confirmed (paid) → Won (attended) | No-show | Cancelled →
  Service completed → Repeat patient | Dormant. Lost / Disqualified.
- **Direct sale / ecommerce**: New → Engaged → Qualified → Payment pending → Won (paid) →
  Repeat customer | Dormant. Lost.
- **B2B / agency**: New → Attempting contact → Engaged → Qualifying → Qualified → Proposal →
  Negotiation → Won → Onboarding. Lost / Disqualified.
- **Real estate**: New → Engaged → Qualified → Visit scheduled → Visit done → Offer (proposal) →
  Negotiation → Closed (won). Lost.

Each template should ship with default `rotting_days` per stage (e.g. attempting_contact 1–2,
engaged 3, qualified 5, payment_pending 1, proposal 7).

### B.6 Metrics this unlocks for companies

| Metric | Needs |
|---|---|
| Real stage-to-stage conversion over a date range | history (A.2-2) |
| Velocity: avg / median days per stage, time to won | history + `stage_entered_at` |
| Stuck leads per stage (count + value) | rotting (A.2-3) |
| Speed-to-lead (new → attempting_contact → engaged) | new engagement stages |
| AI vs human vs automation contribution per move | `source` in history |
| No-show / cancellation rate | `no_show`, `appointment_cancelled` |
| Checkout drop-off | `payment_pending` |
| Lead quality by channel (disqualified % per channel) | `disqualified` + existing channel ROI |
| Retention / repeat rate | post-sale stages |

---

## C. Suggested order

1. **Fix**: problem 1 (sequence → lost), cross-tenant lookup and `updateStage` validation
   (investigation 01), duplicate stage_type tie-break.
2. **Trust the data**: single writer for stage changes, initial-placement history, `source`
   incl. `'api'`, `stage_entered_at`.
3. **Visibility**: history with source/reason in the UI, read-only rules view, days-in-stage on Kanban.
4. **Rotting**: `rotting_days` UI + cron + `stuck_in_stage` attention item.
5. **Granular stages, ready-now group**: `no_show`, `appointment_cancelled`, `won` via payment,
   `attempting_contact`, `payment_pending` (+ payload conditions and re-entry in the engine).
6. **Reporting**: history-based conversion and velocity on the dashboard.
7. **Post-sale lifecycle**: terminal/outcome split, `customer` → `repeat_customer` / `dormant`.

## Open decisions — answered (see 03 §1)

1. Won / post-sale → **post-sale is out of scope**; the funnel ends at Booked (confirmed / paid).
2. 24h guard → **removed, no blocking of any kind** (03 §1.2).
3. `needs_human` → **not a stage, not a column**.
4. Rules → **org-built rules + system defaults**.
5. Stage-type vocabulary → still open; see 03 Q3.
