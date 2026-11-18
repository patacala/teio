/**
 * HTTP contract of /automations with the production ValidationPipe, guards,
 * exception filter and response envelope, on a real PostgreSQL:
 *   TEST_DATABASE_URL=postgres://... pnpm --filter @crm/api test automations.http
 * Skipped when TEST_DATABASE_URL is not set.
 */
import { createAutomationHarness, type AutomationHarness } from '../../../test-support/automation-harness';
import { chain, definition, step } from '../../../test-support/automation-fixtures';

const url = process.env.TEST_DATABASE_URL;
const describeDb = url ? describe : describe.skip;
jest.setTimeout(120_000);

describeDb('automations HTTP routes', () => {
  let h: AutomationHarness;
  beforeAll(async () => {
    h = await createAutomationHarness(url!, { http: true });
    // A fresh organization: the list installs its system automations.
    await h.ds.query(`UPDATE core.organizations SET settings = '{}' WHERE id = $1`, [h.org]);
  });
  afterAll(() => h?.close());

  it('lists the automations, installing the system ones on first use', async () => {
    const res = await h.call('agent', 'GET', '/automations');
    expect(res.status).toBe(200);
    const keys = res.body.data.map((a: { template_key: string | null }) => a.template_key);
    expect(keys).toEqual(expect.arrayContaining(['ai_incoming_message', 'booking_confirmed', 'no_response_follow_up']));
    const confirmed = res.body.data.find((a: { template_key: string }) => a.template_key === 'booking_confirmed');
    expect(confirmed).toMatchObject({ status: 'active', is_system: true, category: 'booking', published_version: 1, trigger_keys: ['appointment.confirmed'], sends_to_ai: false });
    const ai = res.body.data.find((a: { template_key: string }) => a.template_key === 'ai_incoming_message');
    expect(ai).toMatchObject({ trigger_keys: ['message.received'], sends_to_ai: true });
  });

  it('lets owners/admins build, validate, publish and pause; others only look', async () => {
    const draft = definition([{ key: 'contact.tag_added' }], chain(step('s', 'send_sms', { text: 'Hi {{contact.first_name}}' })));

    expect((await h.call('agent', 'POST', '/automations', { name: 'Welcome' })).status).toBe(403);
    expect((await h.call('api_key', 'POST', '/automations', { name: 'Welcome' })).status).toBe(403);
    expect((await h.call('admin', 'POST', '/automations', { name: '' })).status).toBe(400);
    expect((await h.call('admin', 'POST', '/automations', { name: 'x', unknown: 1 })).status).toBe(400);

    const created = await h.call('admin', 'POST', '/automations', { name: 'Welcome' });
    expect(created.status).toBe(201);
    const id = created.body.data.id;
    expect(created.body.data).toMatchObject({ status: 'draft', published: null, has_unpublished_changes: true });

    // An invalid draft can be saved but not published.
    const bad = definition([{ key: 'contact.tag_added' }], chain(step('s', 'send_sms', { text: '' })));
    expect((await h.call('admin', 'PUT', `/automations/${id}/draft`, bad)).status).toBe(200);
    const refused = await h.call('admin', 'POST', `/automations/${id}/publish`);
    expect(refused.status).toBe(400);
    expect(refused.body).toMatchObject({
      message: 'Fix the problems before publishing',
      errors: [{ node_key: 's', path: 'config.text', message: 'SMS text is required' }],
    });

    const validation = await h.call('agent', 'POST', '/automations/validate', bad);
    expect(validation.body.data).toEqual({ valid: false, issues: [{ node_key: 's', path: 'config.text', message: 'SMS text is required' }] });

    await h.call('admin', 'PUT', `/automations/${id}/draft`, draft);
    const published = await h.call('owner', 'POST', `/automations/${id}/publish`);
    expect(published.status).toBe(201);
    expect(published.body.data).toMatchObject({ status: 'active', published_version: 1, has_unpublished_changes: false });

    const paused = await h.call('admin', 'POST', `/automations/${id}/pause`, { stop_runs: true });
    expect(paused.body.data.status).toBe('paused');
    expect((await h.call('admin', 'POST', `/automations/${id}/resume`)).body.data.status).toBe('active');

    const detail = await h.call('viewer', 'GET', `/automations/${id}`);
    expect(detail.body.data.published).toMatchObject({ version: 1, triggers: [{ key: 'contact.tag_added' }] });
    expect((await h.call('viewer', 'GET', `/automations/${id}/versions`)).body.data).toHaveLength(1);
  });

  it('refuses to delete a system automation, deletes custom ones', async () => {
    const list = (await h.call('admin', 'GET', '/automations')).body.data as Array<{ id: string; is_system: boolean }>;
    const system = list.find((a) => a.is_system)!;
    expect((await h.call('admin', 'DELETE', `/automations/${system.id}`)).status).toBe(400);
    const custom = (await h.call('admin', 'POST', '/automations', { name: 'Temp' })).body.data.id;
    expect((await h.call('admin', 'DELETE', `/automations/${custom}`)).status).toBe(204);
    expect((await h.call('admin', 'GET', `/automations/${custom}`)).status).toBe(404);
  });

  it('adds contacts by hand, shows their runs, and lets any member stop one', async () => {
    const contact = await h.createContact();
    const created = (await h.call('admin', 'POST', '/automations', { name: 'Manual' })).body.data.id;
    await h.call('admin', 'PUT', `/automations/${created}/draft`, definition([{ key: 'manual' }], chain(step('w', 'wait', { mode: 'duration', duration: { amount: 1, unit: 'days' } }))));
    await h.call('admin', 'POST', `/automations/${created}/publish`);

    const enrolled = await h.call('agent', 'POST', `/automations/${created}/enroll`, { contact_ids: [contact] });
    expect(enrolled.status).toBe(201);
    expect(enrolled.body.data.started).toHaveLength(1);
    await h.drain();

    const runs = await h.call('agent', 'GET', `/automations/${created}/runs?status=waiting`);
    expect(runs.body.data.total).toBe(1);
    const runId = runs.body.data.items[0].id;
    expect(runs.body.data.items[0]).toMatchObject({ status: 'waiting', contact: { id: contact, name: 'Ana García' }, trigger_key: 'manual', version: 1 });

    const detail = await h.call('agent', 'GET', `/automations/runs/${runId}`);
    expect(detail.body.data.steps).toEqual([expect.objectContaining({ node_key: 'w', node_type: 'wait', status: 'running' })]);
    expect((await h.call('agent', 'GET', `/automations/contact/${contact}/runs`)).body.data.map((r: { id: string }) => r.id)).toContain(runId);

    expect((await h.call('agent', 'POST', `/automations/runs/${runId}/cancel`)).body.data).toEqual({ cancelled: true });
    expect((await h.call('agent', 'POST', `/automations/runs/${runId}/cancel`)).body.data).toEqual({ cancelled: false });

    // Integrations add contacts with an API key, as they could start sequences before.
    const other = await h.createContact();
    const byKey = await h.call('api_key', 'POST', `/automations/${created}/enroll`, { contact_ids: [other] });
    expect(byKey.status).toBe(201);
    expect(byKey.body.data.started).toHaveLength(1);

    const notManual = (await h.call('admin', 'GET', '/automations')).body.data.find((a: { template_key: string }) => a.template_key === 'booking_confirmed').id;
    expect((await h.call('admin', 'POST', `/automations/${notManual}/enroll`, { contact_ids: [contact] })).status).toBe(400);
    expect((await h.call('admin', 'POST', `/automations/${created}/enroll`, { contact_ids: ['not-a-uuid'] })).status).toBe(400);
  });

  it('previews how many contacts a filter matches, and explains filters it cannot run', async () => {
    await h.createContact({ tags: ['preview-tag'] });
    await h.createContact({ tags: ['preview-tag'] });
    const filter = { any: [{ all: [{ field: 'contact.tags', operator: 'has_tag', value: 'preview-tag' }] }] };
    expect((await h.call('agent', 'POST', '/automations/audience/preview', { filter })).body.data).toEqual({ count: 2 });
    const bad = await h.call('agent', 'POST', '/automations/audience/preview', { filter: { any: [{ all: [{ field: 'trigger.channel', operator: 'equals', value: 'x' }] }] } });
    expect(bad.status).toBe(400);
  });

  it('offers the organization data the builder needs', async () => {
    await h.createAiConnection();
    const res = await h.call('agent', 'GET', '/automations/catalog');
    expect(res.status).toBe(200);
    expect(res.body.data.tags).toEqual(expect.arrayContaining(['opt-out', 'follow-up', 'preview-tag']));
    expect(res.body.data.ai_connections).toEqual([expect.objectContaining({ name: 'ProSales' })]);
    expect(Object.keys(res.body.data).sort()).toEqual(['ai_connections', 'calendars', 'channels', 'custom_fields', 'services', 'stages', 'tags', 'users']);
  });

  it('only platform admins run the installation backfill', async () => {
    expect((await h.call('owner', 'POST', '/automations/install-all')).status).toBe(403);
    const res = await h.call('platform_admin', 'POST', '/automations/install-all');
    expect(res.status).toBe(201);
    expect(res.body.data.failed).toEqual([]);
  });
});
