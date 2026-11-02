---
description: |
  Verificacion pre-deploy. Corre builds, typecheck, revisa imports
  problematicos y valida que Docker compilara correctamente.
disable-model-invocation: true
allowed-tools: Read Grep Glob Bash(pnpm *) Bash(graphify *) Bash(docker *)
---

# Pre-Deploy Check

## Verificaciones automaticas

### 1. Build backend
```bash
pnpm --filter @crm/api build
```

### 2. Typecheck frontend
```bash
pnpm --filter @crm/web typecheck
```

### 3. Imports peligrosos de express

Busca value imports de express que causan `require('express')` en runtime
(causa conocida de crash en Docker con pnpm):

```bash
# Buscar: import { Request } from 'express'  (sin 'type')
# Correcto: import type { Request } from 'express'
```

Si encuentras value imports en controllers con decorators, cambialos a `import type`.

### 4. Verificar migraciones pendientes

Revisa si hay cambios en entities que no tienen migracion SQL correspondiente.

### 5. Variables de entorno

Verifica que las env vars necesarias estan documentadas:
- SUPABASE_JWT_SECRET
- DATABASE_URL / REDIS_URL
- STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET (si billing)
- RETELL_API_KEY (si voice)
- NEXT_PUBLIC_API_URL / NEXT_PUBLIC_WEB_URL

### 6. Resultado

Reporta:
- Build status (pass/fail)
- Imports peligrosos encontrados
- Migraciones pendientes
- Env vars faltantes

$ARGUMENTS
