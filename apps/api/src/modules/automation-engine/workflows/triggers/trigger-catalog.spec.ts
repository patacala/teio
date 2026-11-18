import { TRIGGER_CATALOG, findTrigger } from '@crm/shared';
import { RABBITMQ_QUEUES } from '../../../../infrastructure/rabbitmq/rabbitmq.constants';

describe('trigger catalog', () => {
  const topics = new Set<string>(Object.values(RABBITMQ_QUEUES));

  it('listens only to topics the API publishes', () => {
    const unknown = TRIGGER_CATALOG.filter((t) => t.topic && !topics.has(t.topic)).map((t) => `${t.key} → ${t.topic}`);
    expect(unknown).toEqual([]);
  });

  it('has a topic for every event trigger and none for schedule/manual', () => {
    for (const t of TRIGGER_CATALOG) {
      if (t.key === 'schedule' || t.key === 'manual') expect(t.topic).toBeUndefined();
      else expect(t.topic).toBeDefined();
    }
  });

  it('has unique keys, and only schedules run for the whole organization', () => {
    expect(new Set(TRIGGER_CATALOG.map((t) => t.key)).size).toBe(TRIGGER_CATALOG.length);
    expect(TRIGGER_CATALOG.filter((t) => t.scope === 'organization').map((t) => t.key)).toEqual(['schedule']);
  });

  it('only exposes trigger.* fields as trigger filters', () => {
    for (const t of TRIGGER_CATALOG) {
      for (const f of t.fields) expect(f.path.startsWith('trigger.')).toBe(true);
    }
    expect(findTrigger('message.sent')?.topic).toBe('message.send');
  });
});
