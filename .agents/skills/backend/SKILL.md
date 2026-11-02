---
description: |
  NestJS backend rules for the CRM API. Auto-triggers when writing controllers,
  services, entities, migrations, or any file in apps/api/.
paths: "apps/api/**"
allowed-tools: Read Grep Glob Bash(graphify *) Bash(pnpm --filter @crm/api *)
---

# CRM Backend — Rules

Before writing backend code, enforce every rule below. Violations are bugs.

## Quick Reference

- **Stack**: NestJS + TypeORM 0.3 + PostgreSQL + ioredis + raw BullMQ + RabbitMQ
- **Routes**: Global prefix `api` + version `v1` → `/api/v1/...`
- **Auth**: Supabase JWT. Guards are global — never `@UseGuards()`. Use `@Public()` / `@Roles()` / `@CurrentTenant()`
- **Multi-tenancy**: Every entity has `organization_id`. Every query scoped by it. No exceptions.
- **Enums**: All in `packages/shared/src/enums/index.ts`. Never hardcode strings.

## Critical Rules

1. **Static routes BEFORE param routes** in controller class body. `@Get('stats')` then `@Get(':id')`.
2. **Layer separation**: Controller → Service → Repository. Controllers have zero business logic.
3. **BullMQ**: Always raw `bullmq`. Never `@nestjs/bullmq`. Worker via `OnModuleInit`.
4. **Queue tokens**: In `.constants.ts` files, never in module files (circular deps).
5. **Pagination**: Return `{ items, meta }` via `buildPaginationMeta`. Never `{ data, meta }`.
6. **Errors**: Throw `NotFoundException`, `BadRequestException`, etc. Never raw `Error`.
7. **Migrations**: `packages/database/schemas/NNN_description.sql`, idempotent (`IF NOT EXISTS`).
8. **TypeORM arrays**: `{ type: 'text', array: true, default: '{}' }`. Never `simple-array`.
9. **Timestamps**: Always `timestamptz`. Never `timestamp` without tz.
10. **RabbitMQ**: Use constants from `rabbitmq.constants.ts`. Never inline strings.

## New Module Checklist

- [ ] SQL migration in `packages/database/schemas/`
- [ ] Entity with `organization_id` + `@Index`
- [ ] Service with all queries scoped by org
- [ ] Controller with versioned path, static routes first
- [ ] Module registered in AppModule
- [ ] Shared types/enums updated if needed

For detailed patterns (TypeORM columns, BullMQ setup, enum list, SOLID rules), see [references/](references/).

$ARGUMENTS
