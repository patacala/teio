---
description: |
  Creates a new page in the Next.js frontend with service, hook,
  components, skeleton loading, and empty state.
arguments: [route, title]
disable-model-invocation: true
allowed-tools: Read Grep Glob Write Edit Bash(graphify *) Bash(pnpm --filter @crm/web *)
---

# New Page: $title at /$route

## Steps

### 1. Verify the backend endpoint

Confirm that the endpoints this page needs exist:
```bash
graphify query "$route controller routes API"
```

If they don't exist, create them first (use `/new-endpoint`).

### 2. HTTP service

Create `apps/web/src/services/$route.service.ts`:
- Only HTTP calls through `authClient`
- Fully typed responses

### 3. React Query hook

Create `apps/web/src/hooks/use[Name].ts`:
- `useQuery` with `staleTime: 30_000`
- `useMutation` with `invalidateQueries` in `onSuccess`
- `toast({ variant: 'error' })` in `onError`

### 4. Page

Create `apps/web/src/app/(dashboard)/$route/page.tsx`:
- `'use client'`
- Consumes hooks, never services directly
- Responsive layout: `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4`

### 5. Components

In `apps/web/src/app/(dashboard)/$route/_components/`:
- Skeleton loading is mandatory
- Empty state with icon + message
- Components from `@/components/ui/` (Radix)
- Colors: dark tokens from the frontend skill (lime accent, text-primary/secondary/muted, bg-surface)
- All user-facing text in English

### 6. Navigation

- Add an entry in the sidebar (`apps/web/src/components/layout/sidebar.tsx`)
- Add the title to the header mapping
- Icon from `lucide-react`

### 7. Verify

- `pnpm --filter @crm/web typecheck`
- `pnpm --filter @crm/web lint`
- `graphify update .`

$ARGUMENTS
