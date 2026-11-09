/**
 * Compares every TypeORM entity with the columns that really exist in the
 * database. Run after `pnpm --filter @crm/api build`, against a database built
 * from packages/database/schemas (plus migrations):
 *
 *   DATABASE_URL=postgres://... pnpm --filter @crm/api db:check-drift
 *
 * Exits with 1 and lists every missing table/column.
 */
require('reflect-metadata');
const path = require('path');
const { DataSource } = require('typeorm');

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required');
  const entitiesDir = path.resolve(__dirname, '..', process.env.ENTITIES_DIR || 'dist');
  const ds = new DataSource({ type: 'postgres', url, entities: [`${entitiesDir}/**/*.entity.js`] });
  await ds.initialize();
  try {
    if (ds.entityMetadatas.length === 0) throw new Error(`No entities found in ${entitiesDir} — build the API first`);
    const rows = await ds.query('SELECT table_schema, table_name, column_name FROM information_schema.columns');
    const columns = new Set(rows.map((r) => `${r.table_schema}.${r.table_name}.${r.column_name}`));
    const tables = new Set(rows.map((r) => `${r.table_schema}.${r.table_name}`));
    const problems = [];
    for (const meta of ds.entityMetadatas) {
      const table = `${meta.schema || 'public'}.${meta.tableName}`;
      if (!tables.has(table)) {
        problems.push(`missing table ${table} (${meta.name})`);
        continue;
      }
      for (const col of meta.columns) {
        if (!columns.has(`${table}.${col.databaseName}`)) {
          problems.push(`missing column ${table}.${col.databaseName} (${meta.name}.${col.propertyName})`);
        }
      }
    }
    console.log(`Checked ${ds.entityMetadatas.length} entities.`);
    if (problems.length) {
      console.error(problems.join('\n'));
      process.exitCode = 1;
    } else {
      console.log('No drift: every entity column exists in the database.');
    }
  } finally {
    await ds.destroy();
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exitCode = 1;
});
