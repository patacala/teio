---
description: |
  Reviews CRM code for quality, security, and adherence to the project
  conventions. Use after implementing something to validate it.
allowed-tools: Read Grep Glob Bash(graphify *) Bash(pnpm *)
---

# Code Review

## Review checklist

### Architecture
- [ ] Layer separation respected (controller → service → repository)
- [ ] No business logic in controllers
- [ ] No direct HTTP calls in components (only through hooks)

### Multi-tenancy
- [ ] Every query scoped by `organization_id`
- [ ] `organization_id` is never accepted in the request body
- [ ] Uses `@CurrentTenant()` to get the org

### Security
- [ ] `import type` for express types (no value import)
- [ ] No hardcoded secrets
- [ ] Public webhooks use `@Public()` + HMAC verification
- [ ] No SQL injection (use QueryBuilder, not string concatenation)

### Enums and types
- [ ] No magic strings — everything through `@crm/shared` enums
- [ ] Granular DTOs (separate Create vs Update)
- [ ] Shared types in `packages/shared/`

### Frontend
- [ ] Dark design system colors (globals.css tokens; no gray-*, blue-*, bg-white or hex)
- [ ] Radix components, not native ones
- [ ] Skeleton + empty state in lists
- [ ] Toast with variant `'error'`, not `'destructive'`
- [ ] `invalidateQueries` in mutations
- [ ] All user-facing text in English

### Performance
- [ ] `staleTime` on queries (min 30s)
- [ ] Pagination with `buildPaginationMeta`
- [ ] Redis cache where it applies

### Routes
- [ ] Static routes BEFORE `:id` routes
- [ ] Backend and frontend in sync (same endpoint)

Report the issues found with file:line and a suggested fix.

$ARGUMENTS
