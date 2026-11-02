# Plan: Automatización del funnel (movimiento interno de etapas por eventos)

## Context

Hoy el CRM tiene funnels (`clients.funnel_stages`) pero **nada mueve a los contactos automáticamente**: `lead_stage` solo cambia si alguien lo hace a mano. `lead_score` se renderiza en el frontend pero **ningún backend lo calcula** (todos en 0). Existe un plan aprobado (2026-08-03, memoria `funnel-automation-plan`) que sigue vigente; se re-verificó hoy contra el código.

**Objetivo:** que el contacto avance por las etapas **solo**, en base a lo que ocurre (mensaje entrante, datos completados, cita agendada/confirmada/completada, secuencia agotada, etc.).

**Aclaración del usuario (define el alcance):** el movimiento de etapa es **interno y silencioso**. El CRM **NO** le informa al cliente sobre el cambio de pipeline y **NO** dispara mensajes por ello. n8n sigue encargándose de los mensajes al cliente con sus disparadores actuales; el funnel no lo notifica ni lo interrumpe.

**Contrato n8n↔CRM (verificado):**
- **CRM → n8n:** cada productor encola a `agentQueue` (`agent-trigger.processor.ts`) → POST al `workflow_endpoint` del `automation_agent` con `{organization_id, event_type, conversation_id, contact_id, agent_id, payload, contact, upcoming_appointments, payment_services, payment_currency}`. Ejemplo real: `conversation-management.service.ts:467` (`message.received`), `payments.service.ts:323` (`payment.received`).
- **n8n → CRM:** `POST /api/v1/ai/tools/execute` (Bearer) con `{agent_id, tool, input, conversation_id}` (`ai-tools-execute.controller.ts`). Tools en `tool-execution.service.ts` (`send_message`, `create_payment_link`, `create_appointment`, …).
- **Clave para el funnel:** los eventos que mueven etapas se emiten **cuando la acción pasa por el CRM**. Si n8n manda WhatsApp o agenda por fuera del CRM, el evento no existe y el funnel no avanza. Por eso la sección final documenta qué request debe hacer n8n para cada acción.

## Arquitectura

- **Motor de reglas in-app** (no en n8n): mover etapas es integridad de datos → transaccional, auditable, debe sobrevivir a que n8n esté caído. Todo pasa por el choke point `ClientManagementService.updateStage` (`client-management.service.ts:492`).
- Consume eventos vía consumers `@EventPattern` (patrón ya usado en `modules/notifications/*.consumer.ts`).
- **Sin hook de notificación a n8n en el cambio de etapa** (por decisión del usuario). El funnel no encola agent triggers.

## Fase 1 — Foundation (sin cambio visible; va primero)

Migración **`packages/database/schemas/037_funnel_semantics.sql`** (037 porque 033–036 ya están tomadas):
- `clients.funnel_stages`: `ADD COLUMN stage_type VARCHAR(30) NOT NULL DEFAULT 'custom'`, `is_terminal BOOLEAN NOT NULL DEFAULT FALSE`, `rotting_days INTEGER`.
- Mismo `stage_type` en `clients.funnel_template_stages` + backfill de las plantillas semilla (`018_funnel_templates.sql`).
- `clients.contact_funnel_history`: `ADD COLUMN source VARCHAR(20) NOT NULL DEFAULT 'manual'`, `reason TEXT`.
- Backfill `stage_type` por nombre para las etapas vivas (New Lead→new, Contacted→contacted, Qualified→qualified, Appointment Booked→appointment_scheduled, Appointment Confirmed→appointment_confirmed, Lost→lost, Won/Client Won→won, Follow up→custom, **Cold→custom**). `is_terminal = TRUE` donde `stage_type IN ('won','lost')`.

Código:
- Agregar `stage_type`/`is_terminal`/`rotting_days` a `FunnelStageEntity` y `source`/`reason` a `ContactFunnelHistoryEntity`.
- `updateStage(..., source='manual', reason?)`: nuevos params (default `'manual'`), persistidos en la fila de historial. Firma en `client-management.service.ts:492`.
- Carry `stage_type` en `FunnelsService.applyTemplate` (`funnels.service.ts:134`).
- **Emitir eventos faltantes** en `rabbitmq.constants.ts` y dispararlos: `appointment.completed`, `appointment.no_show` (desde `SchedulingService`), `contact.data.completed` (desde `ClientManagementService` cuando se completan campos clave), `sequence.exhausted` (desde `AutomationSequenceService` al llegar a `max_attempts`). `appointment.confirmed` **ya existe**.

## Fase 2 — Motor de reglas

Migración `038_funnel_rules.sql`: tabla `clients.funnel_rules` (`id, organization_id, funnel_id, name, trigger_event, conditions JSONB, from_stage_types TEXT[], to_stage_type, direction_policy VARCHAR(20) DEFAULT 'forward_only', priority INT, is_active BOOL`).

`FunnelAutomationConsumer` (`@EventPattern` sobre los trigger events) → `FunnelRulesService.evaluate(event)`:
1. Resolver contacto → su funnel → etapa actual.
2. Saltar si la etapa actual `is_terminal`.
3. Saltar si la última fila de historial es `source='manual'` dentro de **24h** (guard anti-override; configurable).
4. Match de reglas activas por `trigger_event`, filtrar por `conditions` + `from_stage_types`, ordenar por `priority`.
5. Resolver `to_stage_type` → la etapa real de ESE funnel.
6. Si `forward_only` y `position` destino <= actual → saltar (nunca retrocede, salvo reglas marcadas p.ej. `lost`).
7. `updateStage(..., source:'automation', reason:'<regla>')`.

Guard de recursión (profundidad) para que el encadenamiento (cada cambio emite `contact.stage.changed`) no haga loop.

**Reglas semilla por defecto** (data-driven, editables):

| trigger_event | from → to (stage_type) |
|---|---|
| `contact.created` | (inicial) → `new` |
| `message.received` (inbound del contacto) | `new` → `contacted` |
| `contact.data.completed` | `contacted` → `qualified` |
| `appointment.created` | `qualified`/`contacted` → `appointment_scheduled` |
| `appointment.confirmed` | * → `appointment_confirmed` |
| `appointment.completed` | `appointment_confirmed` → `won` |
| `sequence.exhausted` | * (no terminal) → `lost` |

## Fase 3 — Scoring + decay

Worker BullMQ diario (`bullmq` crudo + `OnModuleInit`, patrón existente): suma puntos por engagement (mensaje entrante, llamada contestada, cita confirmada, datos completados), decae ~25%/mes sin actividad, escribe `contacts.lead_score`. Sin trabajo de frontend (ya se renderiza; umbral hot `>=70` en `contact-profile-panel.tsx`).

## Fase 4 — Rotting

Job diario que compara tiempo desde el último cambio de etapa contra `rotting_days` de la etapa; marca contactos estancados y opcionalmente arranca una secuencia `reactivation`.

## Instrucciones para n8n (entregable final)

El funnel avanza con eventos que **solo existen si la acción pasa por el CRM**. Tras implementar, se te entregará esta tabla llena con URLs/headers reales. n8n **no** necesita saber de etapas ni recibir avisos de cambio de pipeline — solo debe enrutar sus acciones por el CRM:

| Cuando en n8n… | n8n debe hacer este request al CRM | Evento que dispara | El funnel mueve a |
|---|---|---|---|
| Manda un mensaje al cliente | `POST /api/v1/ai/tools/execute` `{tool:'send_message', input:{conversation_id, content}}` | (outbound registrado) | — |
| El cliente responde (inbound) | *(ya lo captura la ingesta WAHA del CRM; n8n no hace nada)* | `message.received` | `new → contacted` |
| Agenda una cita | `create_appointment` (calendario libre) o `create_payment_link` con `booking` (calendario con cobro) | `appointment.created` / luego `appointment.confirmed` al pagar | `→ appointment_scheduled` / `→ appointment_confirmed` |
| Cobra un servicio | `create_payment_link` | `payment.received` al pagar | (según regla) |

Regla para n8n: **toda acción de cara al cliente se hace vía `/ai/tools/execute`, nunca directo a WhatsApp/calendario/Stripe**, para que el evento exista y el funnel reaccione. El CRM no le manda al cliente ningún mensaje por el cambio de etapa.

## Decisiones por defecto (ajustables al aprobar)

- **Etapa "Ganado" en Ventas:** el funnel termina en Appointment Confirmed → Lost, sin `won`. Por defecto asumo que agregarás una etapa `won` (te dejo la instrucción); si no, `appointment.completed` no tendrá destino y esa regla queda inerte.
- **Cold:** se deja como parking manual (no es destino de ninguna regla automática).
- **Ventana anti-override:** 24h.

## Verificación

1. `cd apps/api && npx tsc --noEmit` — sin errores.
2. Aplicar 037 y 038 en Supabase con el script node+`pg` (ver memoria `pending-setup`); verificar columnas/tabla con `information_schema`.
3. **Foundation:** un cambio manual de etapa persiste `source='manual'` en `contact_funnel_history`.
4. **Motor E2E:** emitir/forzar `message.received` para un contacto en `new` → verificar que pasa a `contacted` con `source='automation'` y `reason` en el historial; y que un cambio manual reciente lo bloquea (guard 24h).
5. **Terminal:** un contacto en `lost`/`won` no se mueve por ningún evento.
6. **n8n:** ejecutar el flujo real de n8n (mensaje → `/ai/tools/execute`) y confirmar que el contacto avanza sin que el cliente reciba aviso de etapa.
7. `graphify update .`.
