# Follow-up Engine — Steps como datos + Channel Strategy por step

## Context

Las secuencias de follow-up mandan **solo mensajes por el canal que resuelva `auto`**. En `createSequenceAppointment()` hay dos hardcodeos hermanos:

```ts
action: 'send_message',      // ← automation-sequence.service.ts:301
channel_strategy: 'auto',    // ← automation-sequence.service.ts:303
```

`CallHandler` es un stub que loguea y devuelve `{ completed: true }` sin hacer nada.

### El hallazgo que define el diseño

**La mitad de la infraestructura ya existe y solo está sin usar:**

| Pieza | Estado |
|---|---|
| `appointments.channel_strategy VARCHAR(20)` | Existe desde `023_appointment_automation.sql:8` |
| `ChannelStrategyResolverService` | Implementa `auto`, `same_channel`, `whatsapp_only`, `sms_only`, `email_only` |
| Punto de llamada | `action-execution.service.ts:86` ya hace `resolve(contact, orgId, appt.channel_strategy ?? 'auto')` |
| `SequenceType` | `'no_response' \| 'appointment_reminder' \| 'post_service' \| 'reactivation' \| 'manual'` en `automation.types.ts:21` |
| `CallHandler` | Ya registrado en el módulo y en `action-execution.service.ts:40` |
| `appointments` | Ya tiene `status`, `metadata`, `attempts`, `max_attempts`, `last_error` |
| `analytics.events` + `AnalyticsService.track()` | Ya existen (particionada) |

El trabajo real es **dejar de hardcodear esos dos campos** y darles origen en datos.

### Decisiones de diseño

**Templates por `sequence_type`, no por canal.** Una versión anterior de este plan proponía un template por canal (`whatsapp`, `sms`, `voice`…). Se descartó: el canal ya se resuelve en runtime vía `channel_strategy`, así que un template por canal crearía un **segundo mecanismo de decisión de canal en paralelo al que ya funciona**. Los templates se seleccionan por `sequence_type`, que ya es columna, ya viaja en el payload del webhook y ya es filtrable.

Esto también los desacopla del funnel: las etapas del pipeline (`New`, `Qualified`, `Proposal Sent`…) son el **estado comercial** y deben quedar ortogonales al **estado de la automatización**.

**Steps en tablas, no constante en código.** Se clonan al crear la secuencia (igual que `FunnelsService.applyTemplate()`, `funnels.service.ts:134`) para que editar un template **no afecte secuencias en vuelo**, quede historial, y se pueda editar una secuencia puntual ("a este lead VIP metele una llamada en el paso 2").

**La variación de canal vive en el step, no en la estrategia.** `resolveAuto()` prioriza el canal de la última conversación, así que `auto` elige WhatsApp las 7 veces. Para alternar canal hay que decirlo explícitamente por step (`email_only` en el paso 5).

**Estado de ejecución: solo en `appointments`.** No se duplican `status`/`attempts`/`last_error` en `sequence_steps`. El step es el **plan**, el appointment es la **ejecución**; duplicarlos garantiza divergencia. Sí se guardan `executed_action` y `resolved_channel` como *resultado observado*.

---

## Modelo de datos

```
MOLDE (seed de plataforma; organization_id NULL = default, SET = propio de la org)
  scheduling.sequence_templates ──< scheduling.sequence_template_steps
     name, sequence_type,              position, action, channel_strategy,
     organization_id, description      delay_hours, config JSONB
                │
                │  se clona al crear la secuencia
                ▼
INSTANCIA
  scheduling.automation_sequences ──< scheduling.sequence_steps
     (ya existe) + channel,               organization_id, sequence_id, position,
                 + template_id            action, channel_strategy, delay_hours,
                                          config, executed_action, resolved_channel
```

### Seeds (4, por `sequence_type`)

**`no_response`** — 7 pasos, `delay_hours: 24`:

| # | action | channel_strategy | intención |
|---|---|---|---|
| 1-3 | `send_message` | `auto` | su hilo habitual |
| 4 | `call` | `voice_only` | escalada deliberada |
| 5 | `send_message` | `email_only` | otra vía por si no ve el hilo |
| 6-7 | `send_message` | `auto` | vuelta al hilo; el 7 es el *breakup* |

**`reactivation`** — 3-4 pasos, delays largos (`72h`+)
**`post_service`** — 2-3 pasos cortos
**`appointment_reminder`** — 1-2 pasos, delay en horas

---

## Backend

### 1. `packages/database/schemas/030_sequence_steps.sql` — NUEVO
Idempotente, estilo `018_funnel_templates.sql` (bloque `DO $$` con guard por nombre).

- Las 3 tablas del modelo. `action` y `channel_strategy` son `VARCHAR(20)` sin CHECK (igual que `appointments.action`).
- `ALTER TABLE automation_sequences ADD COLUMN channel VARCHAR(20), template_id UUID` — `channel` deja de vivir en `metadata` (consultable e indexable); `template_id` habilita analytics ("¿qué template convierte mejor?") sin romper la inmutabilidad.
- Único `(sequence_id, position)`; parcial `(sequence_type)` sobre templates de plataforma.
- Seed de los 4 templates.

### 2. Entidades — NUEVAS
`sequence-template.entity.ts` (con `@OneToMany(..., { eager: true, cascade: true })` espejando `FunnelTemplateEntity`), `sequence-template-step.entity.ts`, `sequence-step.entity.ts`. Registrar en `forFeature` (`automation-engine.module.ts:36`).

### 3. `automation-sequence.service.ts`
- **`cloneStepsFromTemplate(orgId, sequence)`** — resuelve template por `sequence_type`: el de la org, si no el de plataforma, si no `no_response`. Copia sus steps a `sequence_steps`.
- **`create()`** — clonar antes del primer appointment. `max_attempts` pasa a ser la cantidad de steps clonados (hoy `7` hardcodeado, L64). Guardar `channel` (de la conversación si hay `conversation_id`) y `template_id`.
- **`createSequenceAppointment()`** — leer el step de `position = current_attempt` y setear **ambos** campos (L301 y L303). Sin fila → `send_message` + `auto` (degradación segura para secuencias preexistentes).
- **`advanceOrComplete()`** — `dueAt` desde el `delay_hours` del step siguiente, **manteniendo el salto de fin de semana** que ya hace `getNextBusinessDayAt10()`.
- **`resetTimer()`** — ⚠️ ver *Decisión pendiente*.

Se llama desde los 3 caminos (`create` L89, retry L156, `advanceOrComplete` L182). `advanceOrComplete` ya incrementa `current_attempt` **antes**, así que el índice por `position` es directo.

### 4. `channel-strategy-resolver.service.ts`
- Agregar `voice_only` (necesario para el paso de llamada).
- **Fallback**: si una estrategia específica no resuelve (`email_only` sin email), caer a `auto` en vez de devolver `null`. `resolveAuto` ya hace "mismo canal que escribió, si no el default".
- Sacar la cadena de prioridad hardcodeada de `resolveAuto` (WhatsApp → SMS → Email) a `org.settings` — es lo único que varía entre orgs.

### 5. `handlers/context-builder.service.ts` — NUEVO
`SendMessageHandler` (L47-64) arma `recent_messages` y resuelve `conversation_id`; `CallHandler` necesita exactamente lo mismo. Extraer a un builder compartido que devuelva el contexto único que consumen todos los handlers: `{ contact, conversation_id, recent_messages, sequence, step, action, channel }`. Es DRY con dos consumidores concretos hoy.

### 6. `handlers/call.handler.ts` — implementar
Mismo patrón que `SendMessageHandler` (L40-97): verificar `hasSubscribers('follow_up.due', orgId)` → despachar webhook con `action: 'call'` usando el ContextBuilder → `{ completed: false }` (n8n completa vía el tool `complete_follow_up`).

**Sin webhook → degradar a mensaje**, no saltear, y registrar `executed_action = 'send_message'`. Saltear perdería el punto de contacto en silencio.

### 7. `handlers/send-message.handler.ts`
`action: 'send_message'` explícito en el payload (para que n8n distinga) y migrar al ContextBuilder.

### 8. `outbound-message.consumer.ts` — listener `CALL_COMPLETED`
`@EventPattern(RABBITMQ_QUEUES.CALL_COMPLETED)` (constante ya existe, `rabbitmq.constants.ts:17`). Hoy solo escucha `MESSAGE_SEND`.

**Guard obligatorio:** el módulo de voz emite `CALL_COMPLETED` en **toda** llamada — entrantes, manuales, del agente. Sin filtro, cualquier llamada no relacionada de un contacto con secuencia activa avanzaría la secuencia. Verificar que el appointment en `processing` tenga `action === 'call'` antes de completar.

### 9. `action-scheduler.cron.ts` — reaper
Un handler que despacha a n8n deja el appointment en `processing` esperando el tool. Si n8n nunca responde, **la secuencia se traba para siempre sin señal**. Cron que busque `processing` con más de N horas (config, default 6) y use los campos **ya existentes** `attempts`/`max_attempts`/`last_error` para reintentar una vez y luego avanzar.

### 10. Eventos
Emitir a `AnalyticsService.track()` (ya existe) en: step ejecutado, canal resuelto, degradación de acción, secuencia trabada. Sin tabla nueva.

---

## Frontend

**No va en Agenda.** Agenda muestra *ejecuciones* fechadas en un calendario; un template es una definición reutilizable sin fecha. Mezclarlos repite el error de mezclar Pipeline con Follow-up. Son tres lugares:

### 11. `/config/sequences` — PANTALLA NUEVA
Editor de templates, junto a `funnel`, `knowledge`, `channels`, `agents` en la sección CONFIGURATION del sidebar (mismo patrón que las 6 rutas de `/config/` existentes).

- Lista de templates agrupados por `sequence_type`, con badge "Default de plataforma" vs "Personalizado"
- Editor de steps: filas ordenables con `action` · `channel_strategy` · `delay_hours`, usando Radix `Select` (nunca `<select>` nativo)
- "Duplicar y personalizar" sobre un template de plataforma → crea el de la org
- Preview de la cadencia en timeline vertical
- Componentes en `_components/`: `SequenceTemplateList`, `SequenceStepEditor`, `SequenceStepRow`, `SequenceTimelinePreview`

### 12. `FollowUpCard.tsx` — contacto
Nueva card en `contacts/[id]/_components/`, junto a `FunnelStageCard` y `AppointmentsCard`. Es la materialización de **mantener Pipeline y Follow-up como ejes independientes**, ambos visibles en el lead:

```
Follow-up
─────────────────────────
WhatsApp Standard · Paso 3/7
Próxima acción:
  📞 Llamada IA · mañana 10:00
[Pausar]  [Cancelar]
```

### 13. Agenda — cambio mínimo
Los appointments de secuencia ya aparecen (`origin: 'automation'`). Solo agregar un badge que distinga `action` (📞 llamada vs 💬 mensaje) en `AppointmentsTable` y `AppointmentDrawer`.

### 14. Servicios y hooks
`services/automation.service.ts` ya existe con los endpoints de secuencias — extender con templates/steps. Hooks nuevos en `hooks/useSequenceTemplates.ts`. Endpoints backend correspondientes en `automation-engine.controller.ts` (CRUD de templates + steps, rutas estáticas antes de `:id`).

---

## Archivos

**Nuevos:** `schemas/030_sequence_steps.sql` · 3 entidades en `automation-engine/` · `handlers/context-builder.service.ts` · `config/sequences/` (página + 4 componentes) · `contacts/[id]/_components/FollowUpCard.tsx` · `hooks/useSequenceTemplates.ts`

**Modificados:** `automation-sequence.service.ts` · `automation-engine.module.ts` · `automation-engine.controller.ts` · `channel-strategy-resolver.service.ts` · `handlers/{call,send-message}.handler.ts` · `outbound-message.consumer.ts` · `action-scheduler.cron.ts` · `services/automation.service.ts` · `components/agenda/{AppointmentsTable,AppointmentDrawer}` · `sidebar.tsx`

**Sin cambios:** `action-execution.service.ts` (ya resuelve handler por `actionType` y ya pasa `channel_strategy`) · `automation.types.ts` (`ActionType` ya incluye `'call'`, `SequenceType` ya tiene los 5 valores)

---

## `resetTimer` — sin cambios (verificado)

El comportamiento actual **ya es el deseado** y no requiere tocar código. Verificado en `automation-sequence.service.ts:133-159`:

```
mensaje entrante → ingestMessage → resetTimer()
   1. cancela appointments en pending/scheduled/processing
   2. current_attempt = 1
   3. agenda el siguiente a +FIRST_FOLLOW_UP_DELAY_HOURS (= 2h)
   → a partir de ahí, los delay_hours del template
```

**Regla de negocio:** cada mensaje del cliente reinicia el temporizador y la secuencia vuelve al paso 1. El seguimiento siempre se ancla al último momento en que el cliente interactuó; nunca se continúa una cadencia vieja sobre una conversación activa.

**Decisión explícita: la secuencia se reinicia indefinidamente.** No hay tope de ciclos ni de vida — el único estado terminal es el opt-out explícito vía el tool `opt_out_contact`. Se evaluó un tope de ciclos y se descartó a propósito.

> ⚠️ Consecuencia conocida: un contacto que responde algo no comprometido (*"gracias, lo pensaré"*) antes de agotar los intentos nunca alcanza `exhausted` y puede recibir follow-ups de forma indefinida. Con WAHA el riesgo recae sobre el número de WhatsApp del cliente, no sobre una API key. Si aparece en producción, la mitigación es un `cycle_count` con tope en `resetTimer`.

---

## Verificación

1. **Selección por `sequence_type`** — crear secuencia `no_response`; verificar 7 filas en `sequence_steps` con `position=4` → `action='call'`, `channel_strategy='voice_only'`.
2. **Inmutabilidad** — con secuencia activa a mitad, editar el template de la org; verificar que sus `sequence_steps` **no cambian**.
3. **Override por org** — insertar template con `organization_id` y `sequence_type='no_response'`; secuencia nueva debe clonar ese, no el de plataforma.
4. **Variación de canal** — contacto con WhatsApp y email; verificar que los pasos 1-3 salen por WhatsApp y el 5 (`email_only`) por email.
5. **Fallback de estrategia** — contacto **sin** email; el paso 5 (`email_only`) debe caer a `auto` y salir por WhatsApp, no fallar.
6. **Llamada e2e** — paso 4 con n8n configurado: despacha `follow_up.due` con `action: 'call'`, appointment queda en `processing`.
7. **Guard de `CALL_COMPLETED`** — secuencia cuyo appointment en `processing` tiene `action='send_message'`; emitir `CALL_COMPLETED` para ese contacto → la secuencia **no debe avanzar**.
8. **Degradación sin webhook** — org sin suscriptores: el paso 4 manda mensaje genérico y registra `executed_action='send_message'`.
9. **Reaper** — appointment en `processing` con fecha vieja → se destraba y la secuencia avanza.
10. **Secuencias preexistentes** — una activa creada antes de la migración (sin `sequence_steps`) sigue funcionando con `send_message`/`auto`.
11. **Frontend** — `/config/sequences` permite duplicar un template y editar steps; `FollowUpCard` muestra paso y próxima acción; Agenda distingue llamada de mensaje.
12. `pnpm --filter @crm/api typecheck && pnpm --filter @crm/web typecheck`
