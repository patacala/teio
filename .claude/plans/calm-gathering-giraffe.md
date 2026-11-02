# WhatsApp vía WAHA — reemplazo de la integración Meta Cloud API

## Context

El canal WhatsApp hoy usa **Meta Cloud API**, que exige WhatsApp Business Account, App de Meta, review y número dedicado — fricción alta para onboardear clientes. Se reemplaza por **WAHA** (self-hosted, vinculación por QR como WhatsApp Web). Desde v2026.6.1 WAHA es 100% open source con **sesiones ilimitadas gratis**, lo que lo hace viable multi-tenant.

**Meta se elimina por completo** (no coexisten), lo que simplifica el diseño: el handler recupera la clave `whatsapp` limpia en el registry y el dispatch saliente no necesita ser provider-aware.

**Decisiones tomadas:** instancia WAHA única compartida (config por env, aislamiento por sesión) · solo texto en esta iteración (paridad con Messenger/Instagram) · los canales Meta existentes se desactivan sin borrar datos.

### Invariante clave
El canal sigue siendo `type = 'whatsapp'` (el valor de `ChannelType.WHATSAPP`); **`waha` es solo el `provider`**. Gracias a esto, el inbox, los badges, el timeline del contacto y el follow-up siguen funcionando sin tocarse: `ChannelStrategyResolverService.getRecipientForChannel()` ya lee `contact.channel_ids.whatsapp`, y `ingestMessage()` ya crea contacto + conversación + mensaje.

### Dos normalizaciones que sostienen ese invariante
1. **`chatId` → dígitos pelados.** WAHA usa `5215512345678@c.us`; Meta usaba `5215512345678`. El handler debe quitar el sufijo antes de emitir el DTO — si no, `findOrCreateByChannel` (`client-management.service.ts:548`) guarda basura en `contact.phone` y rompe el follow-up. Al despachar se re-agrega `@c.us`.
2. **`external_identifier` = nombre de sesión, no el número.** El índice único es `(organization_id, type, external_identifier)`, pero al crear el canal todavía no sabemos el número (sale recién al escanear el QR). Se usa un nombre de sesión estable generado en el server; el número real vive en `config.phone_number`. Bonus: el envelope del webhook trae `session`, así que resolver el canal es `findByExternalIdentifier(session, 'whatsapp', 'waha')` — idéntico al patrón que ya usan los otros handlers.

---

## Backend

### 1. Config — `apps/api/src/config/configuration.ts`
Agregar bloque `waha: { baseUrl, apiKey }` desde `WAHA_BASE_URL` / `WAHA_API_KEY` (normalizar trailing slash, como hace `normalizePublicApiUrl`).

### 2. `apps/api/src/infrastructure/waha/` — NUEVO
`waha.module.ts` (`@Global`, mismo patrón que `SmsModule`) + `waha.service.ts`. Cliente HTTP puro contra WAHA, header `X-Api-Key`, sin lógica de negocio:

| Método | Endpoint WAHA |
|---|---|
| `createSession(name, webhookUrl, hmacKey)` | `POST /api/sessions` |
| `getSession(name)` | `GET /api/sessions/{name}` → `{ status, me }` |
| `getQrImage(name)` | `GET /api/{name}/auth/qr?format=image` → base64 data URI |
| `requestPairingCode(name, phone)` | `POST /api/{name}/auth/request-code` |
| `logout(name)` / `deleteSession(name)` | `POST /api/sessions/{name}/logout` · `DELETE /api/sessions/{name}` |
| `sendText(session, chatId, text)` | `POST /api/sendText` |

`createSession` suscribe solo a `['message', 'session.status']` — **nunca `message.any`**, que reinyectaría los mensajes salientes propios y generaría un bucle de eco.

Registrar `WahaModule` en `app.module.ts` junto a `SmsModule`.

### 3. `channel-webhooks/handlers/whatsapp.handler.ts` — REESCRIBIR
Mantiene `channelType = 'whatsapp'`; se elimina `handleVerification()` (WAHA no tiene challenge GET) y todo el parsing de Meta.

- Resolver canal por `payload.session` → `findByExternalIdentifier(session, 'whatsapp', 'waha')`
- **HMAC-SHA512** del `rawBody` contra `config.hmac_secret`, header `X-Webhook-Hmac`, comparado con `timingSafeEqual` (reusar el patrón de validación que ya tenía el handler Meta)
- `event === 'session.status'` → persistir `session_status` + `phone_number` + `push_name`, sincronizar `is_active`, devolver `[]`
- `event === 'message'` → descartar `fromMe`, chats de grupo (`@g.us`) y mensajes sin `body`; mapear `_data.notifyName` → `sender_display_name` (así `findOrCreateByChannel` guarda el nombre por defecto), `payload.id` → `channel_message_id` (la dedup ya existe vía índice único)

### 4. `integrations/waha-channel.service.ts` + `waha-channel.controller.ts` — NUEVOS
Servicio de orquestación (WahaService + ChannelsService); `ChannelsService` queda genérico.

Controller `@Controller({ path: 'channels/whatsapp', version: '1' })`, registrado **antes** de `ChannelsController` en el array `controllers` del módulo:

- `POST /sessions` — genera `session_name` + `hmac_secret`, crea el canal (`is_active: false` hasta vincular) y la sesión en WAHA
- `GET /:id/qr` — `{ status, qr? }` con el QR como data URI
- `GET /:id/status` — consulta WAHA **en vivo** y sincroniza `config`. Esto es deliberado: hace que la vinculación funcione aunque WAHA no pueda alcanzar el webhook (típico en dev local). El webhook `session.status` es el camino rápido, no el único.
- `POST /:id/pairing-code` — alternativa al QR
- `POST /:id/unlink` — logout + `is_active = false`

`is_active` queda atado al estado de vinculación (`WORKING` → true), así `findActiveByType` nunca devuelve un canal desvinculado.

### 5. `integrations/channels.service.ts`
- `SENSITIVE_KEYS` += `hmac_secret`
- `testConnection`: rama `whatsapp` pasa de Graph API a `getSession()` → OK si `WORKING`
- `remove()`: si `provider === 'waha'`, borrar también la sesión en WAHA (try/catch — una caída de WAHA no debe bloquear el borrado del canal). Evita sesiones huérfanas consumiendo recursos.

### 6. `conversation-management/outbound-dispatch.processor.ts`
`dispatchWhatsApp` pasa de Graph API a `wahaService.sendText(channel.external_identifier, `${waId}@c.us`, content)`. Eliminar la constante `WHATSAPP_MESSAGES_URL`.

### 7. `packages/database/schemas/029_waha_whatsapp.sql` — NUEVO
Idempotente: `UPDATE integrations.channels SET is_active = false WHERE type = 'whatsapp' AND provider = 'meta'`. No borra nada — conversaciones, mensajes e historial de contactos quedan intactos.

---

## Frontend

### 8. `services/channels.service.ts` + `hooks/useChannels.ts`
Métodos y hooks para los 5 endpoints nuevos. `useWhatsAppStatus(id)` con `refetchInterval` mientras el estado no sea `WORKING` (polling que se auto-detiene).

### 9. `config/channels/_components/WhatsAppLinkDialog.tsx` — NUEVO
El corazón del UX de configuración:
1. Al abrir, crea sesión (`POST /sessions`)
2. Muestra el QR como `<img>` con el data URI, refrescándolo cada ~20s (WAHA rota el QR)
3. Poll de status en paralelo; al llegar a `WORKING` muestra el número vinculado y cierra
4. Pestaña alternativa "Vincular con código" para el flujo de pairing code

Sin dependencias nuevas: el QR llega renderizado como imagen desde el backend, no hace falta librería de QR en el front.

### 10. `ChannelWizard.tsx`
Eliminar el provider `meta`. `whatsapp` deja de usar el formulario genérico (no hay identifier ni credenciales que pedir): al seleccionarlo, el wizard cierra y abre el `WhatsAppLinkDialog`.

### 11. `ChannelConfigDrawer.tsx`
Reemplazar los campos `whatsapp/meta` por un panel de estado WAHA: estado de conexión, número vinculado, y botones **Volver a vincular** / **Desvincular**.

### 12. `ChannelCard.tsx` + `config/channels/page.tsx`
La card muestra el número vinculado y un chip de estado en vez del nombre de sesión crudo. La página cablea el estado del `WhatsAppLinkDialog`.

---

## Archivos

**Nuevos:** `infrastructure/waha/{waha.module,waha.service}.ts` · `integrations/waha-channel.{service,controller}.ts` · `schemas/029_waha_whatsapp.sql` · `_components/WhatsAppLinkDialog.tsx`

**Modificados:** `config/configuration.ts` · `app.module.ts` · `channel-webhooks/handlers/whatsapp.handler.ts` · `integrations/{channels.service,integrations.module}.ts` · `conversation-management/outbound-dispatch.processor.ts` · `services/channels.service.ts` · `hooks/useChannels.ts` · `_components/{ChannelWizard,ChannelConfigDrawer,ChannelCard}.tsx` · `config/channels/page.tsx`

**Sin cambios (y esa es la señal de que el diseño es correcto):** `channel-strategy-resolver.service.ts`, `conversation-management.service.ts`, `client-management.service.ts`, `ingest-message.dto.ts`, `webhook-handler.registry.ts`, enum `ChannelType`.

---

## Verificación

Levantar WAHA local: `docker run -it -p 3000:3000 -e WAHA_API_KEY=dev-key devlikeapro/waha`, con `WAHA_BASE_URL=http://localhost:3000` y `WAHA_API_KEY=dev-key` en el `.env` de la API.

1. **Vincular** — `/config/channels` → Agregar canal → WhatsApp → escanear QR con el teléfono → la UI debe pasar a `WORKING` y mostrar el número. Verificar en DB que `external_identifier` es el nombre de sesión y `config.phone_number` el número.
2. **Recibir** — escribir al número desde otro teléfono → el mensaje aparece en `/inbox`; el contacto se crea con el `notifyName` de WhatsApp como `first_name` y `channel_ids.whatsapp` con dígitos pelados (sin `@c.us`).
3. **Responder** — contestar desde el inbox → llega al teléfono. Confirmar que la respuesta **no** se re-ingesta como mensaje entrante (filtro `fromMe`).
4. **Historial** — abrir el contacto y verificar que la conversación aparece en el timeline de actividad.
5. **Follow-up** — crear una secuencia para ese contacto y comprobar que `ChannelStrategyResolverService` resuelve `whatsapp` y despacha por WAHA.
6. **Desvincular** — botón Desvincular → `is_active` pasa a false y el canal deja de resolverse para envíos. Borrar el canal → confirmar que la sesión desaparece de `GET /api/sessions` en WAHA.
7. **Seguridad** — POST manual a `/api/v1/webhooks/channel/whatsapp` sin header `X-Webhook-Hmac` → 403.
8. `pnpm --filter @crm/api typecheck && pnpm --filter @crm/web typecheck`
