# Funnel Kanban card redesign (hot/normal) + Ventas funnel stage fix

## Context

The current `KanbanContactCard` only shows avatar/name/phone/last-activity — none
of the signals we just wired into the backend (`lead_score`, `ai_insights.{intent,
sentiment,summary}`, BANT/urgency-derived score) are visible anywhere in the
funnel. The user provided a detailed mockup (compact HOT/NORMAL card + expanded
detail panel opened on click) and wants that exact visual language — a real
"HOT" treatment with a quality flame icon, not another generic blue/gray status
chip — plus the Ventas funnel's stages fixed so they actually match what the
automation engine (`FunnelRulesService`) can act on.

Two decisions already made with the user:
- **No "Próxima acción recomendada" block** — dropped from this pass, add later.
- **No capture-field seeding** — the card must render correctly from whatever
  `custom_fields` happen to exist today (confirmed via Supabase: only
  `nombre`/`telefono` are configured; most real contacts have unrelated junk
  keys like `source`/`demo_type`, none have BANT or servicio/presupuesto yet).
  Empty/sparse states are the common case, not the mockup's fully-populated one.

## Data mapping (what drives what)

| Mockup element | Source |
|---|---|
| HOT vs NORMAL | `contact.lead_score >= 70` → hot (matches the existing `>=70` threshold used in `contact-profile-panel.tsx`) |
| Flame icon (hot) / bar-chart icon (normal) | `lucide-react`: `Flame` / `BarChart3` — confirmed both exist in the installed `lucide-react@0.468.0` |
| Score ring "87/100" | `contact.lead_score` — rendered by a new `LeadScoreGauge` (no gauge/radial component exists in the repo today; the only precedent, `LeadScoreCard.tsx`, uses a linear bar) |
| "Activo hace 18 min" pill | `contact.last_activity` — reuse the existing `relativeTime()` helper already in `KanbanContactCard.tsx` |
| Quote block ("Quiere agendar esta semana") | `contact.ai_insights.summary`, truncated. **Row is omitted entirely** if not present (common case today) |
| Intención / Sentimiento (expanded) | `contact.ai_insights.intent` / `.sentiment` — prettified (`positive`→"Positivo", etc.), row omitted if absent |
| Data boxes (compact, max 3) + "Datos recaudados" (expanded, all) | `contact.custom_fields` entries, **dynamic** — not hardcoded to servicio/presupuesto/financiamiento. Label = matching `CaptureField.field_label` if the org configured one for that key, else the key prettified (`snake_case` → "Snake Case"). Icon = small lookup table matching common key substrings (budget/presupuesto→`DollarSign`, financ→`Landmark`, timeline→`Calendar`, ubicacion/location→`MapPin`, servicio/service→`Car`), default `Tag` icon for anything unrecognized |
| Tags | `contact.tags`, first 2 + `+N` overflow chip (compact); full list (expanded) — same chip style as `TagsCard.tsx` |
| Llamar / WhatsApp / Enviar Email buttons | `tel:`, `https://wa.me/<digits>`, `mailto:` built from `contact.phone`/`contact.email`; button disabled/hidden if the field is missing |
| Ver Perfil | Existing `router.push('/contacts/${id}')`, same as today's `Eye` button |

No backend changes needed for any of this — `findAll()` already returns the
full `ContactEntity` (verified: no `.select()` narrowing), so `lead_score`,
`ai_insights`, `custom_fields`, `tags` are already in every Kanban API response.

## Components

**New files** (`apps/web/src/app/(dashboard)/config/funnel/_components/`):
- `LeadScoreGauge.tsx` — pure-SVG circular gauge (`<circle>` + `strokeDasharray`/
  `strokeDashoffset`), color driven by hot/normal, sized via props (`size`,
  `score`, `variant`). No new dependency — no charting lib is used anywhere
  else in the repo, so this stays consistent with existing conventions.
- `contactCardHelpers.ts` — pure functions: `isHot(contact)`, `fieldIcon(key)`,
  `fieldLabel(key, captureFields)`, `prettifySentiment(v)`, `waLink(phone)`.
- `ContactQuickView.tsx` — the expanded panel, built on the existing `Dialog`
  primitive (`apps/web/src/components/ui/dialog.tsx`) with `className="max-w-4xl"`
  override — matches the mockup's wide, centered, multi-column layout far
  better than the narrow `Drawer` (`max-w-sm`). Sections: header (avatar, name,
  phone+copy, score, HOT/NORMAL pill, activity pill, close X — all built into
  `DialogContent`/`DialogHeader` already), "Resumen IA" (summary + intent +
  sentiment), "Datos recaudados" (full custom_fields list), "Tags", action
  buttons row. Receives `contact` + `captureFields` as props; no own data
  fetching.

**Rewritten**:
- `KanbanContactCard.tsx` — keeps its existing `draggable`/`onDragStart` (HTML5
  drag suppresses the subsequent `click`, so adding an `onClick` to open
  `ContactQuickView` is safe alongside dragging — this is standard native
  browser behavior, no extra guard needed). New layout: avatar + name + phone
  header row, flame/bar-chart badge, HOT/NORMAL pill + activity pill row, score
  ring, optional quote row, up to 3 dynamic data boxes, tag chips + overflow.
  Visual split: **hot** = orange-500/600 solid background family (`bg-orange-500`
  → `bg-orange-600` gradient, white text) to match the mockup's saturated
  orange card; **normal** = neutral slate (`bg-white`/`border-border`,
  `text-gray-900`), i.e. two genuinely different visual registers, not the
  same layout in two accent colors.
- `KanbanColumn.tsx` — small change: pass `captureFields` down (fetched once
  per column's funnel via existing `useCaptureFields` hook scoped to the
  funnel's configured agent, if any) and render `<ContactQuickView>` gated by
  local `openContactId` state, next to the existing column markup.

No new colors invented outside Tailwind's existing orange/slate scales — this
satisfies "no lo mismo genérico" by using a real two-register system (saturated
hot card vs neutral normal card) instead of a same-shape card recolored by a
status enum, which is what the current design already half-does elsewhere in
the app.

## Ventas funnel stage fix

Verified in Supabase: `Cold` stage (`3b0487d2-…`, position 2) has **0 contacts**
— safe to delete outright, no reassignment needed. `Ventas` has no `won`
stage, so the existing "Deal won" automation rule (`appointment_confirmed`→
`won` on `appointment.completed`) can never fire.

Blocker found: `CreateFunnelStageDto`/`UpdateFunnelStageDto`
(`apps/api/src/modules/funnels/funnels.service.ts`) only accept
`name`/`color`/`position` — there is no way today, via the API or the existing
`StageListView.tsx` UI, to create a stage with `stage_type: 'won'`. Every
stage created through the UI defaults to `stage_type: 'custom'`, which the
automation engine ignores. This must be fixed for any org to ever add a stage
the rules engine can target — small, backward-compatible addition:
- Add optional `stage_type?`, `is_terminal?`, `rotting_days?` to both DTOs in
  `funnels.service.ts`, pass through in `createStage`/`updateStage`.
- Surface the same 3 fields on the frontend `FunnelStage` interface
  (`apps/web/src/services/funnels.service.ts`) and wire a `stage_type` select
  (using the known vocabulary: new/contacted/qualified/appointment_scheduled/
  appointment_confirmed/won/lost/custom) into `StageListView.tsx`'s add/edit
  form, defaulting to `custom` so existing flows are unaffected.

Then, for the live `Ventas` funnel specifically (one-off data change, via the
now-fixed API — no migration file needed, this is org data not schema):
- Delete `Cold`.
- Add `Won` stage (`stage_type: 'won'`, `is_terminal: true`) positioned right
  before `Lost`.
- Resulting order: New Lead → Contacted → Follow up → Qualified → Appointment
  Booked → Appointment Confirmed → **Won** → Lost.

`Follow up` stays — it's `stage_type: custom` but isn't a target of any rule
and doesn't sit between two stages a rule would traverse, so it doesn't break
`forward_only`; it remains a valid manual parking stage.

## Files touched

- `apps/web/src/app/(dashboard)/config/funnel/_components/KanbanContactCard.tsx` (rewrite)
- `apps/web/src/app/(dashboard)/config/funnel/_components/KanbanColumn.tsx` (small addition)
- `apps/web/src/app/(dashboard)/config/funnel/_components/LeadScoreGauge.tsx` (new)
- `apps/web/src/app/(dashboard)/config/funnel/_components/ContactQuickView.tsx` (new)
- `apps/web/src/app/(dashboard)/config/funnel/_components/contactCardHelpers.ts` (new)
- `apps/web/src/app/(dashboard)/config/funnel/_components/StageListView.tsx` (add `stage_type` field to the add/edit form)
- `apps/web/src/services/funnels.service.ts` (extend `FunnelStage`/DTOs with `stage_type`/`is_terminal`/`rotting_days`)
- `apps/api/src/modules/funnels/funnels.service.ts` (extend `CreateFunnelStageDto`/`UpdateFunnelStageDto`)
- One-off data script (not a migration) to fix the live `Ventas` funnel stages, run against Supabase the same way the last migration was applied

## Verification

- `pnpm --filter @crm/api typecheck` and `pnpm --filter @crm/web typecheck` clean.
- Visual check via the running dev server (already up on :3000): open Config →
  Funnel, confirm hot vs normal cards render distinctly, click a card to open
  `ContactQuickView`, confirm drag-and-drop between columns still works after
  adding `onClick`.
- Re-query `clients.funnel_stages`/`contacts` for the `Ventas` funnel after the
  data fix to confirm `Cold` is gone, `Won` exists with `stage_type='won'`,
  `is_terminal=true`, and no contact was left pointing at a deleted stage id.
