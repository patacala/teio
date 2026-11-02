# Full-Stack Architecture Reference

## Clean Architecture — System-Wide

```
+---------------------------------------------------+
|  Presentation      Next.js Pages, Components      |
+---------------------------------------------------+
|  Application       Hooks, Services (frontend)     |
|                    NestJS Controllers, Services    |
+---------------------------------------------------+
|  Domain            Entities, DTOs, Enums           |
|                    packages/shared/                |
+---------------------------------------------------+
|  Infrastructure    TypeORM, Redis, BullMQ,         |
|                    RabbitMQ, Stripe, Supabase      |
+---------------------------------------------------+
```

- Domain layer: zero framework dependencies
- Infrastructure: injected, never instantiated directly
- Application: orchestrates, never holds state
- Presentation: renders, never runs queries

## Module Registration Pattern

```typescript
@Module({
  imports: [TypeOrmModule.forFeature([MyEntity])],
  providers: [MyService],
  controllers: [MyController],
  exports: [MyService],
})
export class MyModule {}

// Register in AppModule
@Module({
  imports: [...existingModules, MyModule],
})
export class AppModule {}
```

## Monorepo Structure

```
crm/
├── apps/
│   ├── api/          NestJS — port 3001
│   └── web/          Next.js 15 — port 3000
├── packages/
│   ├── shared/       Enums, types, DTOs
│   └── database/     SQL migrations (001-NNN)
├── docker-compose.yml
└── turbo.json
```
