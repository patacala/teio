# Plan: Fix Arquitectura — Multi-tenancy, Capas, Performance

## Contexto

La revisión de código detectó vulnerabilidades de seguridad (multi-tenancy), violaciones de capas (HTTP en dominio, lógica en controllers), y problemas de performance (N+1 queries). Este plan corrige todos los issues sin cambiar funcionalidad.

## Reglas a seguir (de los skills)

- **Multi-tenancy**: Toda query scoped por `organization_id`. Sin excepciones.
- **Capas**: Controller → Service → Repository. Controllers sin lógica de negocio.
- **Auth**: Usar `@CurrentTenant()`, nunca `@Req() req: any`.
- **Enums**: Todo via `@crm/shared`, nunca magic strings.
- **Errores**: Usar `NotFoundException`, etc. Nunca raw `Error`.
- **Grafo**: Consultar graphify antes de leer archivos.

---

## Paso 1: Fix Multi-tenancy en AutomationSequenceService

**Archivo**: `apps/api/src/modules/automation-engine/automation-sequence.service.ts`

Agregar `organizationId` como parámetro a todos los métodos internos que no lo tienen:

| Método | Cambio |
|--------|--------|
| `resetTimer(sequenceId)` | → `resetTimer(orgId, sequenceId)` + WHERE org_id |
| `advanceOrComplete(sequenceId)` | → `advanceOrComplete(orgId, sequenceId)` + WHERE org_id |
| `markCompleted(sequenceId, reason)` | → `markCompleted(orgId, sequenceId, reason)` + WHERE org_id |
| `findByAppointmentId(appointmentId)` | → `findByAppointmentId(orgId, appointmentId)` + WHERE org_id en ambas queries |
| Contact tag update (línea ~74) | Agregar `organization_id: organizationId` al findOne |

Actualizar todos los callers de estos métodos en:
- `action-execution.service.ts` — pasar orgId del appointment
- `automation-engine.controller.ts` — pasar orgId del tenant

---

## Paso 2: Fix Multi-tenancy en AutomatedAppointmentService

**Archivo**: `apps/api/src/modules/automation-engine/automated-appointment.service.ts`

| Método | Cambio |
|--------|--------|
| `markCompleted(id, channel?)` | → `markCompleted(orgId, id, channel?)` + WHERE org_id |
| `markProcessing(id)` | → `markProcessing(orgId, id)` + WHERE org_id |
| `markFailed(id, error)` | → `markFailed(orgId, id, error)` + WHERE org_id |

Actualizar callers en:
- `action-execution.service.ts`
- `action-scheduler.cron.ts`
- `automation-engine.controller.ts`

---

## Paso 3: Fix Controller — @CurrentTenant() + mover lógica al service

**Archivo**: `apps/api/src/modules/automation-engine/automation-engine.controller.ts`

1. Reemplazar `@Req() req: any` con `@CurrentTenant() tenant: TenantContext` en TODOS los endpoints
2. Mover lógica de `completeFollowUp` al service:
   - Crear `AutomatedAppointmentService.completeFollowUp(orgId, appointmentId)` que internamente: markCompleted + findByAppointmentId + advanceOrComplete
   - Controller solo llama: `this.service.completeFollowUp(tenant.organization_id, id)`

---

## Paso 4: Fix HTTP en capa incorrecta — Meta Graph API

**Problema**: `ClientManagementService.fetchMetaProfileName()` hace `fetch()` a la Graph API de Meta. El servicio de dominio no debe hacer HTTP.

**Solución**: Mover la lógica al lugar correcto.

1. **Crear método en `ChannelsService`** (ya está en la capa de integrations, ya hace `fetch()` a Meta en `testConnection`):
   - `async fetchSenderProfile(channelType: string, senderId: string, accessToken: string): Promise<{ name?: string; username?: string }>`
   - Solo llama a Graph API si channel es `facebook` o `instagram`

2. **En `ConversationManagementService.ingestMessage()`** (ya tiene acceso a `channelsService` y `clientService`):
   - Si contacto nuevo/sin nombre Y canal es facebook/instagram → llama `channelsService.fetchSenderProfile()` para obtener nombre
   - Pasa el nombre resuelto como `displayName` a `findOrCreateByChannel()`
   - Fire-and-forget si contacto existente sin nombre

3. **Eliminar** `fetchMetaProfileName()` de `ClientManagementService` y el parámetro `accessToken` de `findOrCreateByChannel()`

---

## Paso 5: Fix N+1 en SendMessageHandler — query única para recent_messages

**Archivo**: `apps/api/src/modules/automation-engine/handlers/send-message.handler.ts`

**Problema**: Loop `for (conv of convs) { getMessages(conv.id) }` — N+1 queries.

**Solución**: Crear método dedicado en `ConversationManagementService`:

```typescript
async getRecentMessagesForContact(
  orgId: string,
  contactId: string,
  limit = 30,
): Promise<{ channel: string; direction: string; content: string; sent_at: Date }[]> {
  return this.messageRepo.query(`
    SELECT m.content, m.direction, m.sent_at, c.channel
    FROM conversations.messages m
    JOIN conversations.conversations c ON c.id = m.conversation_id
    WHERE c.contact_id = $1 AND c.organization_id = $2 AND m.content != ''
    ORDER BY m.sent_at DESC
    LIMIT $3
  `, [contactId, orgId, limit]);
}
```

Referencia: ya existe un patrón similar con `DISTINCT ON` en `findAll()` del mismo service (línea ~73).

En `SendMessageHandler`: reemplazar el loop N+1 con una sola llamada:
```typescript
const recentMessages = await this.conversationService.getRecentMessagesForContact(
  appointment.organization_id, contact.id, 30,
);
```

---

## Paso 6: Fix errores silenciados en SchedulingService

**Archivo**: `apps/api/src/modules/scheduling/scheduling.service.ts`

Agregar `Logger` al service y cambiar `.catch(() => {})` por `.catch(err => this.logger.warn(...))` en las llamadas a `sequenceService.cancel()`.

---

## Paso 7: Magic strings → Enums

**Archivos afectados**: `client-management.service.ts`, `conversation-management.service.ts`, `send-message.handler.ts`

- Reemplazar `'facebook'`, `'instagram'`, `'whatsapp'`, `'sms'`, `'email'` por `ChannelType.FACEBOOK`, `ChannelType.INSTAGRAM`, etc. de `@crm/shared`
- Reemplazar magic numbers `30` y `7` por constantes con nombre

---

## Archivos a modificar

| Archivo | Cambio |
|---------|--------|
| `automation-sequence.service.ts` | Multi-tenancy: orgId en resetTimer, advanceOrComplete, markCompleted, findByAppointmentId |
| `automated-appointment.service.ts` | Multi-tenancy: orgId en markCompleted, markProcessing, markFailed |
| `action-execution.service.ts` | Pasar orgId a todos los métodos corregidos |
| `action-scheduler.cron.ts` | Pasar orgId a markProcessing |
| `automation-engine.controller.ts` | @CurrentTenant() + mover lógica completeFollowUp al service |
| `client-management.service.ts` | Eliminar fetchMetaProfileName, quitar param accessToken |
| `conversation-management.service.ts` | Resolver nombre via ChannelsService, nuevo método getRecentMessagesForContact |
| `channels.service.ts` (integrations) | Nuevo método fetchSenderProfile |
| `send-message.handler.ts` | Usar getRecentMessagesForContact (1 query), eliminar loop N+1 |
| `scheduling.service.ts` | Logger + logging en catch |

---

## Orden de ejecución

1. Multi-tenancy (Pasos 1-2) — seguridad primero
2. Controller fix (Paso 3) — depende de paso 1-2
3. Meta Graph API en capa correcta (Paso 4)
4. N+1 fix (Paso 5)
5. Errores silenciados (Paso 6)
6. Magic strings (Paso 7)

## Verificación

1. `pnpm --filter @crm/api build` — 0 errores
2. Verificar que `completeFollowUp` requiere org válida (test con orgId incorrecto → 404)
3. Verificar que `resetTimer`, `advanceOrComplete` son org-scoped
4. Verificar que el webhook `follow_up.due` sigue incluyendo `recent_messages` (1 query)
5. Verificar que contactos de Facebook/Instagram resuelven nombre correctamente
