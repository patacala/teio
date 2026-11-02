# Plan: RabbitMQ Consumers + Async Dispatch

## Context
El CRM emite 11 eventos RabbitMQ que nadie consume (error: "no matching event handler"). Además, `dispatchOutbound()` (SMS/WhatsApp/IG/FB) y `CommunicationDispatchService.dispatch()` (email/SMS) hacen llamadas HTTP síncronas que bloquean el response 1-5 segundos. Se necesita:
1. Crear consumers para los eventos RabbitMQ emitidos
2. Mover dispatch de mensajes outbound a cola BullMQ (async)
3. Mover dispatch de comunicaciones (email/SMS) a cola BullMQ (async)

## Estado actual

| Evento | Emitido en | Handler | Problema |
|--------|-----------|---------|----------|
| `message.received` | conversation-management.service.ts:527 | ❌ | No consumer |
| `message.send` | conversation-management.service.ts:198 | ❌ | No consumer |
| `conversation.assign` | conversation-management.service.ts:164,408,437 | ❌ | No consumer |
| `call.started` | voice/calls.service.ts:138 | ❌ | No consumer |
| `call.completed` | voice/calls.service.ts:160 | ❌ | No consumer |
| `call.transcript.updated` | voice/calls.service.ts:200 | ❌ | No consumer |
| `agent.tool.executed` | ai-automation/tool-execution.service.ts:146 | ❌ | No consumer |
| `subscription.updated` | billing/subscription.service.ts:254 | ❌ | No consumer |
| `subscription.canceled` | billing/subscription.service.ts:283 | ❌ | No consumer |
| `invoice.paid` | billing/subscription.service.ts:315 | ❌ | No consumer |
| `invoice.payment.failed` | billing/subscription.service.ts:353 | ❌ | No consumer |
| `appointment.created` | scheduling/scheduling.service.ts:194 | ✅ | Funciona |

### Operaciones síncronas bloqueantes:
- **`dispatchOutbound()`** (conv-management.service.ts:225-385) — HTTP a Telnyx/Meta APIs, bloquea 1-3s
- **`dispatch()`** (communication-dispatch.service.ts:74-127) — HTTP a email/SMS providers, bloquea 2-5s

---

## Fase 1: Outbound Dispatch Queue (P0 — elimina bloqueo de 1-3s por mensaje)

### Archivos nuevos:

**`apps/api/src/modules/conversation-management/outbound-dispatch.constants.ts`**
- `OUTBOUND_DISPATCH_QUEUE` token + `OUTBOUND_DISPATCH_QUEUE_NAME = 'outbound_dispatch'`

**`apps/api/src/modules/conversation-management/outbound-dispatch.processor.ts`**
- Worker BullMQ, concurrency 10
- Contiene la lógica extraída de `dispatchOutbound()`: resolver channel + contact → HTTP a SMS/WhatsApp/IG/FB
- Retry: 3 intentos, backoff exponencial 5s
- Inyecta: `ChannelsService`, `ClientManagementService`, `SmsService`, `MessageEntity` repo
- Patrón: igual a `webhook-dispatcher.service.ts`

### Archivos a modificar:

**`conversation-management.service.ts`**
- Eliminar método `dispatchOutbound()` completo (~160 líneas)
- Eliminar imports de `SmsService`, constantes de URLs de APIs
- Agregar `@Optional() @Inject(OUTBOUND_DISPATCH_QUEUE) outboundQueue?: Queue`
- En `sendMessage()`: reemplazar `void this.dispatchOutbound(...)` por `outboundQueue.add('dispatch', { conversationId, messageId, content, organizationId, channel, contactId })`

**`conversation-management.module.ts`**
- Agregar Queue provider factory para `OUTBOUND_DISPATCH_QUEUE`
- Registrar `OutboundDispatchProcessor` como provider

---

## Fase 2: Communication Dispatch Queue (P0 — elimina bloqueo de 2-5s por email/SMS)

### Archivos nuevos:

**`apps/api/src/modules/communications/communication-dispatch.constants.ts`**
- `COMM_DISPATCH_QUEUE` token + `COMM_DISPATCH_QUEUE_NAME = 'communication_dispatch'`

**`apps/api/src/modules/communications/communication-dispatch.processor.ts`**
- Worker BullMQ, concurrency 5
- Llama `CommunicationDispatchService.dispatch()` (lógica existente)
- Retry: 3 intentos, backoff exponencial 10s

**`apps/api/src/modules/communications/communication-dispatch-queue.service.ts`**
- `enqueue(request: DispatchRequest): Promise<void>` — wrapper que agrega job a la cola
- Los callers que quieran async usan este service en vez de `dispatch()` directo

### Archivos a modificar:

**`communications.module.ts`**
- Agregar Queue provider + processor + queue service

**`notifications/appointment-email.consumer.ts`**
- Cambiar `dispatchService.dispatch()` → `dispatchQueueService.enqueue()` (async)

---

## Fase 3: RabbitMQ Event Consumers

Todos siguen el patrón de `AppointmentEmailConsumer`: `@Controller()` con `@EventPattern()`, registrados en `notifications.module.ts` como controllers.

### 3A: `notifications/conversation-event.consumer.ts`

| Evento | Acción |
|--------|--------|
| `message.received` | Analytics track + broadcast realtime notification |
| `message.send` | Analytics track |
| `conversation.assign` | Analytics track + notificar agente asignado via realtime |

### 3B: `notifications/voice-event.consumer.ts`

| Evento | Acción |
|--------|--------|
| `call.started` | Analytics track |
| `call.completed` | Analytics track (con duración) + update `last_contacted_at` en contacto |
| `call.transcript.updated` | Analytics track |

### 3C: `notifications/ai-event.consumer.ts`

| Evento | Acción |
|--------|--------|
| `agent.tool.executed` | Analytics track (audit trail de herramientas AI) |

### 3D: `notifications/billing-event.consumer.ts`

| Evento | Acción |
|--------|--------|
| `subscription.updated` | Analytics track + email notificación a admins de la org |
| `subscription.canceled` | Analytics track + email notificación a admins |
| `invoice.paid` | Analytics track + email recibo |
| `invoice.payment.failed` | Analytics track + email urgente a admins |

### Modificar:

**`notifications/notifications.module.ts`**
- Registrar los 4 consumers nuevos en `controllers`
- Agregar imports: `AnalyticsModule`, `RealtimeModule`

**`analytics/analytics.module.ts`**
- Exportar `AnalyticsService` (prerequisito para que los consumers lo inyecten)

---

## Resumen de archivos

### Nuevos (9):
1. `conversation-management/outbound-dispatch.constants.ts`
2. `conversation-management/outbound-dispatch.processor.ts`
3. `communications/communication-dispatch.constants.ts`
4. `communications/communication-dispatch.processor.ts`
5. `communications/communication-dispatch-queue.service.ts`
6. `notifications/conversation-event.consumer.ts`
7. `notifications/voice-event.consumer.ts`
8. `notifications/ai-event.consumer.ts`
9. `notifications/billing-event.consumer.ts`

### Modificar (6):
1. `conversation-management/conversation-management.service.ts` — eliminar dispatchOutbound, usar queue
2. `conversation-management/conversation-management.module.ts` — registrar queue + processor
3. `communications/communications.module.ts` — registrar queue + processor + queue service
4. `notifications/notifications.module.ts` — registrar 4 consumers nuevos
5. `notifications/appointment-email.consumer.ts` — usar dispatch queue async
6. `analytics/analytics.module.ts` — exportar AnalyticsService

## Orden de implementación
1. Fase 1: Outbound Dispatch Queue (P0)
2. Fase 2: Communication Dispatch Queue (P0)
3. Fase 3A: Conversation consumers (P1)
4. Fase 3D: Billing consumers (P1)
5. Fase 3B: Voice consumers (P2)
6. Fase 3C: AI consumer (P3)

## Verificación
- `pnpm --filter @crm/api build` — 0 errores
- Logs: ya no debe aparecer "no matching event handler" para eventos con consumer
- Test endpoint SMS: response time < 500ms (antes 1-3s)
- RabbitMQ management UI: consumers registrados en cada queue
