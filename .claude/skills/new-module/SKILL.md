---
description: |
  Crea un modulo completo full-stack: migracion SQL, entidad, servicio,
  controlador, modulo NestJS, servicio frontend, hook, y pagina.
  Usa cuando el usuario pide crear algo nuevo de cero.
arguments: [nombre]
disable-model-invocation: true
allowed-tools: Read Grep Glob Write Edit Bash(graphify *) Bash(pnpm *)
---

# Crear Modulo: $nombre

Vas a crear un modulo full-stack completo. Sigue este orden exacto:

## Paso 1 — Migracion SQL

1. Busca el ultimo numero en `packages/database/schemas/` con `ls`
2. Crea `packages/database/schemas/{N+1}_$nombre.sql`
3. Usa `IF NOT EXISTS` para idempotencia
4. Incluye `organization_id UUID NOT NULL` en toda tabla
5. Incluye `created_at TIMESTAMPTZ DEFAULT NOW()` y `updated_at TIMESTAMPTZ DEFAULT NOW()`

## Paso 2 — Entidad TypeORM

1. Crea `apps/api/src/modules/$nombre/$nombre.entity.ts`
2. Mapea cada columna del SQL con los tipos correctos:
   - Arrays: `{ type: 'text', array: true, default: '{}' }`
   - JSON: `{ type: 'jsonb', default: {} }`
   - Timestamps: `{ type: 'timestamptz' }`
3. `@Index(['organization_id'])` obligatorio

## Paso 3 — Servicio NestJS

1. Crea `apps/api/src/modules/$nombre/$nombre.service.ts`
2. Inyecta `@InjectRepository(Entity)`
3. TODAS las queries con `where: { organization_id }`
4. Metodos: `findAll`, `findById`, `create`, `update`, `remove`
5. Paginacion: `{ items, meta: buildPaginationMeta(...) }`

## Paso 4 — Controller NestJS

1. Crea `apps/api/src/modules/$nombre/$nombre.controller.ts`
2. `@Controller('$nombre')` con `@ApiTags`
3. Rutas estaticas ANTES de rutas con `:id`
4. Usa `@CurrentTenant()` para el org context
5. `import type { Request } from 'express'` (nunca value import)

## Paso 5 — Modulo NestJS

1. Crea `apps/api/src/modules/$nombre/$nombre.module.ts`
2. Registra entity, service, controller
3. Agrega al `imports` de `app.module.ts`

## Paso 6 — Tipos compartidos

1. Si hay tipos nuevos, agregalos en `packages/shared/src/types/$nombre.types.ts`
2. Si hay enums nuevos, agregalos en `packages/shared/src/enums/index.ts`
3. Re-exporta desde `packages/shared/src/index.ts`

## Paso 7 — Servicio Frontend

1. Crea `apps/web/src/services/$nombre.service.ts`
2. Usa `authClient.get/post/patch/delete`
3. Tipado completo de request/response

## Paso 8 — Hook React Query

1. Crea `apps/web/src/hooks/use$Nombre.ts`
2. `useQuery` para reads, `useMutation` para writes
3. `invalidateQueries` en `onSuccess` de mutations
4. `staleTime: 30_000` en queries

## Paso 9 — Pagina/Componentes

1. Crea la pagina en `apps/web/src/app/(dashboard)/...`
2. Skeleton loading + empty state obligatorios
3. Usa componentes de `@/components/ui/`
4. Colores: solo blue-600, gray-900/500/400, bg-surface, bg-panel

## Paso 10 — Verificacion

1. `pnpm --filter @crm/api build` debe pasar
2. `pnpm --filter @crm/web typecheck` debe pasar
3. `graphify update .` para actualizar el grafo

$ARGUMENTS
