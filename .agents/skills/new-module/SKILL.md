---
description: |
  Creates a complete full-stack module: SQL migration, entity, service,
  controller, NestJS module, frontend service, hook, and page.
  Use when the user asks to create something new from scratch.
arguments: [name]
disable-model-invocation: true
allowed-tools: Read Grep Glob Write Edit Bash(graphify *) Bash(pnpm *)
---

# Create Module: $name

You are going to create a complete full-stack module. Follow this exact order:

## Step 1 — SQL migration

1. Find the last number in `packages/database/schemas/` with `ls`
2. Create `packages/database/schemas/{N+1}_$name.sql`
3. Use `IF NOT EXISTS` for idempotency
4. Include `organization_id UUID NOT NULL` in every table
5. Include `created_at TIMESTAMPTZ DEFAULT NOW()` and `updated_at TIMESTAMPTZ DEFAULT NOW()`

## Step 2 — TypeORM entity

1. Create `apps/api/src/modules/$name/$name.entity.ts`
2. Map every SQL column with the correct types:
   - Arrays: `{ type: 'text', array: true, default: '{}' }`
   - JSON: `{ type: 'jsonb', default: {} }`
   - Timestamps: `{ type: 'timestamptz' }`
3. `@Index(['organization_id'])` is mandatory

## Step 3 — NestJS service

1. Create `apps/api/src/modules/$name/$name.service.ts`
2. Inject `@InjectRepository(Entity)`
3. ALL queries with `where: { organization_id }`
4. Methods: `findAll`, `findById`, `create`, `update`, `remove`
5. Pagination: `{ items, meta: buildPaginationMeta(...) }`

## Step 4 — NestJS controller

1. Create `apps/api/src/modules/$name/$name.controller.ts`
2. `@Controller('$name')` with `@ApiTags`
3. Static routes BEFORE routes with `:id`
4. Use `@CurrentTenant()` for the org context
5. `import type { Request } from 'express'` (never a value import)

## Step 5 — NestJS module

1. Create `apps/api/src/modules/$name/$name.module.ts`
2. Register the entity, service, and controller
3. Add it to the `imports` of `app.module.ts`

## Step 6 — Shared types

1. If there are new types, add them in `packages/shared/src/types/$name.types.ts`
2. If there are new enums, add them in `packages/shared/src/enums/index.ts`
3. Re-export from `packages/shared/src/index.ts`

## Step 7 — Frontend service

1. Create `apps/web/src/services/$name.service.ts`
2. Use `authClient.get/post/patch/delete`
3. Full request/response typing

## Step 8 — React Query hook

1. Create `apps/web/src/hooks/use$Name.ts`
2. `useQuery` for reads, `useMutation` for writes
3. `invalidateQueries` in the `onSuccess` of mutations
4. `staleTime: 30_000` on queries

## Step 9 — Page/Components

1. Create the page in `apps/web/src/app/(dashboard)/...`
2. Skeleton loading + empty state are mandatory
3. Use components from `@/components/ui/`
4. Colors: dark tokens only (bg-surface, bg-surface-raised, text-primary/secondary/muted, accent, border-subtle)
5. All user-facing text in English

## Step 10 — Verification

1. `pnpm --filter @crm/api build` must pass
2. `pnpm --filter @crm/web typecheck` and `pnpm --filter @crm/web lint` must pass
3. `graphify update .` to update the graph

$ARGUMENTS
