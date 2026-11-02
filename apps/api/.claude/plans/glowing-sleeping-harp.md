# Plan: Secuencias de Follow-up MVP (v2)

## Contexto

Sistema de secuencias automáticas de seguimiento. Un solo follow-up pendiente a la vez por contacto. El CRM controla toda la lógica. La IA solo genera el mensaje vía n8n. Si el contacto responde, la secuencia se cancela.

## Feedback incorporado

1. **Sin `awaiting_ai`** — appointment se queda en `processing` mientras n8n responde
2. **Estados sequence simplificados**: `active | completed | cancelled | exhausted` + campo `completion_reason`
3. **Sin `current_appointment_id`** — se obtiene con query `WHERE sequence_id = ? AND status = 'pending'`
4. **Sin `channel_strategy` en sequence** — se reutiliza el del appointment
5. **Nombre genérico**: `AutomationSequence` (escalable a reactivación, cobranza, post-servicio, etc.)
6. **Campo `sequence_type`**: `no_response | appointment_reminder | post_service | reactivation | manual` — da contexto a la IA para generar el mensaje apropiado
7. **Disparadores definidos**: manual (UI/API), n8n tool (`create_follow_up_sequence`), y futuros event-driven triggers

## Secuencia Fija MVP

| Intento | Delay |
|---------|-------|
| 1 | +2h desde creación |
| 2-7 | +24h desde el anterior |

Máx 7 intentos. Si contacto responde → `completed` (reason: `responded`).

## Flujo

```
Disparador (manual / n8n tool / futuro event)
  ↓
POST /api/v1/automation/sequences → Crea AutomationSequence (status=active) + 1er Appointment (due=now+2h)
  ↓
Cron (1 min) detecta appointment vencido
  ↓
¿Contacto respondió? (inbound msg después de sequence.started_at)
  SÍ → sequence.status='completed', completion_reason='responded', cancelar appointment
  NO ↓
¿Tiene message_content?
  SÍ → Enviar directo
  NO → Trigger n8n (follow_up.due) → n8n genera msg → send_message tool → complete_follow_up tool
  ↓
Post-envío:
  attempt >= 7 → sequence.status='exhausted'
  attempt < 7  → Crear siguiente appointment (+24h), sequence.current_attempt++
```

---

## Cambios

### 1. Migration — `028_automation_sequences.sql`

```sql
CREATE TABLE scheduling.automation_sequences (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES core.organizations(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES clients.contacts(id) ON DELETE CASCADE,
  conversation_id UUID,
  sequence_type VARCHAR(30) NOT NULL DEFAULT 'no_response',
  current_attempt INT NOT NULL DEFAULT 1,
  max_attempts INT NOT NULL DEFAULT 7,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  completion_reason VARCHAR(30),
  source VARCHAR(50) NOT NULL DEFAULT 'manual',
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_sequence_active_contact
  ON scheduling.automation_sequences (organization_id, contact_id)
  WHERE status = 'active';

CREATE INDEX idx_sequence_org_status
  ON scheduling.automation_sequences (organization_id, status);

ALTER TABLE scheduling.appointments
  ADD COLUMN IF NOT EXISTS sequence_id UUID
  REFERENCES scheduling.automation_sequences(id) ON DELETE SET NULL;

CREATE INDEX idx_appointments_sequence
  ON scheduling.appointments (sequence_id) WHERE sequence_id IS NOT NULL;
```

### 2. Shared Types — `packages/shared/src/types/automation.types.ts`

```typescript
export type SequenceType = 'no_response' | 'appointment_reminder' | 'post_service' | 'reactivation' | 'manual';
export type SequenceStatus = 'active' | 'completed' | 'cancelled' | 'exhausted';
export type CompletionReason = 'responded' | 'max_attempts' | 'manual' | 'workflow';

export interface CreateSequenceInput {
  contact_id: string;
  conversation_id?: string;
  sequence_type?: SequenceType;
  source?: string;
  metadata?: Record<string, unknown>;
}

export const SEQUENCE_DELAYS_HOURS = [2, 24, 24, 24, 24, 24, 24];
```

### 3. Nueva entity — `automation-engine/automation-sequence.entity.ts`

Campos: id, organization_id, contact_id, conversation_id, sequence_type, current_attempt, max_attempts, status, completion_reason, source, started_at, completed_at, metadata, created_at, updated_at.

### 4. Appointment entity — agregar `sequence_id`

```typescript
@Column({ type: 'uuid', nullable: true })
sequence_id: string;
```

Sin relación ManyToOne (evitar circular). Query directa cuando se necesite.

### 5. Nuevo servicio — `automation-engine/automation-sequence.service.ts`

Inyecta: AutomationSequenceEntity repo, AppointmentEntity repo, MessageEntity repo, ConversationEntity repo.

Métodos:
- **`create(orgId, dto)`** — Valida no existe activa para ese contacto. Crea sequence + primer appointment (action='send_message', due_at=now+2h, origin='automation', sequence_id). Retorna sequence.
- **`cancel(orgId, sequenceId, reason='manual')`** — Marca sequence cancelled + cancela appointment pendiente.
- **`checkContactResponded(orgId, contactId, since: Date)`** — Raw query: `SELECT 1 FROM conversations.messages m JOIN conversations.conversations c ON c.id = m.conversation_id WHERE c.contact_id = $1 AND c.organization_id = $2 AND m.direction = 'inbound' AND m.sent_at > $3 LIMIT 1`
- **`advanceOrComplete(sequenceId)`** — Si current_attempt >= max_attempts → status='exhausted'. Si no → current_attempt++, crear siguiente appointment (+24h).
- **`markCompleted(sequenceId, reason)`** — status='completed', completion_reason, completed_at.
- **`findByAppointmentId(appointmentId)`** — Query appointment.sequence_id → find sequence.
- **`findAll(orgId, filters)`** — Lista con paginación.
- **`findById(orgId, id)`** — Detalle.
- **`findActive(orgId, contactId)`** — Busca sequence activa.

### 6. Modificar ActionExecutionService — `action-execution.service.ts`

Inyectar `AutomationSequenceService`.

**Antes de ejecutar handler** (si appointment tiene sequence_id):
```
1. Obtener sequence
2. checkContactResponded(orgId, contactId, sequence.started_at)
3. Si respondió → markCompleted(sequenceId, 'responded') + markCompleted(appointmentId) → return
```

**Después de handler exitoso** (si appointment tiene sequence_id):
```
1. advanceOrComplete(sequenceId)
```

### 7. IActionHandler — `action-handler.interface.ts`

Cambiar return: `Promise<void>` → `Promise<ActionResult>`

```typescript
export interface ActionResult { completed: boolean; channel?: string; }
```

### 8. SendMessageHandler — `send-message.handler.ts`

Inyectar `@Optional() @Inject(AGENT_TRIGGER_QUEUE) agentQueue?: Queue` y `AgentTriggerService`.

- Si `message_content` existe → enviar directo → `{ completed: true, channel }`
- Si no:
  - Buscar agentes con trigger_event `follow_up.due` para esta org
  - Si hay agente → encolar en agentQueue con payload mínimo → `{ completed: true, channel }` (el appointment se queda en processing, n8n llama complete_follow_up)
    - **NOTA**: return completed=true aquí porque la ejecución del handler terminó exitosamente. El appointment ya está en `processing`. n8n lo completa vía tool.
    - **Corrección**: En realidad no podemos marcar completed antes de que n8n envíe. Solución: el handler retorna `{ completed: false }` y el ActionExecutionService NO llama markCompleted. El appointment queda en `processing`. n8n llama `complete_follow_up` tool que marca completed y avanza la secuencia. Si n8n no responde, el cron no lo re-procesa (ya está en `processing`). Se puede agregar un timeout/cleanup cron futuro.
  - Si no hay agente → fallback: enviar genérico → `{ completed: true, channel }`

Payload para n8n:
```json
{
  "event_type": "follow_up.due",
  "organization_id": "...",
  "contact_id": "...",
  "conversation_id": "...",
  "payload": {
    "appointment_id": "...",
    "sequence_type": "no_response",
    "follow_up_number": 3,
    "total_follow_ups": 7,
    "days_without_response": 2
  }
}
```

### 9. Otros handlers — return ActionResult

SendEmailHandler, NotifyAgentHandler, CreateTaskHandler, CallHandler:
- `return { completed: true, channel: resolved?.channel }`

### 10. ActionExecutionService — manejar ActionResult

```typescript
const result = await handler.execute(appt, contact, resolved, org);

if (result.completed) {
  await this.automatedAppointmentService.markCompleted(appointmentId, result.channel);
  // Si tiene sequence_id → advanceOrComplete
  if (appt.sequence_id) {
    await this.sequenceService.advanceOrComplete(appt.sequence_id);
  }
  // emit events...
}
// Si !result.completed → no hacer nada. Appointment queda en 'processing'.
// n8n completará vía complete_follow_up tool.
```

### 11. Tool Registry — `tool-execution.service.ts`

Agregar a TOOL_REGISTRY:

**`get_conversation_history`**: Input: `{ contact_id, conversation_id?, limit? }`. Busca conversaciones del contacto, retorna últimos N mensajes con direction, content, sent_at, sender_type.

**`complete_follow_up`**: Input: `{ appointment_id, channel? }`. Marca appointment completed. Si tiene sequence_id → advanceOrComplete. Retorna `{ success: true }`.

**`create_follow_up_sequence`**: Input: `{ contact_id, conversation_id?, sequence_type?, source? }`. Crea nueva secuencia. Este es el disparador principal desde n8n.

Expandir `ToolContext` con `automationSequenceService` y `automatedAppointmentService`.
Inyectar ambos en `ToolExecutionService` (con @Optional).

### 12. ConversationManagementService — nuevo método

`findByContactId(orgId, contactId)` → conversaciones ordenadas por last_message_at DESC.

### 13. Controller — `automation-engine.controller.ts`

Nuevos endpoints (ANTES de los /:id existentes):
- `POST /sequences` — crear secuencia
- `GET /sequences` — listar (query: status, contact_id, sequence_type)
- `GET /sequences/:id` — detalle
- `PATCH /sequences/:id/cancel` — cancelar

### 14. Module — `automation-engine.module.ts`

- Agregar `AutomationSequenceEntity` a TypeOrmModule.forFeature
- Agregar `MessageEntity` a TypeOrmModule.forFeature
- Agregar `AutomationSequenceService` a providers + exports

### 15. Frontend — `appointment-drawer.tsx` (cambios mínimos)

Cuando calendar es follow_up, mostrar:
- Select "Tipo de seguimiento": No response / Recordatorio / Post-servicio / Reactivación / Manual
- Canal override opcional (Auto / WhatsApp / SMS / Email)
- Textarea "Mensaje (opcional)" — placeholder: "Dejar vacío para mensaje generado por IA"
- Info text: "Se enviará máximo 7 mensajes. Se cancela si el contacto responde."
- Botón: "Iniciar secuencia"

Submit llama `POST /api/v1/automation/sequences`.

### 16. Frontend service + hooks

`automation.service.ts`: createSequence, listSequences, getSequence, cancelSequence
`useAutomation.ts`: useSequences, useCreateSequence, useCancelSequence

---

## Archivos (orden)

| # | Archivo | Cambio |
|---|---------|--------|
| 1 | `packages/database/schemas/028_automation_sequences.sql` | NUEVO |
| 2 | `packages/shared/src/types/automation.types.ts` | MODIFICAR |
| 3 | `apps/api/.../automation-engine/automation-sequence.entity.ts` | NUEVO |
| 4 | `apps/api/.../scheduling/appointment.entity.ts` | MODIFICAR (+sequence_id) |
| 5 | `apps/api/.../conversation-management/conversation-management.service.ts` | MODIFICAR (+findByContactId) |
| 6 | `apps/api/.../automation-engine/automation-sequence.service.ts` | NUEVO |
| 7 | `apps/api/.../automation-engine/handlers/action-handler.interface.ts` | MODIFICAR |
| 8 | `apps/api/.../automation-engine/handlers/send-message.handler.ts` | MODIFICAR |
| 9 | `apps/api/.../automation-engine/handlers/send-email.handler.ts` | MODIFICAR |
| 10 | `apps/api/.../automation-engine/handlers/notify-agent.handler.ts` | MODIFICAR |
| 11 | `apps/api/.../automation-engine/handlers/create-task.handler.ts` | MODIFICAR |
| 12 | `apps/api/.../automation-engine/handlers/call.handler.ts` | MODIFICAR |
| 13 | `apps/api/.../automation-engine/action-execution.service.ts` | MODIFICAR |
| 14 | `apps/api/.../automation-engine/automated-appointment.service.ts` | MODIFICAR (minor) |
| 15 | `apps/api/.../ai-automation/tool-execution.service.ts` | MODIFICAR (+3 tools) |
| 16 | `apps/api/.../automation-engine/automation-engine.controller.ts` | MODIFICAR (+endpoints) |
| 17 | `apps/api/.../automation-engine/automation-engine.module.ts` | MODIFICAR |
| 18 | `apps/web/src/services/automation.service.ts` | MODIFICAR |
| 19 | `apps/web/src/hooks/useAutomation.ts` | MODIFICAR |
| 20 | `apps/web/src/components/agenda/appointment-drawer.tsx` | MODIFICAR |

## Verificación

1. Ejecutar migration en Supabase
2. Deploy
3. **Test crear**: Crear secuencia → verifica sequence(active) + appointment(pending, due=+2h)
4. **Test cron**: Esperar ejecución → sin respuesta → envía mensaje → crea siguiente appointment(+24h)
5. **Test respuesta**: Contacto envía mensaje inbound → próximo tick cancela secuencia (reason=responded)
6. **Test n8n**: Agente con trigger `follow_up.due` recibe payload → usa tools → mensaje enviado
7. **Test exhausted**: 7 intentos sin respuesta → sequence.status='exhausted'
8. **Test unicidad**: Intentar 2 sequences activas para mismo contacto → error (unique index)
9. **Test tool n8n**: `create_follow_up_sequence` tool desde n8n → crea secuencia correctamente
