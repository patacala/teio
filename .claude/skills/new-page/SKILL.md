---
description: |
  Crea una pagina nueva en el frontend Next.js con servicio, hook,
  componentes, skeleton loading y empty state.
arguments: [ruta, titulo]
disable-model-invocation: true
allowed-tools: Read Grep Glob Write Edit Bash(graphify *) Bash(pnpm --filter @crm/web *)
---

# Nueva Pagina: $titulo en /$ruta

## Pasos

### 1. Verificar endpoint backend

Confirma que los endpoints que esta pagina necesita existen:
```bash
graphify query "$ruta controller routes API"
```

Si no existen, crealos primero (usa `/new-endpoint`).

### 2. Servicio HTTP

Crea `apps/web/src/services/$ruta.service.ts`:
- Solo llamadas HTTP via `authClient`
- Tipado completo de responses

### 3. Hook React Query

Crea `apps/web/src/hooks/use[Nombre].ts`:
- `useQuery` con `staleTime: 30_000`
- `useMutation` con `invalidateQueries` en `onSuccess`
- `toast({ variant: 'error' })` en `onError`

### 4. Pagina

Crea `apps/web/src/app/(dashboard)/$ruta/page.tsx`:
- `'use client'`
- Consume hooks, nunca services directamente
- Layout responsivo: `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4`

### 5. Componentes

En `apps/web/src/app/(dashboard)/$ruta/_components/`:
- Skeleton loading obligatorio
- Empty state con icono + mensaje
- Componentes de `@/components/ui/` (Radix)
- Colores: blue-600 accent, gray-900/500/400 texto

### 6. Navegacion

- Agregar entrada en sidebar (`apps/web/src/components/layout/sidebar.tsx`)
- Agregar titulo en header mapping
- Icono de `lucide-react`

### 7. Verificar

- `pnpm --filter @crm/web typecheck`
- `graphify update .`

$ARGUMENTS
