# Inbox redesign — gap closure plan

## Context (read this first in a new session)

A previous ephemeral sandbox session fully implemented an "Inbox-first CRM redesign"
(master plan P0–P7) but never committed it — that sandbox no longer exists, so the
code was lost. This repo's `main` was reimplemented from scratch in a later session
(commits/work described in Engram memory under project `teio`, search `mem_search`
for "Teio P0" through "Teio P7 done"), but that reimplementation turned out to be a
**smaller, simpler reinterpretation** of the original plan — not a faithful rebuild.

The user then showed 8 screenshots of the original sandbox's finished UI. Comparing
them against the reimplementation surfaced real gaps. Digging further, the **full
original planning + implementation text the user had pasted into an earlier session**
was recovered verbatim from that session's raw JSONL transcript (it had been
summarized away by compaction, but the raw file on disk still had it) and saved to:

```
.claude/plans/recovered-sandbox-implementation-spec.md   (37,769 lines, ~1.78M chars)
```

**Do not re-read that whole file into context.** Grep it by section. Known line
ranges (re-check with `grep -nE "^#{1,4} " recovered-sandbox-implementation-spec.md`
if they've drifted):

| Range | Content |
|---|---|
| ~7065–10811 | `module-consolidation-investigation.md` — nav/IA audit, bug list B1–B9 |
| ~9190–10800 | `contact-360-deep-dive.md` v1 |
| ~11867–12555 | `inbox-handoff-realtime-security-plan.md` — WS1–WS8 |
| ~12686–12988 | `00-master-plan.md` body — §4 Inbox, §5 LeadPanel, §6 rest of app |
| ~18785–28218 | Actual code diffs (conversation service, AI tool handlers, realtime provider, FunnelKanbanView) |
| ~35445–37636 | Later a11y polish pass — confirms **real final file names** |
| ~37636–37672 | §13 "Implementation status" — exact claimed scope + verification numbers |

Real final file/component names from the polish-pass diffs (different from what this
session's reimplementation used — reconcile naming when rebuilding):
`components/inbox/composer.tsx`, `message-bubble.tsx`, `lead-thread.tsx`,
`lead-list-item.tsx`, `contacts-list.tsx`, `components/lead/lead-chip.tsx`,
`components/lead/sections/{identity,decisions,qualification}-section.tsx`,
`app/(dashboard)/inbox/page.tsx`.

## Current repo state (this session's reimplementation — already done, verified)

All of P0–P7 below are implemented, typecheck/lint clean, and covered by tests
(see Engram memory "Teio P0" through "Teio P7 done" for full detail per phase):

- P0: `@AdminOnly()` guards, secret masking, role-filtered sidebar/⌘K
- P1: dead-route redirects, in-shell 404/error, password-reset fix
- P2: per-conversation `bot_active` enforcement in `ingestMessage`, realtime ref-counting, outbound-dispatch failure reasons
- P3: `ContactSidebar` (Lead Stage, Score, handoff toggle, Tags, Captured Fields, AI Insights, Payments)
- P4: `/inbox` tabs (Conversations/Pipeline/Contacts/Calls) as separate full-page views
- P5/P6: `/payments` page, Today queue link fix, ⌘K lead search
- P7: dead "Reply via" picker removed, `reachableChannels()`, Start Conversation, global opt-out tag

## Gaps vs. the recovered spec (why a second pass is needed)

1. **Opt-out must be per-channel**, not global. Spec: tags like `opt-out:whatsapp`,
   enforced on every send path, the AI trigger, follow-up channel resolution, and
   outbound calls. Current: single global `'opt-out'` tag
   (`apps/api/.../client-management.service.ts` `optOut()`).
2. **Handoff must be lead-level**, applying to every channel/conversation of the
   contact at once (D2) — a dedicated `POST /contacts/:id/handoff`, with new
   channels inheriting human control. Current: per-conversation
   `POST /conversations/:id/handoff` (`bot_active` on one `ConversationEntity` row).
3. **Reply-side guard missing.** Spec: a late AI reply arriving after a human took
   control is rejected with 409 (`AI_HAS_CONTROL` / `HUMAN_HAS_CONTROL`). Current:
   only a trigger-side skip (`conversation.bot_active` check before enqueueing);
   nothing rejects a reply that slips through.
3b. `sender_type`/`sender_id`/`channel` should be stored correctly on every reply
   (verify current `sendMessage` actually sets these — spec calls this a bug fix).
4. **Inbox should be lead-level**, one row per lead across all channels, via a new
   `GET /conversations/leads` endpoint with 10 saved views (Needs human · Your turn ·
   Unread · Hot · AI active · All open · Resolved · Calls · All contacts · Pipeline),
   with the **LeadPanel persistent in every view**. Current: conversation-level list;
   Pipeline/Contacts/Calls built as separate full-page views
   (`pipeline-view.tsx`, `contacts-view.tsx`, `calls-view.tsx`) with no sidebar.
5. **LeadPanel needs 8 named sections** (A Identity, B Decisions, C Actions, D Next,
   E Qualification, F AI Summary, G Related [collapsible: Appointments/Payments/
   Follow-ups/Calls/Conversations], H Details & tags/opt-outs) plus action buttons
   (Message/Call/Book/Payment link/Follow-up). Current `ContactSidebar` has a subset,
   not organized this way, no action buttons, no Next/Related sections.
6. **`LeadChip` + peek drawer** (`?lead=<id>`) should work from *any* page (Schedule,
   Payments, Pipeline, Home, notifications), not just inside `/inbox`.
7. **Call drawer** (`?call=<id>`: duration/started/ended/recording/transcript) was
   never built — the `?call=` query param exists in redirects but has no consumer.
8. **Composer 5 states** — spec: AI-locked / human-unlocked / opted-out-disabled /
   no-text-channel-disabled / sending-failed-inline. Current `message-composer.tsx`
   only has the first two.
9. **Realtime**: "reconnect resync" and a server-pushed `contact.updated` event are
   missing. Current only has ref-counted channel sharing (P2).

## Proposed phased plan (do not start until told to)

| Order | Phase | Scope | Depends on |
|---|---|---|---|
| 1 | Decisions correctness | Per-channel opt-out tags + enforcement everywhere; lead-level handoff endpoint + inheritance; reply-side 409 guard; verify sender fields on every reply | none — fixes wrong decisions before building more on top |
| 2 | Lead-level Inbox | `GET /conversations/leads` (one row per lead, 10 views, search), rebuild `/inbox/page.tsx` list + persistent `LeadPanel` across Conversations/Pipeline/Contacts/Calls | Phase 1 (handoff/opt-out shape leaks into the lead row) |
| 3 | LeadPanel rebuild | 8-section panel (A–H), action buttons, Next, Related (collapsible, lazy), used in Inbox + `/contacts/[id]` workspace + peek drawer | Phase 2 |
| 4 | `LeadChip` + peek drawer everywhere | Schedule, Payments, Pipeline, Home, notifications all open the same drawer via `?lead=` | Phase 3 (reuses LeadPanel) |
| 5 | Composer 5 states + call drawer | Opted-out/no-text-channel disabled states; `?call=` drawer (duration/started/ended/recording/transcript) | can run in parallel with 3–4 |
| 6 | Realtime polish | Reconnect resync, `contact.updated` push | lowest risk, do last |

Each phase should re-verify with the project's real test suites (not just
typecheck) before moving on, same discipline as this session's P0–P7 work.
