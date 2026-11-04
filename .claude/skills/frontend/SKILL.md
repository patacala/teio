---
description: |
  Next.js frontend rules for the CRM web app. Auto-triggers when writing
  pages, components, hooks, or services in apps/web/.
paths: "apps/web/**"
allowed-tools: Read Grep Glob Bash(graphify *) Bash(pnpm --filter @crm/web *)
---

# CRM Frontend — Rules

Before writing frontend code, enforce every rule below. Violations are bugs.

## Quick Reference

- **Stack**: Next.js 15 App Router + Tailwind v4 (CSS-first `@theme`) + Radix UI + CVA + Framer Motion + TanStack Query v5
- **Auth**: Supabase SSR + `authClient` from `@/lib/auth-client`
- **Icons**: `lucide-react` only
- **Theme**: Dark-only ("Premium Dark AI Dashboard"). Single theme, no `dark:` variants, no theme switcher.

## Color Tokens (STRICT)

Defined once in `src/app/globals.css` (`@theme`). Never use raw hex, `gray-*`, `white` surfaces or `blue-*` in components.

| Token | Class | Use |
|-------|-------|-----|
| App background | `bg-app` (body uses `app-canvas`) | Page canvas |
| Surface | `bg-surface` / `panel-card` | Cards, panels, modals, drawers, sidebar |
| Raised | `bg-surface-raised` / `inset-surface` | Inputs, rows, inset groups, menus |
| Hover / pressed | `bg-surface-hover` / `bg-surface-pressed` | Interactive states |
| Border | `border-subtle` / `border-strong` | Default borders / control borders |
| Text | `text-primary` / `text-secondary` / `text-muted` | Primary / secondary / hints, axes, placeholders |
| Accent | `bg-accent text-on-accent`, `text-accent` | Primary action, selection, active nav |
| Olive | `bg-olive-dark`, `nav-item-active`, `icon-tile`, `action-surface` | Active/selected tints, icon containers, quick actions |
| Status | `text-success` / `text-danger` / `text-warning` / `text-info` (+ `/10` bg, `/25` border) | Badges, trends, errors |
| Charts | `chart-lime`, `chart-purple`, `chart-cyan`, `chart-pink`, `chart-yellow` | Data series only |

**Forbidden**: blue/indigo/violet as brand or button color (data series only), saturated solid backgrounds, large glows, custom hex, `bg-white`.

## Critical Rules

1. **Radix over native**: If a component exists in `src/components/ui/`, use it. Never `<select>`, `<dialog>`, native.
2. **Data flow**: Page → Hook → Service → authClient. Never call authClient from a component.
3. **Toast**: `import { toast } from '@/hooks/useToast'`. Variant `'error'` not `'destructive'`.
4. **Pagination**: `PaginatedResponse` uses `.items` field, never `.data`.
5. **Enums**: Import from `@crm/shared`. Never hardcode `'whatsapp'` or `'admin'`.
6. **Skeletons**: Every list/table shows `<Skeleton>` while loading. Always empty state too.
7. **Cache**: After mutations, always `invalidateQueries({ queryKey: ['domain'] })`.
8. **Responsive**: Grid with `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4`.
9. **Language: English, always.** Every user-facing string — labels, headings,
   buttons, placeholders, toasts, empty states, error messages — is English.
   No exceptions, no mixing, regardless of what any single existing page
   happens to do (the app is inconsistent today; new/edited code must not be).
   Confirmed 2026-09-28 after this got built in Spanish by mistake.
10. **File uploads**: native `<input type="file">` is the one accepted
    exception to rule 1 — there is no Radix alternative, browsers require the
    real element to trigger the OS picker. Send it as `FormData` via
    `authClient.uploadFile()` (added 2026-09-28), never JSON-encode a file.

## Architecture Layers

```
Page (layout + orchestration, no logic)
  → Hook useXxx (data fetching, mutations, cache)
    → Service xxxService (HTTP via authClient, typed)
      → authClient (token mgmt, error parsing)
```

For detailed patterns (component library, Framer Motion, avatar/badge patterns), see [references/](references/).

$ARGUMENTS
