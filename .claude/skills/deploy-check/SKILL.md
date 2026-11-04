---
description: |
  Pre-deploy verification. Runs builds, typecheck, checks for problematic
  imports, and validates that Docker will build correctly.
disable-model-invocation: true
allowed-tools: Read Grep Glob Bash(pnpm *) Bash(graphify *) Bash(docker *)
---

# Pre-Deploy Check

## Automatic checks

### 1. Build backend
```bash
pnpm --filter @crm/api build
```

### 2. Typecheck and lint frontend
```bash
pnpm --filter @crm/web typecheck
pnpm --filter @crm/web lint
```

### 3. Dangerous express imports

Look for value imports of express that cause `require('express')` at runtime
(a known cause of crashes in Docker with pnpm):

```bash
# Look for: import { Request } from 'express'  (without 'type')
# Correct:  import type { Request } from 'express'
```

If you find value imports in controllers with decorators, change them to `import type`.

### 4. Check pending migrations

Check whether there are entity changes without a matching SQL migration.

### 5. Environment variables

Verify that the required env vars are documented:
- SUPABASE_JWT_SECRET
- DATABASE_URL / REDIS_URL
- STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET (if billing)
- RETELL_API_KEY (if voice)
- NEXT_PUBLIC_API_URL / NEXT_PUBLIC_WEB_URL

### 6. Result

Report:
- Build status (pass/fail)
- Dangerous imports found
- Pending migrations
- Missing env vars

$ARGUMENTS
