# Funnel investigation 03 — Product decisions + funnel page UI

Status: investigation only, no code changed.
Builds on `funnel-investigation-01-current-state.md` and `funnel-investigation-02-impact-and-stages.md`.
This document **supersedes** the parts of 02 that conflict with the decisions below.

---

## 1. Product decisions (from the product owner)

| # | Question | Decision |
|---|---|---|
| D1 | Is post-sale part of the funnel? | **No.** This is a communication CRM, not a sales system. We don't control the final sale or post-sale. The funnel's goal is: **qualify → schedule → collect an advance payment when possible.** |
| D2 | Which moves arm the 24h anti-override guard? | **None. The guard is removed entirely.** No time window, no per-contact pause, no `force` flag. Movement depends only on rules and actions. See §1.2. |
| D3 | "Needs human" as a stage/column? | **No.** Not part of the funnel. |
| D4 | Who writes rules? | **Companies build their own rules**, and the system ships **default rules**. |
| D5 | Funnel page layout | The **List** tab must show **contacts by stage**, not stage configuration. Stage configuration moves to a **"Stages" tab or a configuration button**. The page must be aligned with the design system. |

### 1.1 Consequences of D1 (scope = qualify, schedule, pre-pay)

The funnel ends when the contact is **booked** (and paid, when the calendar charges).
What happens after the appointment belongs to the business, not to the CRM.

Revised portable vocabulary (replaces 02 §B.2):

| Phase | stage_type | Enters on | Signal status |
|---|---|---|---|
| Engage | `new` | contact created | exists |
| Engage | `attempting_contact` | first outbound message, no reply | `message.send` has `direction`. Needs a rule |
| Engage | `engaged` (today's `contacted`) | first inbound reply | exists ("Lead contacted") |
| Qualify | `qualifying` | some qualification fields captured | needs "any-of" conditions |
| Qualify | `qualified` | all required fields, from the agent's own BANT mapping | exists, but keys are hardcoded (02 problem 3) |
| Schedule | `appointment_scheduled` | booking on a free calendar | exists |
| Pay | `payment_pending` | payment link sent (paid calendars) | **no event today**: emit on `createCheckoutLink` |
| Goal | `appointment_confirmed` = **Booked** | confirmed, or paid (payment creates the appointment already confirmed) | exists |
| Recoverable | `no_show` | `appointment.no_show` | event consumed, no rule |
| Recoverable | `appointment_cancelled` | `appointment.cancelled` | event exists, not consumed |
| Exit | `disqualified` | explicit negative qualification answer | needs negative conditions |
| Exit | `lost` | `no_response` sequence exhausted / manual | exists, fix 02 problem 1 |

Removed from scope: `won` as "sale closed", `proposal`, `negotiation`, and all post-sale types
(`customer`, `service_completed`, `review_requested`, `repeat_customer`, `dormant`).

What this changes in existing code and data:
- **"Deal won" rule** (`appointment.completed` → `won`) is outside the goal. Options: retire it, or
  re-label the outcome as "Attended" (informational). Either way, "success" for reporting =
  reached `appointment_confirmed`.
- **Dashboard** `outcomeKind()` (`web/src/app/(dashboard)/page.tsx:161`) counts won/lost. It must
  count **Booked / Lost / Disqualified** instead.
- **Templates** (018) are sale-oriented: "Property Sold", "Purchase Completed", "Returning Customer",
  "Potential Rebuy", "Proposal Sent", "Negotiation". They need a rewrite around
  qualify → schedule → pay, per industry. The "Sales Pipeline" template (039) is the closest fit.
- **Stage selector** in `StageListView` lists `proposal`, `negotiation`, `won`. Those must be removed
  or relabeled.
- **Payment flow order** (verified): with a paid calendar, no appointment exists until payment.
  `createCheckoutLink` stores a booking draft → `payment.completed` →
  `createConfirmedFromPayment` emits `appointment.created` **and** `appointment.confirmed`
  back-to-back (`scheduling.service.ts:317-318`). So the paid path is
  `qualified → payment_pending → appointment_confirmed`. It never passes through `appointment_scheduled`.
- **Race found:** those two events are consumed concurrently (prefetch 10). Both evaluations read
  the same current stage. If "Appointment scheduled" writes last, the contact ends in
  *Scheduled* instead of *Confirmed*. Needs per-contact serialization or a "don't move backward at
  write time" check.
- **Payment expired** (`payment.expired`, exists): the booking draft dies. Should move
  `payment_pending` back to `qualified` (or to a "payment expired" state). Needs a rule with
  `direction_policy: 'any'`.

### 1.2 D2 — anti-override guard removed (final)

Decision: **no blocking of any kind.** Rejected alternatives: keep the guard; guard + forced rules;
per-contact "pause automation" switch. How the old guard behaved is recorded at the end of this document.

Implementation impact:
- `FunnelRulesService.evaluate()`: delete the history lookup and the `MANUAL_OVERRIDE_WINDOW_MS`
  check (`funnel-rules.service.ts:10-11`, `47-58`). The engine then only depends on: terminal
  stage, rule match, `from_stage_types`, conditions, `forward_only`.
- `contact_funnel_history.source` stays, but **only for audit/UI** ("who moved it"). It no longer
  drives behavior. Fix the comment on `ContactFunnelHistoryEntity.source` ("Drives the anti-override guard").
- `ClientManagementService.updateStage`: keep the no-op early return (a same-stage save is still not
  a move). Update its comment, which justifies it by the guard.
- Rule builder: **no `force` flag** (removed from §1.4).
- `apps/api/test/funnel-flow.integration.js`: "Test 2 — manual anti-override guard" asserts the old
  behavior and must be removed or inverted.
- Behavioral consequence (accepted): a manual move can be followed by an automatic move on the next
  matching event. `forward_only` still prevents automation from pulling a contact back, and
  Lost/Disqualified are never moved by automation.
- With no guard, the concurrency issue in §1.1 (two events evaluated at the same time for one
  contact) matters more. Fix it in step 1.

### 1.3 D3 — "needs human" out of the funnel

- No stage, no column. AI→human handoff stays in the inbox (`conversation.bot_active`,
  `contact.handled_by`).
- The `conversation.assign` event does not need a `contact_id` for funnel purposes (02 §B.1 item dropped).

### 1.4 D4 — rule builder + defaults

Data model impact (`clients.funnel_rules` already supports most of it):
- System defaults: `organization_id IS NULL`, read-only for orgs. An org can **disable** a default
  for itself without deleting it. This needs a per-org override (e.g. `funnel_rule_overrides
  (organization_id, rule_id, is_active)`) or copy-on-write into an org rule.
- Org rules: full CRUD, optionally scoped to one `funnel_id`.
- New columns: event-payload conditions (e.g. `conditions.event.sequence_type`),
  `updated_at`, `created_by`.
- History rows need `rule_id` so a renamed or deleted rule still explains past moves.

Rule builder UI (trigger → conditions → from stages → to stage → direction → priority):
- **Trigger** picker limited to supported events (the consumer list), with plain-English labels:
  "Customer replies", "Qualification data captured", "Appointment booked", "Payment received",
  "Payment link expired", "Appointment cancelled", "No-show", "Follow-up sequence finished"
  (with sequence type).
- **Conditions**: captured fields (from the agent's qualification config: key + label + type),
  lead score ≥ N, event fields.
- **Target**: stage in this funnel (stored as `to_stage_type` or a concrete `to_stage_id`; see open question Q3).
- **Validation** shown inline: target stage missing in the funnel; duplicate stage types;
  rule never reachable (from-stage missing).
- **Test/preview**: "which contacts would this move now" is a read-only query, useful before enabling.

Backend placement: rules CRUD in `funnels` (register `FunnelRuleEntity` there). Evaluation stays in
`client-management`.

---

## 2. Funnel page UI — current state vs. D5

### 2.1 Current structure (`/config/funnel`)

```
page.tsx
 ├─ header: title + native <select> (funnel) + "New funnel" Button
 ├─ manual toggle buttons: [Kanban] [List]        ← hand-rolled, not <Tabs>
 ├─ Kanban → FunnelKanbanView → KanbanColumn (useContacts per stage, limit 50) → KanbanContactCard
 └─ List   → StageListView = STAGE CONFIGURATION (rename, color, stage_type, reorder ↑↓, delete, add)
```

So today "List" is a settings screen, not a list of contacts. That is the mismatch D5 describes.

### 2.2 Target structure

```
/config/funnel
 ├─ header: title · funnel <Select> · [⚙ Configure] · [+ New funnel]
 ├─ <Tabs>: [Board] [List]   (+ [Stages] [Automation] tabs if config stays inline)
 ├─ Board → Kanban (unchanged behavior; add days-in-stage + source badge later)
 ├─ List  → contacts of the selected funnel, grouped by stage
 └─ Configure (Stages tab or Drawer/Dialog from the ⚙ button)
       ├─ Stages: name, color, stage type, rotting_days, reorder, delete (with "move contacts" guard)
       └─ Automation: default rules (toggle) + org rules (builder)   ← D4
```

Tab vs. button: the project already uses `<Tabs>` for sectioned config pages
(`config/payments/page.tsx`, `config/agents/page.tsx`). A **⚙ Configure** button that opens a
`Drawer` keeps Board/List as the work views and configuration out of the daily flow. Recommendation:
**Board | List tabs + Configure button (Drawer with Stages / Automation tabs inside)**. Choose one
before building (open question Q1).

### 2.3 List tab — contacts by stage

Proposed content: one collapsible section per stage (ordered by `position`), header = color dot,
stage name, count, and "N stuck" once rotting exists. Rows reuse the `/contacts` table look
(`contacts/page.tsx`): name + avatar, phone/email, score bar, handled by, **time in stage**,
**last move source** (manual/API/AI/automation), last activity. Row click opens the contact.
Optional: row action "Move to…" (same `updateStage` path as drag & drop).

Backend gaps for this view:

| Need | Today | Change |
|---|---|---|
| Contacts of one funnel | `GET /contacts?stage_id=` (one stage) | add `funnel_id` filter, or one request per stage like the Kanban does (N requests) |
| Real count per stage | Kanban shows `items.length` (max 50) | use `meta.total` from the paginated response, or a `GET /funnels/:id/stage-counts` |
| Pagination per stage | none (limit 50) | per-section "Load more" using `page` |
| Time in stage | not available | `contacts.stage_entered_at` (01 §3) |
| Last move source | not returned | latest history row `source` (join) or denormalized on contact |
| Search / filter | `/contacts` has search + stage | reuse `search`; add "stuck only" later |

Kanban and List should share one data hook (contacts by funnel/stage). That avoids two fetching
strategies and fixes the 50-cap count in both.

### 2.4 Design-system alignment (per `.claude/skills/frontend/SKILL.md`)

Audit of `config/funnel/**` today:

| Rule | Violations found |
|---|---|
| Radix over native (`Select`, `Tabs`, `Button`, `Tooltip`) | native `<select>`: `page.tsx` (funnel picker), `StageListView.tsx` ×2 (stage type). Hand-rolled Kanban/List toggle instead of `<Tabs>`. Raw `<button>` in `StageListView` (×11 incl. text arrows ↑ ↓), `ContactQuickView` (×5), `FunnelTemplateSelector`, `KanbanContactCard`. `title=` attributes instead of `Tooltip` |
| No raw hex | `STAGE_COLORS` hex palette + `#9CA3AF` fallback (`StageListView`, `KanbanColumn`), 38 hex values in `FunnelTemplateSelector`. Seeded template colors are blue/indigo/violet hex (forbidden as brand colors, allowed only as data series) |
| Use `Card` / `Badge` / `Skeleton` | manual bordered divs for stage rows and columns; manual pill `<span>`s for stage type and card chips (`Badge` exists with `success/warning/info/secondary`); loading uses manual `animate-pulse` divs instead of `Skeleton` |
| English only | `contactCardHelpers.relativeTime()` returns Spanish ("ahora", "hace N min/h/d"), shown on Kanban cards and quick view |
| Only 3 design-system components used | `Button`, `Dialog`, `Input`. No `Select`, `Tabs`, `Card`, `Badge`, `Skeleton`, `Tooltip`, `Drawer`, `DropdownMenu` |

Stage colors are user data stored as hex in the DB, so they can't simply be "removed". Options:
(a) map the palette to the chart tokens (`chart-lime/purple/cyan/pink/yellow` + status colors) and
store the token name; (b) keep hex in the DB but pick only from token-derived values. Open question Q2.

Visual regression: `apps/web/visual/` (`design-audit.spec.ts`, `new-views.spec.ts`,
`regression.spec.ts`) has **no funnel coverage** today. Add the funnel page to the audit when restyling.

---

## 3. Updated order of work

1. **Fix**: remove the 24h guard (§1.2), sequence-exhausted → Lost (02 problem 1), paid-booking race (§1.1),
   cross-tenant lookup + `updateStage` validation (01), duplicate stage_type tie-break.
2. **Trust the data**: single writer, initial-placement history, `source` for audit only,
   `stage_entered_at`, `rule_id` on history.
3. **Page restructure + design system (D5)**: Tabs, Configure drawer, List = contacts by stage,
   shared data hook, real counts, English strings.
4. **Visibility**: history with source/reason on the contact page, days-in-stage on Board/List.
5. **Rules (D4)**: defaults read-only + per-org toggle → rule builder with payload conditions.
6. **Scope-aligned stages (D1)**: `attempting_contact`, `payment_pending` (+ emit), `no_show`,
   `appointment_cancelled`, `disqualified`, payment-expired recovery. Rewrite templates around qualify → schedule → pay.
7. **Rotting + reporting**: `rotting_days` UI + cron + `stuck_in_stage` attention item. Dashboard
   based on history: conversion to Booked, time to book, no-show rate, payment drop-off.

## Decisions on the open questions

Accepted by the product owner (defaults proposed during the investigation):

- Q1. Configuration → **⚙ Configure button** opening a `Drawer` with **Stages** and **Automation** tabs.
  The page keeps **Board | List** tabs.
- Q2. Stage colors → keep hex in the DB (no migration, existing data keeps working), but the picker
  only offers a **palette derived from design-system tokens** (chart + status colors).
- Q3. Rule targets → **system defaults** keep a portable `to_stage_type`. **Org rules** are built
  inside a funnel and target a concrete stage (`to_stage_id`). This avoids the duplicate-stage_type ambiguity.
- Q5. "Deal won" on `appointment.completed` → **retire**. The funnel goal is Booked.
  **Booked must not be terminal**: no-show and cancellation have to be able to move it.


Also decided:

- Q4. 24h guard → **removed, no blocking of any kind** (§1.2).

- Q6. "Remove the n8n trigger" → **the funnel has no n8n connection left.** n8n (and any API-key
  integration) can no longer move stages, and the CRM no longer sends `lead_stage` to n8n
  (`agent-trigger.processor.ts`). The rest of the n8n integration is unchanged.

## 4. Progress

### Step 1 — fixes (done)

| Fix | Where |
|---|---|
| 24h guard removed; `source` is audit-only | `funnel-rules.service.ts`, `contact-funnel-history.entity.ts` |
| Rule conditions can match the event payload (`conditions.event`); consumer passes the payload | `funnel-rules.service.ts`, `funnel-automation.consumer.ts` |
| "Lead lost" only on `sequence_type = no_response`; "Deal won" retired | migration `046_funnel_rules_event_conditions.sql` |
| Paid-booking race: automated moves are compare-and-set (`moveStageIfUnchanged`) + re-evaluation, up to 3 attempts | `client-management.service.ts`, `funnel-rules.service.ts` |
| Stage lookups scoped by org; a stage without a funnel is skipped | `funnel-rules.service.ts` |
| Manual move validates `stage_id` (UUID + belongs to the org) | `client-management.controller.ts`, `client-management.service.ts` |
| Duplicate stage_type → lowest position | `funnel-rules.service.ts` |
| Q6: `lead_stage` ignored on create/update (incl. AI tools); `PATCH /contacts/:id/stage` users only (`@Roles`); endpoint removed from API docs | `client-management.service.ts`, `client-management.controller.ts`, `ApiDocsSection.tsx` |

Verification: new `funnel-rules.service.spec.ts` (17 tests) + 7 stage tests in
`client-management.service.spec.ts`; mutation-checked (each fix reverted → its test fails). On a real
Postgres built from all migrations: 50/50 concurrent paid bookings end in Confirmed (old code: 18/50
stuck in Scheduled). `test/funnel-flow.integration.js` updated (11/11). API 290/290, web 436/436 tests.

Deploy notes: apply migration 046. Integrations that called `PATCH /contacts/:id/stage` with an API
key now get 403.

### Step 3 — page restructure + design system (done)

| Change | Files |
|---|---|
| Header: funnel `Select`, **Configure** button, New funnel; `Tabs` **Board / List** | `config/funnel/page.tsx` |
| **List** = contacts grouped by stage (collapsible, real totals, load more, aligned columns, row → contact) | `FunnelListView.tsx` |
| **Configure** drawer replaces the old List tab: reorder, edit, palette color picker, stage type `Select`, add, delete with confirmation + contact count | `StagesDrawer.tsx` (was `StageListView.tsx`) |
| Stage colors: picker offers 8 token colors; stored legacy hex rendered via 1:1 mapping / nearest token (no DB change) | `stageColors.ts` |
| Board: real column totals (not capped at 50), `Skeleton`, `Badge`, lucide `Flame` (filled), no glow / infinite pulse, keyboard-openable cards, "Active …" pill works (`last_contacted_at`), dead "More options" removed | `KanbanColumn.tsx`, `KanbanContactCard.tsx` |
| Quick view: tinted header instead of saturated warning fill, design-system buttons, dead "More options"/"Add tag" removed, error toast on failed call | `ContactQuickView.tsx` |
| Template picker: `Card`/`Skeleton`/`Button`, visible stage list, hardcoded pre-migration fallback templates removed | `FunnelTemplateSelector.tsx` |
| Shared `StageSelect` grouped by funnel for inbox + contact page (inbox only showed the newest funnel) | `components/funnel/stage-select.tsx` |
| Stage change also refreshes the contact activity timeline; shared `useStageContacts` hook | `useContacts.ts`, `useFunnels.ts` |
| English copy everywhere (relative times were Spanish) | `contactCardHelpers.ts` |

Verification: design audit (`visual/support/design-audit.ts`) before → after on the funnel page:
off-palette colors 7–14 → 0, native selects 1–2 → 0, `title` attributes 12 → 0, unlabeled controls
21 → 0, non-lucide icons 3 → 0. New `visual/funnel.spec.ts` (board, list, configure, quick view,
template picker) + 17 unit tests. Visual suite 38/38, web 453/453, API 290/290.

Not done (out of funnel scope): inbox `contact-sidebar` / `contact-profile-panel` read
`contact.last_activity`, which the API never returns ("Last seen" never shows). The Automation tab
of the Configure drawer comes with step 5 (rules API).

### How the 24h guard worked (for the record, removed by Q4)

On every event, before looking at any rule, the engine read the contact's latest history row. If that
row was `source='manual'` and less than 24h old, the engine returned immediately:
- every rule was skipped, including correct ones;
- the event was discarded: no retry after the window, no log line, nothing in the UI;
- n8n/API moves counted as `manual`, so they also started the window.

Example: 10:00 an agent drags the contact to Qualified → 11:00 the customer pays the booking →
`appointment.confirmed` is dropped → the contact stays in Qualified until some new event arrives.
