---
description: |
  Crea una migracion SQL para PostgreSQL. Genera el archivo idempotente
  en packages/database/schemas/ y actualiza la entidad TypeORM correspondiente.
arguments: [descripcion]
disable-model-invocation: true
allowed-tools: Read Grep Glob Write Edit Bash(ls *) Bash(graphify *)
---

# Nueva Migracion: $descripcion

## Pasos

### 1. Determinar numero

```bash
ls packages/database/schemas/ | sort -n | tail -5
```

Usa N+1 del ultimo archivo.

### 2. Crear archivo SQL

`packages/database/schemas/{NNN}_$descripcion.sql`

Reglas:
- `CREATE TABLE IF NOT EXISTS` / `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`
- `organization_id UUID NOT NULL` en toda tabla nueva
- `created_at TIMESTAMPTZ DEFAULT NOW()` + `updated_at TIMESTAMPTZ DEFAULT NOW()`
- Timestamps siempre `TIMESTAMPTZ`, nunca `TIMESTAMP`
- Arrays: `TEXT[]`, `INTEGER[]`, etc (nativos PG)
- JSON: `JSONB`, nunca `JSON`
- Indices: `CREATE INDEX IF NOT EXISTS` en organization_id y campos de busqueda
- FKs: `REFERENCES schema.table(id) ON DELETE CASCADE/SET NULL`
- Seeds: `INSERT INTO ... ON CONFLICT DO NOTHING` para datos iniciales

### 3. Actualizar entidad TypeORM

Modifica o crea la entidad correspondiente en `apps/api/src/modules/` para que coincida exactamente con el SQL.

### 4. Verificar build

```bash
pnpm --filter @crm/api build
```

$ARGUMENTS
