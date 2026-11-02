# Backend Reference Patterns

## TypeORM Column Rules

| Data type | Correct decorator | Wrong |
|-----------|-------------------|-------|
| PG native array | `{ type: 'text', array: true, default: '{}' }` | `simple-array` |
| JSON object | `{ type: 'jsonb', default: {} }` | `{ type: 'json' }` |
| Timestamps | `{ type: 'timestamptz' }` | `timestamp` without tz |
| Soft strings | `{ length: N }` | bare `@Column()` on string |
| Enum column | `{ type: 'enum', enum: MyEnum }` | string column + manual check |

## Auth Pattern

```
Request → TenantContextMiddleware (global) → JwtAuthGuard (APP_GUARD) → RolesGuard (APP_GUARD)
```

- `@Public()` to skip auth (webhooks, health).
- `@Roles(UserRole.ADMIN)` for admin routes.
- `@CurrentTenant()` returns `TenantContext { organization_id, user_id, role }`.

## BullMQ Pattern

```typescript
// Provider factory
{ provide: MY_QUEUE_TOKEN, useFactory: (config) => new Queue('name', { connection }), inject: [ConfigService] }

// Worker via OnModuleInit
class MyProcessor implements OnModuleInit {
  onModuleInit() {
    new Worker('name', async (job) => { ... }, { connection });
  }
}
```

## SOLID Enforcement

| Principle | Rule |
|-----------|------|
| S — Single Responsibility | One service per domain aggregate |
| O — Open/Closed | New methods/classes, never modify working ones |
| L — Liskov | Implementations honor full interface contract |
| I — Interface Segregation | Granular DTOs, no fat objects |
| D — Dependency Inversion | Inject tokens, not concrete classes |

## Available Enums (from @crm/shared)

ChannelType, ConversationStatus, MessageType, MessageDirection, MessageStatus,
AgentStatus, AIAgentStatus, AIProvider, AppointmentStatus, WebhookEventType,
OrganizationPlan, UserRole, ContactStatus, RabbitMQExchange, RabbitMQRoutingKey

## Service Method Design

- One method = one responsibility
- No boolean flags as params — split into separate methods
- `findAll(orgId)` / `findAllIncludingDeleted(orgId)` not `findAll(orgId, includeDeleted)`
