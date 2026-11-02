# Plan: Migrar sistema de toast a Sonner

## Context
El CRM usa un sistema de toast custom basado en Radix UI (`@radix-ui/react-toast`) con un hook pub/sub propio. Se quiere reemplazar por **Sonner** — mejor UX (stacking, swipe, animations) y API más simple. Actualmente 33 archivos usan `toast()` con variantes `'error'` y `'default'`.

## Pasos

### 1. Instalar Sonner
```bash
pnpm --filter @crm/web add sonner
```

### 2. Reescribir `useToast.ts` como wrapper de Sonner
**Archivo:** `apps/web/src/hooks/useToast.ts`

Reemplazar toda la implementación pub/sub por un wrapper sobre `toast` de Sonner:
- `toast({ title, description, variant: 'error' })` → `sonnerToast.error(title, { description })`
- `toast({ title, description, variant: 'default' })` → `sonnerToast.success(title, { description })`
- `toast({ title, description, variant: 'info' })` → `sonnerToast.info(title, { description })`
- `toast({ title, description, variant: 'warning' })` → `sonnerToast.warning(title, { description })`
- `toast({ title, description, variant: 'ai' })` → `sonnerToast(title, { description })`

Misma API exportada → **0 cambios en los 33 archivos consumidores**.

### 3. Reemplazar `<Toaster />` en providers
**Archivo:** `apps/web/src/providers/index.tsx`

- Cambiar import de `@/components/ui/toaster` → `sonner`
- `<Toaster />` de Sonner con: `position="bottom-right"`, `richColors`, `duration={5000}`

### 4. Eliminar componentes Radix toast obsoletos
- Eliminar `apps/web/src/components/ui/toast.tsx`
- Eliminar `apps/web/src/components/ui/toaster.tsx`

### 5. Desinstalar dependencia Radix toast
```bash
pnpm --filter @crm/web remove @radix-ui/react-toast
```

## Archivos a modificar
1. `apps/web/src/hooks/useToast.ts` — reescribir como wrapper
2. `apps/web/src/providers/index.tsx` — cambiar Toaster
3. `apps/web/src/components/ui/toast.tsx` — ELIMINAR
4. `apps/web/src/components/ui/toaster.tsx` — ELIMINAR

## Verificación
- `pnpm --filter @crm/web typecheck` — 0 errores
- `pnpm --filter @crm/web build` — build exitoso
