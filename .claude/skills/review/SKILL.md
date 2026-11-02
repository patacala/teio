---
description: |
  Revisa codigo del CRM por calidad, seguridad, y adherencia a las
  convenciones del proyecto. Usa despues de implementar algo para validar.
allowed-tools: Read Grep Glob Bash(graphify *) Bash(pnpm *)
---

# Code Review

## Checklist de revision

### Arquitectura
- [ ] Separacion de capas respetada (controller → service → repository)
- [ ] No hay logica de negocio en controllers
- [ ] No hay llamadas HTTP directas en componentes (solo via hooks)

### Multi-tenancy
- [ ] Toda query scoped por `organization_id`
- [ ] No se acepta `organization_id` en request body
- [ ] Usa `@CurrentTenant()` para obtener org

### Seguridad
- [ ] `import type` para tipos de express (no value import)
- [ ] No hay secrets hardcodeados
- [ ] Webhooks publicos usan `@Public()` + verificacion HMAC
- [ ] No hay SQL injection (usar QueryBuilder, no string concat)

### Enums y tipos
- [ ] Sin magic strings — todo via `@crm/shared` enums
- [ ] DTOs granulares (Create vs Update separados)
- [ ] Tipos compartidos en `packages/shared/`

### Frontend
- [ ] Colores del sistema de diseno (blue-600, gray-*, bg-surface/panel)
- [ ] Componentes Radix, no nativos
- [ ] Skeleton + empty state en listas
- [ ] Toast con variant `'error'` no `'destructive'`
- [ ] `invalidateQueries` en mutations

### Performance
- [ ] `staleTime` en queries (min 30s)
- [ ] Paginacion con `buildPaginationMeta`
- [ ] Redis cache donde aplique

### Rutas
- [ ] Rutas estaticas ANTES de rutas `:id`
- [ ] Backend y frontend en sync (mismo endpoint)

Reporta issues encontrados con archivo:linea y fix sugerido.

$ARGUMENTS
