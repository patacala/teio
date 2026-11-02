/**
 * Integration test of the funnel automation FLOW against the live DB.
 *
 * Runs entirely inside a transaction and ROLLS BACK — nothing is persisted.
 * It replays FunnelRulesService.evaluate() (terminal skip, 24h manual
 * anti-override, from_stage_types, BANT conditions, forward_only, resolve
 * to_stage_type in the contact's funnel) against the REAL seeded funnel_rules,
 * validating the rules + stage_types + BANT conditions + schema end-to-end.
 *
 * Run:  cd apps/api && node test/funnel-flow.integration.js
 * (needs DATABASE_URL in apps/api/.env; uses the pg dep already in apps/api)
 */
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const url = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8')
  .match(/^DATABASE_URL=(.*)$/m)[1].trim().replace(/^["']|["']$/g, '');

const MANUAL_WINDOW_MS = 24 * 60 * 60 * 1000;
const STAGES = [
  ['New Lead', 0, 'new', false],
  ['Contacted', 1, 'contacted', false],
  ['Qualified', 2, 'qualified', false],
  ['Appointment Scheduled', 3, 'appointment_scheduled', false],
  ['Appointment Confirmed', 4, 'appointment_confirmed', false],
  ['Won', 5, 'won', true],
  ['Lost', 6, 'lost', true],
];

let pass = 0, fail = 0;
const assert = (cond, msg) => cond
  ? (pass++, console.log(`  ✅ ${msg}`))
  : (fail++, console.log(`  ❌ ${msg}`));

// Mirror of FunnelRulesService.matchesConditions
function matchesConditions(conditions, customFields) {
  const required = (conditions && conditions.custom_fields) || {};
  const fields = customFields || {};
  for (const [key, expected] of Object.entries(required)) {
    const actual = fields[key];
    if (expected === '*') {
      if (actual === undefined || actual === null || actual === '') return false;
    } else if (expected === true) {
      if (!(actual === true || actual === 'true' || actual === 'yes')) return false;
    } else if (actual !== expected) return false;
  }
  return true;
}

(async () => {
  const c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await c.connect();
  await c.query('BEGIN');
  try {
    const ORG = (await c.query(`SELECT id FROM core.organizations ORDER BY created_at ASC LIMIT 1`)).rows[0].id;

    const funnel = (await c.query(
      `INSERT INTO clients.funnels (organization_id, name) VALUES ($1,$2) RETURNING id`,
      [ORG, 'ZZZ_TEST_FUNNEL'])).rows[0];
    const stageId = {};
    for (const [name, pos, type, terminal] of STAGES) {
      stageId[type] = (await c.query(
        `INSERT INTO clients.funnel_stages (organization_id, funnel_id, name, position, stage_type, is_terminal)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
        [ORG, funnel.id, name, pos, type, terminal])).rows[0].id;
    }

    const newContact = async (atType, custom = {}) => (await c.query(
      `INSERT INTO clients.contacts (organization_id, first_name, status, lead_stage, custom_fields)
       VALUES ($1,'ZZZ_Test','active',$2,$3) RETURNING id`,
      [ORG, stageId[atType], JSON.stringify(custom)])).rows[0].id;

    const stageTypeOf = async (id) => (await c.query(
      `SELECT s.stage_type FROM clients.contacts ct
       JOIN clients.funnel_stages s ON s.id = ct.lead_stage::uuid WHERE ct.id=$1`, [id])).rows[0]?.stage_type;

    async function evaluate(contactId, triggerEvent) {
      const ct = (await c.query(
        `SELECT lead_stage, custom_fields FROM clients.contacts WHERE id=$1 AND organization_id=$2`,
        [contactId, ORG])).rows[0];
      if (!ct?.lead_stage) return;
      const cur = (await c.query(
        `SELECT id, funnel_id, position, stage_type, is_terminal FROM clients.funnel_stages WHERE id=$1::uuid`,
        [ct.lead_stage])).rows[0];
      if (!cur || cur.is_terminal) return;

      const last = (await c.query(
        `SELECT source, created_at FROM clients.contact_funnel_history WHERE contact_id=$1 ORDER BY created_at DESC LIMIT 1`,
        [contactId])).rows[0];
      if (last && last.source === 'manual' && Date.now() - new Date(last.created_at).getTime() < MANUAL_WINDOW_MS) return;

      const rules = (await c.query(
        `SELECT * FROM clients.funnel_rules WHERE trigger_event=$1 AND is_active=true
           AND (organization_id=$2 OR organization_id IS NULL) ORDER BY priority DESC`,
        [triggerEvent, ORG])).rows;

      for (const rule of rules) {
        if (rule.funnel_id && rule.funnel_id !== cur.funnel_id) continue;
        if (rule.from_stage_types.length && !rule.from_stage_types.includes(cur.stage_type)) continue;
        if (!matchesConditions(rule.conditions, ct.custom_fields)) continue;
        const target = (await c.query(
          `SELECT id, position FROM clients.funnel_stages WHERE funnel_id=$1 AND stage_type=$2`,
          [cur.funnel_id, rule.to_stage_type])).rows[0];
        if (!target || target.id === cur.id) continue;
        if (rule.direction_policy === 'forward_only' && target.position <= cur.position) continue;
        await c.query(`UPDATE clients.contacts SET lead_stage=$1 WHERE id=$2`, [target.id, contactId]);
        await c.query(
          `INSERT INTO clients.contact_funnel_history (contact_id, from_stage_id, to_stage_id, source, reason)
           VALUES ($1,$2,$3,'automation',$4)`, [contactId, cur.id, target.id, rule.name]);
        return rule.name;
      }
    }

    const FULL_BANT = { is_decision_maker: 'true', has_budget: 'true', timeline: 'next month', service_needed: 'dental cleaning' };

    console.log('\nTest 1 — full pipeline advance');
    const A = await newContact('new');
    assert(await stageTypeOf(A) === 'new', 'starts at new');
    await evaluate(A, 'message.received');
    assert(await stageTypeOf(A) === 'contacted', 'message.received: new → contacted');
    await c.query(`UPDATE clients.contacts SET custom_fields=$1 WHERE id=$2`, [JSON.stringify({ is_decision_maker: 'true' }), A]);
    await evaluate(A, 'contact.data.captured');
    assert(await stageTypeOf(A) === 'contacted', 'partial BANT: stays contacted');
    await c.query(`UPDATE clients.contacts SET custom_fields=$1 WHERE id=$2`, [JSON.stringify(FULL_BANT), A]);
    await evaluate(A, 'contact.data.captured');
    assert(await stageTypeOf(A) === 'qualified', 'full BANT: contacted → qualified');
    await evaluate(A, 'appointment.created');
    assert(await stageTypeOf(A) === 'appointment_scheduled', 'appointment.created → appointment_scheduled');
    await evaluate(A, 'appointment.confirmed');
    assert(await stageTypeOf(A) === 'appointment_confirmed', 'appointment.confirmed → appointment_confirmed');
    await evaluate(A, 'appointment.completed');
    assert(await stageTypeOf(A) === 'won', 'appointment.completed → won');
    await evaluate(A, 'message.received');
    await evaluate(A, 'appointment.created');
    assert(await stageTypeOf(A) === 'won', 'terminal won: no event moves it');

    console.log('\nTest 2 — manual anti-override guard');
    const B = await newContact('new');
    await c.query(
      `INSERT INTO clients.contact_funnel_history (contact_id, to_stage_id, source) VALUES ($1,$2,'manual')`,
      [B, stageId['new']]);
    await evaluate(B, 'message.received');
    assert(await stageTypeOf(B) === 'new', 'recent manual move blocks automation');

    console.log('\nTest 3 — lost on sequence exhausted');
    const C = await newContact('contacted');
    await evaluate(C, 'sequence.exhausted');
    assert(await stageTypeOf(C) === 'lost', 'sequence.exhausted: contacted → lost');

    console.log(`\n──── RESULT: ${pass} passed, ${fail} failed ────`);
  } finally {
    await c.query('ROLLBACK');
    await c.end();
  }
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
