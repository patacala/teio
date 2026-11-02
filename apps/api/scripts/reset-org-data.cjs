/**
 * Wipes an organization's operational data while leaving its configuration
 * intact. Dry-run by default — pass --confirm to actually delete.
 *
 *   node apps/api/scripts/reset-org-data.cjs <organization_id>
 *   node apps/api/scripts/reset-org-data.cjs <organization_id> --confirm
 *
 * Without an organization_id it lists the organizations it can see and exits.
 */
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

// Ordered children-first so foreign keys never block a delete.
const OPERATIONAL_TABLES = [
  'voice.call_transcripts',
  'voice.call_events',
  'voice.calls',
  'conversations.messages',
  'conversations.conversations',
  'scheduling.sequence_steps',
  'scheduling.automation_sequences',
  'scheduling.appointments',
  'clients.contact_funnel_history',
  'clients.contact_data_updates',
  'clients.contacts',
  'clients.companies',
  'clients.demo_requests',
  'ai_agents.agent_tool_executions',
  'ai_agents.agent_logs',
  'agents.ai_sessions',
  'analytics.events',
  'analytics.conversation_metrics',
  'analytics.agent_metrics',
  'integrations.webhook_deliveries',
  'integrations.communication_deliveries',
];

/**
 * Tables with no organization_id of their own. Each maps to a predicate that
 * reaches the org through a parent, so the delete stays scoped to one tenant.
 */
const SCOPE_OVERRIDES = {
  'clients.contact_funnel_history':
    'contact_id IN (SELECT id FROM clients.contacts WHERE organization_id = $1)',
};

// Listed only so the script can report what it is deliberately not touching.
const PRESERVED_TABLES = [
  'core.organizations',
  'core.users',
  'core.api_keys',
  'integrations.webhooks',
  'integrations.channels',
  'integrations.channel_configs',
  'integrations.communication_templates',
  'agents.ai_agents',
  'agents.agent_capture_fields',
  'ai_agents.agents',
  'ai_agents.agent_tools',
  'scheduling.calendars',
  'scheduling.work_schedules',
  'scheduling.sequence_templates',
  'scheduling.sequence_template_steps',
  'clients.funnels',
  'clients.funnel_stages',
  'clients.funnel_templates',
  'clients.funnel_template_stages',
  'knowledge.knowledge_entries',
  'conversations.labels',
  'conversations.message_templates',
  'billing.plans',
  'billing.subscriptions',
  'billing.invoices',
  'billing.usage',
];

function loadDatabaseUrl() {
  const envPath = path.join(__dirname, '..', '.env');
  const line = fs
    .readFileSync(envPath, 'utf8')
    .split('\n')
    .find((l) => l.startsWith('DATABASE_URL='));
  if (!line) throw new Error(`DATABASE_URL not found in ${envPath}`);
  return line.slice('DATABASE_URL='.length).trim();
}

/** Which of the listed tables actually exist, and do they have organization_id? */
async function introspect(client, tables) {
  const { rows } = await client.query(
    `SELECT table_schema || '.' || table_name AS name,
            bool_or(column_name = 'organization_id') AS has_org
     FROM information_schema.columns
     WHERE table_schema || '.' || table_name = ANY($1)
     GROUP BY 1`,
    [tables],
  );
  return new Map(rows.map((r) => [r.name, r.has_org]));
}

(async () => {
  const args = process.argv.slice(2);
  const confirm = args.includes('--confirm');
  const orgId = args.find((a) => !a.startsWith('--'));

  const client = new Client({
    connectionString: loadDatabaseUrl(),
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  try {
    if (!orgId) {
      const { rows } = await client.query(
        `SELECT o.id, o.name, o.slug,
                (SELECT COUNT(*) FROM clients.contacts c WHERE c.organization_id = o.id) AS contacts,
                (SELECT COUNT(*) FROM voice.calls v WHERE v.organization_id = o.id) AS calls
         FROM core.organizations o ORDER BY o.created_at`,
      );
      console.log('Organizations:\n');
      console.table(rows);
      console.log('\nRe-run with one of these ids.');
      return;
    }

    const present = await introspect(client, OPERATIONAL_TABLES);

    const missing = OPERATIONAL_TABLES.filter((t) => !present.has(t));
    if (missing.length) console.log(`Skipping (table absent): ${missing.join(', ')}`);

    const unscopable = OPERATIONAL_TABLES.filter(
      (t) => present.get(t) === false && !SCOPE_OVERRIDES[t],
    );
    if (unscopable.length) {
      console.error(`ABORT — no organization_id and no scope override: ${unscopable.join(', ')}`);
      process.exitCode = 1;
      return;
    }

    const targets = OPERATIONAL_TABLES.filter((t) => present.has(t)).map((table) => ({
      table,
      where: present.get(table) ? 'organization_id = $1' : SCOPE_OVERRIDES[table],
    }));

    // Always report counts first, whether or not we are about to delete.
    const counts = [];
    let grandTotal = 0;
    for (const { table, where } of targets) {
      const { rows } = await client.query(
        `SELECT COUNT(*)::int AS n FROM ${table} WHERE ${where}`,
        [orgId],
      );
      counts.push({ table, rows: rows[0].n });
      grandTotal += rows[0].n;
    }

    console.log(`\nOrganization ${orgId} — rows that WOULD BE DELETED:\n`);
    console.table(counts);
    console.log(`TOTAL: ${grandTotal} rows across ${targets.length} tables`);
    console.log(`\nPRESERVED (untouched): ${PRESERVED_TABLES.join(', ')}\n`);

    if (!confirm) {
      console.log('DRY RUN — nothing was deleted. Re-run with --confirm to execute.');
      return;
    }

    await client.query('BEGIN');
    const deleted = [];
    for (const { table, where } of targets) {
      const res = await client.query(`DELETE FROM ${table} WHERE ${where}`, [orgId]);
      deleted.push({ table, deleted: res.rowCount });
    }
    await client.query('COMMIT');

    console.log('DELETED:\n');
    console.table(deleted);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    await client.end();
  }
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
