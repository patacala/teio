---
description: |
  Creates a SQL migration for PostgreSQL. Generates the idempotent file
  in packages/database/schemas/ and updates the corresponding TypeORM entity.
arguments: [description]
disable-model-invocation: true
allowed-tools: Read Grep Glob Write Edit Bash(ls *) Bash(graphify *)
---

# New Migration: $description

## Steps

### 1. Determine the number

```bash
ls packages/database/schemas/ | sort -n | tail -5
```

Use N+1 of the last file.

### 2. Create the SQL file

`packages/database/schemas/{NNN}_$description.sql`

Rules:
- `CREATE TABLE IF NOT EXISTS` / `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`
- `organization_id UUID NOT NULL` in every new table
- `created_at TIMESTAMPTZ DEFAULT NOW()` + `updated_at TIMESTAMPTZ DEFAULT NOW()`
- Timestamps are always `TIMESTAMPTZ`, never `TIMESTAMP`
- Arrays: `TEXT[]`, `INTEGER[]`, etc. (native PG)
- JSON: `JSONB`, never `JSON`
- Indexes: `CREATE INDEX IF NOT EXISTS` on organization_id and search fields
- FKs: `REFERENCES schema.table(id) ON DELETE CASCADE/SET NULL`
- Seeds: `INSERT INTO ... ON CONFLICT DO NOTHING` for initial data

### 3. Update the TypeORM entity

Modify or create the corresponding entity in `apps/api/src/modules/` so it matches the SQL exactly.

### 4. Verify the build

```bash
pnpm --filter @crm/api build
```

$ARGUMENTS
