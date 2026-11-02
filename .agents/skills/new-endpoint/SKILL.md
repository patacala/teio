---
description: |
  Agrega un endpoint nuevo a un modulo backend existente.
  Crea el metodo en servicio + controlador + actualiza el servicio frontend y hook.
arguments: [modulo, accion]
disable-model-invocation: true
allowed-tools: Read Grep Glob Write Edit Bash(graphify *)
---

# Nuevo Endpoint: $accion en $modulo

## Pasos

### 1. Investigar modulo existente

```bash
graphify query "$modulo controller service routes"
```

Lee el controller y service actuales para entender la estructura.

### 2. Agregar metodo al servicio

- En `apps/api/src/modules/$modulo/*.service.ts`
- Scoped por `organization_id` siempre
- Un metodo = una responsabilidad

### 3. Agregar ruta al controller

- Ruta estatica ANTES de rutas `:id` si aplica
- `@CurrentTenant()` para obtener org
- `import type { Request } from 'express'` si necesitas Request

### 4. DTO si es necesario

- Crea DTO con `class-validator` decorators
- Granular: no reutilizar DTOs gordos

### 5. Actualizar frontend

- Agrega metodo en `apps/web/src/services/$modulo.service.ts`
- Agrega/actualiza hook en `apps/web/src/hooks/`
- `invalidateQueries` en mutations

### 6. Verificar

- `pnpm --filter @crm/api build`
- `graphify update .`

$ARGUMENTS
