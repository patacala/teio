# Plan: remove the Communications module (whole repo)

Status: IMPLEMENTED (Phase 1 code + Phase 2 DB files in the working tree, not committed).

Decisions taken:
- D1 Password reset: built-in English HTML. Follow-up fixes: the link uses FRONTEND_URL || NEXT_PUBLIC_WEB_URL
  (before, production links pointed to localhost); the email lookup is case-insensitive; deactivated and unlinked
  users are skipped; one email per account per minute (no global rate limit exists).
- D2 Welcome email: restored as built-in English HTML on a self-signup's first login (sent once, via a Redis claim;
  never sent to the @local placeholder).
- D3 Billing: only "payment failed" kept (built-in HTML to owner/admin, button to /admin/billing).
  Payment succeeded, subscription created/updated/cancelled, invoice paid/failed emails dropped
  (this also removes the duplicate sends).
- D4 Appointment SMS: built-in English texts (English date/time format) added for confirmed / rescheduled / cancelled (sent whenever the
  contact has a phone). Confirmation request and reminder SMS are unchanged: sent only when the contact has no email.
  A reschedule still awaiting confirmation sends nothing extra, because the confirmation request covers it.
- D5 Branding and notification preferences: removed (API, types, UI, data).
- D6 /api/v1/communications/* removed (including the open SMS test endpoint) and dropped from the API docs page.
- D7 All data deleted: the drop migration runs at API boot (TypeORM) and via db:migrate (057).
- D8 Follow-up send_email: MailService with the step's text (or the generic follow-up text).
- D9 024/026 deleted; 025 trimmed to is_platform_admin and renamed 025_platform_admin.sql; 057 drops the tables on
  existing databases.
Roles: "super admin" = "system admin" = `core.users.is_platform_admin`.

## 0. Scope

**Removed:** the "communication templates" system: event → template mapping, system/org
templates, dispatch service + BullMQ queue, delivery log, the `/config/communications` page
("Communications" for the super admin, "Notifications" for the org), org branding and
notification preferences (their only reader is the dispatcher), and the SMS test endpoint.

**Not removed** (same word, different features):
| Keep | Why |
|---|---|
| `MailService`, `SmsService` (infrastructure) | Used directly by appointments, payments, demo, AI tools |
| `POST /v1/mail/send` (`modules/mail`) | Public API for raw mail |
| Quick replies (`/templates`, `conversations.message_templates`) | Inbox feature |
| `CommunicationEventConsumer` (notifications) | Analytics only; the name is misleading (optional rename) |
| Contact sidebar "Communications" section | Contact opt-out of follow-ups |
| `core.users.is_platform_admin` (created in `025_…sql`) | **Needed by the whole platform area** |

## 1. What depends on the dispatcher today and what replaces it

| Caller | Event(s) | Today | After removal |
|---|---|---|---|
| `auth.service.ts` forgot-password | `password_reset` | Template only, **no fallback** | **Must keep.** Send inline HTML via `MailService` (same style as the appointment emails) |
| `tenant-context.middleware.ts` signup provisioning | `welcome` | Template only | D2: drop or inline |
| `appointment-email.consumer.ts` | 5 appointment events, email + SMS | Template, then hard-coded inline HTML/SMS | Inline becomes the only path. Email behaviour is unchanged, because the org toggles are already ignored there (the fallback sends anyway) |
| same, SMS for created / rescheduled / cancelled | — | **Template only** | D4: drop or add inline texts |
| `subscription.service.ts` `dispatchBillingEmail` | payment_succeeded/failed, subscription_created/cancelled | Template only | D3 |
| `billing-event.consumer.ts` `dispatchToAdmins` | subscription_updated, invoice_paid, invoice_payment_failed, subscription_cancelled | Template only, **duplicates the row above** | Remove the email part; keep analytics tracking |
| `automation-engine/handlers/send-email.handler.ts` (follow-up step `send_email`) | reuses `appointment_reminder` | Template, otherwise throws (likely broken today) | D8: `MailService.send({ subject: title, html: message_content })` |
| `tool-execution.service.ts` | — | Injected, never used | Remove the injection and the `ToolContext.communicationDispatch` field |
| `demo.service.ts` | (`demo_ready` defined, never used) | Already bypasses the module | No change |
| `CommunicationDispatchQueueService.enqueue` | — | No callers (dead) | Delete. No jobs can be lost |

## 2. Decisions needed before coding

- **D1** Password reset inline email: Spanish, same visual style as the appointment emails? (Recommended: yes.)
- **D2** Welcome email on signup: drop (recommended; it is a placeholder today) or inline.
- **D3** Billing emails: (a) drop all and rely on Stripe emails plus in-app billing banners; (b) keep only
  `payment_failed` inline (recommended for dunning); (c) keep the 4 from `subscription.service` inline.
- **D4** Appointment SMS for created/rescheduled/cancelled: drop (matches production unless a super
  admin configured SMS templates; see the audit) or add inline texts.
- **D5** Branding and notification preferences removed entirely (API endpoints, DTOs, shared types). OK?
- **D6** Public API `/api/v1/communications/*` is documented in the API-docs page. Confirm that no external
  consumer calls it (agentic-response repo, n8n flows) before removal.
- **D7** Historical data: back up (`pg_dump`), then drop `communication_deliveries` and `communication_templates`.
- **D8** Follow-up `send_email` action: switch to a direct `MailService` call (recommended) or remove the action type.
- **D9** Repo convention: OK to delete or trim old schema files `024`/`026`, and `025` down to `is_platform_admin` only?

## 3. Phase 0: audit in production (read-only)

```sql
-- Real templates vs seeded placeholders
SELECT (organization_id IS NULL) AS system, channel_type, event_type, is_active,
       provider_template_id LIKE 'PLACEHOLDER%' AS placeholder, count(*)
FROM integrations.communication_templates GROUP BY 1,2,3,4,5 ORDER BY 1,2,3;

-- What has actually been sent through templates recently
SELECT event_type, channel_type, status, count(*)
FROM integrations.communication_deliveries
WHERE created_at > now() - interval '60 days' GROUP BY 1,2,3 ORDER BY 1,2,3;

-- Orgs that configured branding / toggles
SELECT count(*) FILTER (WHERE settings ? 'branding')                 AS with_branding,
       count(*) FILTER (WHERE settings ? 'notification_preferences') AS with_prefs
FROM core.organizations;
```
Plus: API-key request logs for `/communications/*`, and a grep of the agentic-response repo and n8n.
If real (non-placeholder) email templates are in use, contacts will see the inline design after removal.
Tell stakeholders beforehand.

## 4. Phase 1: code removal (one PR, tables untouched, can be reverted)

### API (`apps/api`)
- Delete `src/modules/communications/` (module, controller, 2 services, queue service, processor, constants, 2 entities, 2 DTOs).
- `app.module.ts`: drop the `CommunicationsModule` import.
- Remove `CommunicationsModule` from the imports of `auth.module.ts`, `ai-automation.module.ts`, `automation-engine.module.ts`,
  `billing.module.ts`, `notifications/notifications.module.ts`.
- `auth/auth.service.ts`: replace the dispatcher with `MailService` (global module) and an inline reset email (D1).
- `common/middleware/tenant-context.middleware.ts`: remove the dispatcher, welcome dispatch, `CommunicationEventType`/`ChannelType` imports (D2).
- `billing/subscription.service.ts`: remove `dispatchBillingEmail` and the 4 calls, or replace with inline mail (D3).
  Keep `findBillingContact` (also used in `createStripeCustomer`).
- `notifications/billing-event.consumer.ts`: delete `dispatchToAdmins` and the `UserEntity` repo injection; keep `analyticsService.track`.
- `notifications/appointment-email.consumer.ts`: delete the private `dispatch()` and every call to it. The inline
  `mailService.send` / `smsService.send` become unconditional. The reschedule branch becomes `if (data.status !== 'scheduled')`.
  SMS per D4. Drop the dispatcher constructor argument.
- `automation-engine/handlers/send-email.handler.ts`: use `MailService` directly (D8).
- `ai-automation/tool-execution.service.ts`: remove the unused injection and the `ToolContext` field.
- `organizations/`: remove `PATCH me/branding` and `PATCH me/notifications`, `updateBranding` and `updateNotificationPreferences`,
  `dto/update-branding.dto.ts` and `dto/update-notification-preferences.dto.ts` (D5).
- `src/metadata.ts` (generated by the Swagger plugin, committed): regenerate with `nest build`. It holds `import()`s of the deleted files, so typecheck fails until it is regenerated.
- `config/configuration.ts`: nothing required. `mail.*` and `sms.*` stay.
- Tests: `notifications/appointment-email.consumer.spec.ts`: remove the `dispatch` mock and its constructor argument,
  delete "uses the org templates when they exist", drop the `dispatch` assertions in the follow-up and reminder tests.
  Add specs for the password-reset mail and the send_email handler.

### Shared (`packages/shared`)
- `enums/index.ts`: delete `CommunicationEventType`, `PLATFORM_EVENT_SET`, `ORG_COMMUNICATION_EVENTS`, `PLATFORM_COMMUNICATION_EVENTS`.
- Delete `types/communications.types.ts` and its export in `types/index.ts` / `index.ts`.
- `types/tenant.types.ts`: delete `OrganizationBranding`, `NotificationPreferences`, `branding?`, `notification_preferences?`
  (and the unused `custom_branding`).

### Web (`apps/web`)
- Delete `src/app/(dashboard)/config/communications/` (page + 9 components, including `template-engine.ts`).
- Delete `src/hooks/useCommunications.ts`, `src/services/communications.service.ts` and `.test.ts`.
- `components/layout/sidebar-nav.ts`: remove "Communications" from `PLATFORM_ITEMS` and "Notifications" from the Messaging
  group (the group keeps "Quick replies"). Remove the `Mail` icon import if it becomes unused.
- `components/layout/header.tsx`: remove the `'/config/communications'` title entry.
- `hooks/useOrganizations.ts`, `services/organizations.service.ts` (+ test): remove the branding and notification mutations and types.
- `admin/api-keys/_components/ApiDocsSection.tsx`: remove the "Communications" API-docs section.
- Visual tests: `visual/regression.spec.ts` (remove the "communication templates (platform admin)" test),
  `visual/support/api-mock.ts` (remove `SYSTEM_TEMPLATES`, the shared-enum import and the 5 `/communications/*` routes),
  delete `visual/__screenshots__/regression.spec.ts/communication-templates.png`.
- Optional: in `next.config.ts`, redirect `/config/communications` → `/` for old bookmarks.

### Verification
`pnpm typecheck && pnpm lint && pnpm test`, the visual suite, then `grep -ri "communication" apps packages`.
Only the kept items in §0 should match.
Manual checks: forgot-password email arrives, booking confirmation with `.ics`, reschedule, cancel, reminder,
follow-up `send_email` step, Stripe test webhooks (no duplicate or unexpected mail), platform sidebar, org sidebar.

## 5. Phase 2: database cleanup (separate PR, after Phase 1 is fully rolled out)
TypeORM runs migrations at boot (`migrationsRun: true`), so this must not ship together with Phase 1.
Old pods would still query the tables during a rolling deploy.

1. Back up: `pg_dump -t integrations.communication_templates -t integrations.communication_deliveries`.
2. New `packages/database/schemas/057_drop_communications.sql` (idempotent) plus a mirror TypeORM migration in
   `apps/api/src/migrations/` (repo convention "Mirrors packages/database/schemas/…"):
   ```sql
   DROP TABLE IF EXISTS integrations.communication_deliveries;   -- FK child first
   DROP TABLE IF EXISTS integrations.communication_templates;
   UPDATE core.organizations
     SET settings = settings - 'branding' - 'notification_preferences'
     WHERE settings ?| array['branding','notification_preferences'];
   ```
3. `db:migrate` re-runs every schema file on each run, so (D9): delete `024_…` and `026_…`, and trim `025_…` to the
   `is_platform_admin` column only. **Do not delete 025 entirely.**
4. `apps/api/scripts/reset-org-data.cjs`: remove both tables from its lists.
5. Redis: `comm:tpl:*` keys expire on their own (5 min). Optionally delete the `bull:communication_dispatch:*` keys.
6. `.env.example`: no change (never documented the module's variables).

## 6. Risks
| Risk | Mitigation |
|---|---|
| Password reset breaks | D1 is mandatory in Phase 1, with a test |
| External consumer of `/api/v1/communications` | Phase 0 log/grep check (D6) |
| Contacts see a different email design | Phase 0 audit; tell stakeholders |
| Loss of delivery audit history | Backup before Phase 2 (D7) |
| Rolling deploy hits dropped tables | Two-phase rollout |
| Losing the platform-admin flag | Keep the `025` column statement |

## Follow-up audit (events, listeners, dependencies, hardcoded templates)
- Built-in platform emails live in apps/api/src/infrastructure/mail/email-templates.ts.
- MailService: an empty MAIL_FROM now falls back instead of sending with an empty sender. The email/SMS
  variables in .env.example now match what the code reads.
- Open items not changed (see the chat summary): ThrottlerGuard is not registered, so @Throttle does nothing;
  the demo-ready fallback HTML is not escaped; the AI send_email tool sends unescaped HTML; appointment,
  payment-failed and payments-attention emails are still in Spanish.

## Round 3: rate limits, secure emails, English everywhere, {{placeholders}}
- Rate limiting is now enforced by OptInThrottlerGuard (common/guards/opt-in-throttler.guard.ts, the first APP_GUARD).
  Only routes with @Throttle are limited: auth forgot/reset, demo init/submit/status/experience, the public
  appointment pages, the payment return page, the public plans list and ai/tools/execute. Provider webhooks,
  ingest, voice resolve and health are never limited (pinned by a test). Callers are counted by user, by
  organization for API keys, otherwise by IP. main.ts sets "trust proxy" (TRUST_PROXY) so req.ip is the real client.
- The demo-ready email and the AI send_email/send_sms tools are secured: every value is escaped, and input is validated and length-capped.
- All outbound content is in English: emails, SMS, follow-up messages, public appointment and payment pages,
  the ICS alarm, in-app notifications, payment texts for the AI agent and webhooks, and API error messages.
- Copy lives in infrastructure/messaging/catalog.ts with {{placeholders}} (documented in TEMPLATE_VARIABLES).
  Every personal message greets with {{user_name}}; appointment messages carry {{appointment_*}}, {{location}},
  {{organization_name}} and the links.
