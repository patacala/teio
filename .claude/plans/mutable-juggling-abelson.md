# Opt-Out via n8n Tool Call

## Context
Cuando un contacto quiere dejar de recibir follow-ups, el agente de n8n lo detecta y llama el tool `opt_out_contact`. El CRM cancela la secuencia activa y agrega tag `opt-out` al contacto para que no se creen nuevas secuencias.

## Cambios

### 1. `tool-execution.service.ts` — Agregar `opt_out_contact` al TOOL_REGISTRY
- Input: `{ contact_id: string, conversation_id?: string }`
- Handler:
  1. Buscar secuencia activa para el contacto → si existe, cancelar con reason `'opt_out'`
  2. Agregar tag `opt-out` al contacto via `clientService.update()`
  3. Return `{ opted_out: true, sequence_cancelled: !!active }`

### 2. `conversation-management.service.ts` — sendMessage(): respetar tag opt-out
- En el bloque de auto-creación de secuencia (~línea 243), antes de crear:
  - Cargar contacto tags (ya tenemos `conv.contact_id`)
  - Si tiene tag `opt-out` → skip, no crear secuencia

## Files
1. `apps/api/src/modules/ai-automation/tool-execution.service.ts` — agregar entry en TOOL_REGISTRY
2. `apps/api/src/modules/conversation-management/conversation-management.service.ts` — check opt-out tag en sendMessage

## Verification
1. POST `/api/v1/ai/tools/execute` con `{ tool: "opt_out_contact", input: { contact_id: "..." } }` → secuencia cancelada, tag agregado
2. Enviar outbound a contacto con tag `opt-out` → NO se crea secuencia automática
