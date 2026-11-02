# Plan: Refactor Comunicaciones — Vistas diferenciadas + Template Matrix

## Contexto

La página de comunicaciones necesita vistas completamente distintas según el rol:
- **Platform admin**: gestiona plantillas del sistema (mapeo evento→proveedor). No necesita branding ni preview.
- **Org admin**: configura su identidad de marca, toggles de notificación y ve historial de envíos. No necesita CRUD de templates.

Los toggles de notificación están ocultos en un collapsible — deben ser más visibles. El historial debe ser tabla inline, no drawer. Templates usa navegación por páginas, no drawers apilados. Solo canales Email y SMS.

---

## Cambios ya implementados (no repetir)

- ✅ Tipos compartidos: `OrganizationBranding`, `NotificationPreferences` en tenant.types.ts
- ✅ Backend: `PATCH me/branding`, `PATCH me/notifications` en organizations controller/service
- ✅ Backend: Dispatch enrichment (branding vars + notification pref check)
- ✅ Backend: `communications.module.ts` incluye OrganizationEntity
- ✅ SQL seed: `026_system_communication_templates.sql`
- ✅ Frontend: `useMyOrganization`, `useUpdateBranding`, `useUpdateNotificationPreferences`
- ✅ Enum: `PLATFORM_EVENT_SET` auto-deriva `ORG_COMMUNICATION_EVENTS` y `PLATFORM_COMMUNICATION_EVENTS`
- ✅ Channel wizard: filtra email para no-platform-admin
- ✅ DeliveryLogDrawer: oculta provider para no-platform-admin

---

## Paso 1: Backend — Agregar `GET templates/system/:id`

**Archivo:** `apps/api/src/modules/communications/communications.controller.ts`

Falta un endpoint para obtener un template de sistema por ID. Agregar ANTES de `PATCH templates/system/:id`:

```typescript
@Get('templates/system/:id')
@PlatformAdmin()
findSystemTemplate(@Param('id', ParseUUIDPipe) id: string) {
  return this.templateService.findSystemById(id);
}
```

Si `findSystemById` no existe en el service, crearlo: query por `id + is_system=true`, throw NotFoundException si null.

---

## Paso 2: Frontend — Service + Hooks nuevos

**Archivo:** `apps/web/src/services/communications.service.ts`

Agregar 2 métodos:
- `getTemplateById(id)` → GET `/communications/templates/${id}`
- `getSystemTemplateById(id)` → GET `/communications/templates/system/${id}`

**Archivo:** `apps/web/src/hooks/useCommunications.ts`

Agregar 2 hooks:
- `useCommunicationTemplate(id)` — enabled: !!id, staleTime 30s
- `useSystemTemplate(id)` — enabled: !!id, staleTime 30s

---

## Paso 3: Crear `TemplateForm.tsx` (formulario compartido)

**Nuevo:** `apps/web/src/app/(dashboard)/config/communications/_components/TemplateForm.tsx`

Extraer del actual `TemplateManagerDrawer.tsx`:
- `EMPTY_FORM` (exportado)
- `groupEvents()` (exportada)
- `formatEventLabel()` (exportada)
- `getTemplateIdHelp()`
- `CHANNEL_TYPES` — **solo `email` y `sms`**
- `PROVIDERS` — resend, sendgrid, twilio, custom

Props:
```typescript
interface TemplateFormProps {
  form: typeof EMPTY_FORM;
  onChange: (form) => void;
  eventGroups: EventGroup[];
  saving?: boolean;
  onSubmit: () => void;
  onCancel: () => void;
  isEdit?: boolean;
}
```

Campos: evento (Select agrupado), canal+proveedor (grid 2 cols), template ID (con hint dinámico), nombre, descripción, from_override, prioridad + checkbox activa. Footer: Cancelar / Guardar.

---

## Paso 4: Crear `EventTemplateMatrix.tsx` (vista platform admin)

**Nuevo:** `apps/web/src/app/(dashboard)/config/communications/_components/EventTemplateMatrix.tsx`

Props: `{ systemTemplates: CommunicationTemplate[] }`

**Lógica:**
1. Construir lookup: `matrix[eventType] = { email?: template, sms?: template }`
2. Importar y usar ambos arrays de eventos del enum (ORG + PLATFORM)
3. Agrupar con `groupEvents()` → Citas, Contactos, Mensajes, Llamadas, Facturación, Plataforma

**Layout por grupo:**
```
<section>
  <h2 className="text-xs uppercase tracking-widest text-gray-400">CITAS</h2>
  <table className="rounded-xl border bg-white">
    <thead> Evento | Email | SMS </thead>
    <tbody>
      <tr> Appointment created | [chip ✓ resend] | [chip + crear] </tr>
    </tbody>
  </table>
</section>
```

**ChannelChip:**
- Existe: `bg-green-50 text-green-700 border-green-200` ✓ + provider → Link a `/config/communications/templates/[id]?system=true`
- No existe: `bg-gray-50 text-gray-400 border-dashed` + → Link a `/config/communications/templates/new?event=X&channel=Y&system=true`

---

## Paso 5: Crear `NotificationToggles.tsx` (extraído, prominente)

**Nuevo:** `apps/web/src/app/(dashboard)/config/communications/_components/NotificationToggles.tsx`

Extraer toggles del `EmailDesigner.tsx` SIN wrapper collapsible — siempre visible.

```typescript
interface Props {
  prefs: Record<string, { enabled: boolean }>;
  onToggle: (key: string) => void;
  onSave: () => void;
  saving?: boolean;
}
```

Grid de toggles (role="switch", pill animada), labels legibles, sección con título "Notificaciones automáticas". Botón "Guardar" al final.

---

## Paso 6: Crear `DeliveryLogTable.tsx` (tabla inline)

**Nuevo:** `apps/web/src/app/(dashboard)/config/communications/_components/DeliveryLogTable.tsx`

Self-contained con `useDeliveries(page, 20)` interno:
- Header: "Historial de envíos"
- Columnas: Evento (badge mono), Destinatario, Canal, Estado (StatusBadge), Fecha
- Oculta provider para no-platform-admin
- Paginación (prev/next)
- `rounded-xl border border-border bg-white`

---

## Paso 7: Crear sub-páginas de templates

### 7a. `templates/new/page.tsx`

**Nuevo:** `apps/web/src/app/(dashboard)/config/communications/templates/new/page.tsx`

- Lee query params: `?event=X&channel=Y&system=true`
- Pre-llena form
- `← Comunicaciones` (router.back)
- Título: "Nueva plantilla" + subtítulo sistema/organización
- Card con `<TemplateForm>`
- Guardar → mutation → router.back()

### 7b. `templates/[id]/page.tsx`

**Nuevo:** `apps/web/src/app/(dashboard)/config/communications/templates/[id]/page.tsx`

- Param `id` + query `?system=true`
- Fetch: `useSystemTemplate(id)` o `useCommunicationTemplate(id)`
- Loading / error states
- `← Comunicaciones` + botón Eliminar (rojo)
- Card con `<TemplateForm isEdit>`
- Actualizar / Eliminar → mutations → router.back()

---

## Paso 8: Reescribir `page.tsx` — bifurcación por rol

**Archivo:** `apps/web/src/app/(dashboard)/config/communications/page.tsx`

```tsx
if (isPlatformAdmin) → <EventTemplateMatrix systemTemplates={...} />
else → <EmailDesigner /> + <DeliveryLogTable />
```

- Sin botones "Historial" ni "Plantillas" en header
- Sin drawers
- Sin mutations en page.tsx
- Solo `useSystemTemplates()` para EventTemplateMatrix

---

## Paso 9: Modificar `EmailDesigner.tsx`

**Archivo:** `apps/web/src/app/(dashboard)/config/communications/_components/EmailDesigner.tsx`

- Eliminar collapsible de notificaciones (ChevronDown, estado `notifOpen`)
- Importar `<NotificationToggles>` como sección visible
- Posición en sidebar: ARRIBA de "Contenido de prueba" → más prominente
- Recibe props del estado existente en EmailDesigner

---

## Paso 10: Header titles

**Archivo:** `apps/web/src/components/layout/header.tsx`

```typescript
'/config/communications/templates/new': 'Nueva plantilla',
// Para [id] dinámico: prefix match → 'Plantilla'
```

---

## Paso 11: Eliminar archivos obsoletos

- `_components/TemplateManagerDrawer.tsx`
- `_components/DeliveryLogDrawer.tsx`

---

## Resumen de archivos

| # | Archivo | Acción |
|---|---------|--------|
| 1 | `apps/api/.../communications/communications.controller.ts` | +1 GET system/:id |
| 2 | `apps/web/src/services/communications.service.ts` | +2 métodos |
| 3 | `apps/web/src/hooks/useCommunications.ts` | +2 hooks |
| 4 | `.../_components/TemplateForm.tsx` | NUEVO |
| 5 | `.../_components/EventTemplateMatrix.tsx` | NUEVO |
| 6 | `.../_components/NotificationToggles.tsx` | NUEVO |
| 7 | `.../_components/DeliveryLogTable.tsx` | NUEVO |
| 8 | `.../templates/new/page.tsx` | NUEVO |
| 9 | `.../templates/[id]/page.tsx` | NUEVO |
| 10 | `.../communications/page.tsx` | REESCRIBIR |
| 11 | `.../_components/EmailDesigner.tsx` | MODIFICAR |
| 12 | `apps/web/src/components/layout/header.tsx` | +titles |
| 13 | `.../_components/TemplateManagerDrawer.tsx` | ELIMINAR |
| 14 | `.../_components/DeliveryLogDrawer.tsx` | ELIMINAR |

## Verificación

- `pnpm --filter @crm/api build`
- `pnpm --filter @crm/web typecheck`
- **Platform admin**: ve EventTemplateMatrix, chips ✓/+, click navega a sub-páginas, CRUD funciona
- **Org admin**: ve EmailDesigner con toggles visibles + DeliveryLogTable, NO ve templates
- **Sub-páginas**: crear pre-llenado, editar carga datos, eliminar redirige
- **Guard**: org admin accede a `/templates/[system-id]?system=true` → 403/404 del backend
