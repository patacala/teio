---
description: |
  Adds a new endpoint to an existing backend module.
  Creates the method in service + controller and updates the frontend service and hook.
arguments: [module, action]
disable-model-invocation: true
allowed-tools: Read Grep Glob Write Edit Bash(graphify *)
---

# New Endpoint: $action in $module

## Steps

### 1. Investigate the existing module

```bash
graphify query "$module controller service routes"
```

Read the current controller and service to understand the structure.

### 2. Add the method to the service

- In `apps/api/src/modules/$module/*.service.ts`
- Always scoped by `organization_id`
- One method = one responsibility

### 3. Add the route to the controller

- Static route BEFORE `:id` routes, if applicable
- `@CurrentTenant()` to get the org
- `import type { Request } from 'express'` if you need Request

### 4. DTO if needed

- Create a DTO with `class-validator` decorators
- Granular: don't reuse bloated DTOs

### 5. Update the frontend

- Add the method in `apps/web/src/services/$module.service.ts`
- Add/update the hook in `apps/web/src/hooks/`
- `invalidateQueries` in mutations

### 6. Verify

- `pnpm --filter @crm/api build`
- `graphify update .`

$ARGUMENTS
