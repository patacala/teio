import { renderTemplate, templateVariables } from './template';

describe('renderTemplate: automation syntax', () => {
  const vars = {
    contact: { first_name: 'Ana', last_name: '', tags: ['vip', 'lead'], custom: { budget: 5000 }, opted_in: false },
    appointment: { title: 'Checkup', manage_url_sms: 'https://x.test/m/1', meeting_url: '' },
    organization_name: 'Clínica Sol',
  };

  it('reads dotted paths, including captured custom fields and lists', () => {
    expect(renderTemplate('{{contact.first_name}} · {{contact.custom.budget}} · {{contact.tags}}', vars)).toBe('Ana · 5000 · vip, lead');
  });

  it('uses the fallback only when the value is empty', () => {
    expect(renderTemplate('Hi {{contact.first_name|there}} {{contact.last_name|friend}}', vars)).toBe('Hi Ana friend');
    expect(renderTemplate('Hi {{contact.nickname | there }}!', vars)).toBe('Hi there!');
  });

  it('renders booleans as yes/no', () => {
    expect(renderTemplate('Opted in: {{contact.opted_in}}', vars)).toBe('Opted in: no');
  });

  it('keeps or drops {{#if}} blocks, with an optional {{else}}', () => {
    const t = 'Confirmed.{{#if appointment.manage_url_sms}} Reschedule or cancel: {{appointment.manage_url_sms}}{{/if}}';
    expect(renderTemplate(t, vars)).toBe('Confirmed. Reschedule or cancel: https://x.test/m/1');
    expect(renderTemplate(t, { appointment: {} })).toBe('Confirmed.');
    expect(renderTemplate('{{#if appointment.meeting_url}}Online{{else}}In person{{/if}}', vars)).toBe('In person');
  });

  it('resolves nested {{#if}} blocks from the inside out', () => {
    const t = '{{#if contact.first_name}}A{{#if appointment.meeting_url}}B{{/if}}C{{/if}}';
    expect(renderTemplate(t, vars)).toBe('AC');
  });

  it('still supports flat platform keys, and a flat key wins over a path', () => {
    expect(renderTemplate('{{organization_name}}', vars)).toBe('Clínica Sol');
    expect(renderTemplate('{{a.b}}', { 'a.b': 'flat', a: { b: 'nested' } })).toBe('flat');
  });

  it('never re-interprets placeholders or conditionals inside values', () => {
    expect(renderTemplate('{{contact.first_name}}', { contact: { first_name: '{{#if x}}y{{/if}}{{secret}}' }, secret: 's' })).toBe(
      '{{#if x}}y{{/if}}{{secret}}',
    );
  });

  it('lists the variables a template uses, conditions included', () => {
    expect(templateVariables('{{#if a.b}}{{c.d|x}}{{/if}} {{user_name}}').sort()).toEqual(['a.b', 'c.d', 'user_name']);
  });
});
