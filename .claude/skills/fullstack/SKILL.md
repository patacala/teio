---
description: |
  Full-stack rules for CRM features that touch both backend and frontend.
  Auto-triggers when a task requires changes in both apps/api/ and apps/web/.
paths: "apps/**"
allowed-tools: Read Grep Glob Bash(graphify *) Bash(pnpm *)
---

# CRM Full-Stack — Rules

When a feature crosses backend and frontend, enforce these cross-cutting rules.

## The Full-Stack Rule (Non-Negotiable)

> Never create a frontend service/hook calling a non-existent backend route.
> Never create a backend route without the frontend service that consumes it.
> Both sides ship together. Always.

## Checklist

- [ ] Backend: migration → entity → service → controller → module → AppModule
- [ ] Frontend: service method → hook → page/component
- [ ] Shared: types/enums in `packages/shared/` if new domain concepts

## API Contract

```
Frontend: authClient.get/post/patch/delete('/resource')
  ↕ HTTP JSON
Backend:  /api/v1/resource (controller → service → TypeORM)
  ↕ scoped by organization_id
PostgreSQL
```

- `NEXT_PUBLIC_API_URL` = `http://localhost:3001` (no trailing `/api`)
- `authClient` prepends `/api/v1` → services pass `/resource` only

## Response Shapes

- **Single**: `{ data: T, timestamp }` — authClient unwraps `data` automatically
- **Paginated**: `{ items: T[], meta: { total, page, limit, total_pages } }`

## Multi-Tenancy (System Invariant)

- Every table: `organization_id UUID NOT NULL`
- Every query: scoped by `organization_id`
- Every request: Bearer JWT encodes org via `@CurrentTenant()`
- Never accept `organization_id` in request body

## Auth Flow

```
Browser → Supabase → JWT → authClient header
  → TenantContextMiddleware → Redis cache → req.user + req.tenant
  → JwtAuthGuard → RolesGuard → @CurrentTenant()
```

## Error Handling E2E

| Layer | Tool |
|-------|------|
| Backend | `NotFoundException`, `BadRequestException`, etc. |
| authClient | Throws `Error(message)` on non-2xx |
| Hook | `error` from useQuery/useMutation |
| Component | `toast({ variant: 'error', title: err.message })` |

## Enums: Single Source of Truth

All string constants in `packages/shared/src/enums/index.ts`. Both apps import from `@crm/shared`.

For architecture diagrams and SOLID details, see [references/](references/).

$ARGUMENTS
