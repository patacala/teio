# Automations module (replaces legacy sequences)

## Objective
Apply the prebuilt patch (from `~/Downloads/bf993e58-...-final/changes.diff`) that
expands the old "Automation" nav group (which only had follow-up sequences) into a
real workflow engine: triggers, conditions, nodes (send message, add tag, create task,
AI, team), graph validator, runtime/run-scheduler, and a visual builder
(`AutomationBuilder`/`AutomationCanvas`) at `/config/automations`.

## Why
User wants org-level self-serve automations (workflows/rules/triggers), not just the
fixed no-response follow-up sequence. This diff was already prepared externally and
matches the architecture discussed (see conversation).

## Scope
- Apply `changes.diff` (202 files: apps/api automation-engine/workflows/*, apps/web
  components/automations/*, config/automations pages, sidebar-nav swap, hooks/services,
  packages/shared, packages/database schemas 058/059).
- Run `pnpm --filter @crm/database db:migrate` (applies 058_automations.sql then
  059_drop_legacy_sequences.sql).
- 059 is destructive/forward-only: drops legacy sequence tables + appointment
  follow-up columns. Its guard requires every org with legacy sequence data to have
  automations installed first (`POST /api/v1/automations/install-all`). User
  explicitly authorized running it ("si corrrela").
- Verify: apps/api typecheck/lint/test/build, apps/web typecheck/lint/test/build.

## Constraints
- Branch: `feat/automations-module` (created off main, which was clean).
- Do not hand-edit the patch content — it's a reviewed, pre-built diff matching the
  agreed design; apply as-is, only fix fallout from applying against current main
  (e.g. merge drift) if `git apply` fails on a file.
- Must call install-all (or confirm no org has legacy data to lose) BEFORE running
  059, or the migration aborts by design (safety guard, not a bug).

## Tasks
- [x] T1: Apply `changes.diff` with `git apply`, confirm clean tree matches diff stat.
      202 files, no fallback copies needed.
- [x] T2: Run `pnpm --filter @crm/database db:migrate` for schema 058 (automations
      tables). Applied cleanly.
- [x] T3: Checked the 059 guard precondition directly via SQL — all 4 existing
      sequence templates are global (`organization_id IS NULL`), no org had
      `sequences_enabled=false`, so `install-all` was not required. Ran 059
      (DropLegacySequences) — applied cleanly, legacy tables dropped.
- [x] T4: Verify apps/api: tsc 0 errors, eslint 0 errors, `nest build` succeeds.
      Jest against isolated `crm_test` DB: 973 passed, 3 failed (pre-existing
      `platform-analytics.integration.spec.ts` flake from parallel-worker DB races,
      unrelated to this patch), 976 total.
- [x] T5: Verify apps/web: tsc 0 errors, next lint 0 errors, `next build` succeeds
      (includes new `/config/automations` routes), vitest 566 passed / 9 skipped
      / 0 failed.
- [x] T6: Committed on `feat/automations-module` (dd5740c) — fast-forwarded from
      the isolated worktree where the agent did the work; worktree cleaned up.

## Progress
Done. Branch `feat/automations-module` has the full change, migrated and verified.
Known unrelated pre-existing issues (not introduced by this work, not fixed here):
- `031_events_partition_automation.sql` fails locally: `pg_cron` extension missing
  from the dev Postgres image.
- 3 flaky `platform-analytics` integration tests under parallel Jest workers on a
  shared DB (pre-existing race, not related to automations).

Next step: push `feat/automations-module` and open a PR — did not push or open PR,
that's the user's call per delivery policy.
