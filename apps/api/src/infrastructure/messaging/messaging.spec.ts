import {
  EMAIL_TEMPLATES,
  FOLLOW_UP_MESSAGE,
  ICS_ALARM_TEMPLATE,
  NOTIFICATION_TEMPLATES,
  SMS_TEMPLATES,
  TEMPLATE_VARIABLES,
  emailFromTemplate,
  renderTemplate,
  smsFromTemplate,
} from './index';
import type { EmailTemplate } from './email-layout';
import { templateVariables } from './template';

/** Every string of an email template (subject, heading, paragraphs, rows, buttons, links, notes, footer). */
function emailStrings(t: EmailTemplate): string[] {
  return [
    t.subject,
    t.heading,
    t.greeting ?? '',
    ...t.paragraphs,
    ...(t.details ?? []).flatMap((d) => [d.label, d.value]),
    ...(t.button ? [t.button.label, t.button.url] : []),
    ...(t.links ?? []).flatMap((l) => [l.label, l.url]),
    ...(t.notes ?? []),
    ...(t.linkFallback ? [t.linkFallback.label, t.linkFallback.url] : []),
    t.footer ?? '',
  ];
}

/** [template, all of its strings] for every message the product sends. */
const ALL_TEMPLATES: Array<[string, string[]]> = [
  ...Object.entries(EMAIL_TEMPLATES).map(([k, t]) => [`email.${k}`, emailStrings(t as EmailTemplate)] as [string, string[]]),
  ...Object.entries(SMS_TEMPLATES).map(([k, s]) => [`sms.${k}`, [s]] as [string, string[]]),
  ...Object.entries(NOTIFICATION_TEMPLATES).map(([k, s]) => [`notification.${k}`, [s]] as [string, string[]]),
  ['follow_up_message', [FOLLOW_UP_MESSAGE]],
  ['ics_alarm', [ICS_ALARM_TEMPLATE]],
];

describe('renderTemplate', () => {
  it('fills {{placeholders}}, tolerating spaces inside the braces', () => {
    expect(renderTemplate('Hi {{ user_name }}, see you {{appointment_date}}', { user_name: 'Ana', appointment_date: 'Monday' })).toBe(
      'Hi Ana, see you Monday',
    );
  });

  it('renders unknown or empty values as nothing, and a missing {{user_name}} as "there"', () => {
    expect(renderTemplate('[{{location}}]', {})).toBe('[]');
    expect(renderTemplate('Hi {{user_name}},', { user_name: '' })).toBe('Hi there,');
    expect(renderTemplate('Hi {{user_name}},', { user_name: null })).toBe('Hi there,');
  });

  it('does not re-interpret placeholders inside values', () => {
    expect(renderTemplate('{{message}}', { message: '{{reset_url}}', reset_url: 'x' })).toBe('{{reset_url}}');
  });
});

describe('email layout', () => {
  it('escapes every value and keeps line breaks', () => {
    const { html } = emailFromTemplate('agent_email', { subject: 'Hi', message: '<b>bold</b>\n"quoted" & \'single\'' });
    expect(html).toContain('&lt;b&gt;bold&lt;/b&gt;<br>&quot;quoted&quot; &amp; &#39;single&#39;');
    expect(html).not.toContain('<b>bold</b>');
  });

  it('escapes URLs in buttons', () => {
    const { html } = emailFromTemplate('password_reset', { reset_url: 'https://x.test/?a=1&b="2"' });
    expect(html).toContain('href="https://x.test/?a=1&amp;b=&quot;2&quot;"');
  });

  it('drops the parts whose placeholders are empty', () => {
    const { html } = emailFromTemplate('appointment_confirmed', {
      user_name: 'Ana',
      organization_name: 'Clínica Sol',
      appointment_title: 'Checkup',
      appointment_date: 'Monday, March 23, 2026',
      appointment_time: '09:00 AM',
      appointment_end_time: '09:30 AM',
      timezone: 'UTC',
    });
    expect(html).toContain('Checkup');
    expect(html).not.toContain('Location');
    expect(html).not.toContain('Join meeting');
    expect(html).not.toContain('Reschedule or cancel');
  });

  it('keeps the subject on one line', () => {
    expect(emailFromTemplate('agent_email', { subject: 'a\r\nBcc: x@y.z', message: 'm' }).subject).toBe('a Bcc: x@y.z');
  });
});

describe('catalog', () => {
  it.each(ALL_TEMPLATES)('%s only uses documented variables', (_key, texts) => {
    for (const v of texts.flatMap(templateVariables)) expect(Object.keys(TEMPLATE_VARIABLES)).toContain(v);
  });

  it.each(ALL_TEMPLATES)('%s is in English', (_key, texts) => {
    for (const text of texts) expect(text).not.toMatch(/[áéíóúñ¿¡]|\b(Hola|cita|pago|Gracias|Recordatorio|horario|enlace|cancelar)\b/i);
  });

  const PERSONAL_EMAILS = Object.entries(EMAIL_TEMPLATES).filter(([, t]) => (t as EmailTemplate).greeting !== null);
  it.each(PERSONAL_EMAILS)('email %s greets the recipient with {{user_name}}', (_key, t) => {
    expect(emailFromTemplate(_key as keyof typeof EMAIL_TEMPLATES, { user_name: 'Ana' }).html).toContain('Hi Ana,');
    expect((t as EmailTemplate).greeting ?? 'Hi {{user_name}},').toContain('{{user_name}}');
  });

  it('the default follow-up message addresses the contact with {{user_name}}', () => {
    expect(templateVariables(FOLLOW_UP_MESSAGE)).toContain('user_name');
  });

  const APPOINTMENT_EMAILS = Object.keys(EMAIL_TEMPLATES).filter((k) => k.startsWith('appointment_'));
  it.each(APPOINTMENT_EMAILS)('email %s carries the appointment details and the organization', (key) => {
    const used = emailStrings(EMAIL_TEMPLATES[key as keyof typeof EMAIL_TEMPLATES] as EmailTemplate).flatMap(templateVariables);
    for (const v of ['user_name', 'organization_name', 'appointment_title', 'appointment_date', 'appointment_time', 'appointment_end_time', 'timezone', 'location']) {
      expect(used.concat('user_name')).toContain(v);
    }
  });

  const APPOINTMENT_SMS = Object.entries(SMS_TEMPLATES).filter(([k]) => k.startsWith('appointment_'));
  it.each(APPOINTMENT_SMS)('sms %s greets with {{user_name}} and carries the appointment and organization', (_key, text) => {
    const used = templateVariables(text);
    for (const v of ['user_name', 'organization_name', 'appointment_title', 'appointment_date', 'appointment_time']) {
      expect(used).toContain(v);
    }
  });

  it.each(APPOINTMENT_SMS)('sms %s fits in 2 segments with long values and the manage link', (key) => {
    const text =
      smsFromTemplate(key as keyof typeof SMS_TEMPLATES, {
        organization_name: 'Clinica Dental del Norte',
        user_name: 'Maria Fernanda Lopez',
        appointment_title: 'Evaluation and cleaning',
        appointment_date: 'Wednesday, September 30, 2026',
        appointment_time: '10:30 AM',
        confirm_url: 'https://api.example.com/c/abcdefgh',
      }) + smsFromTemplate('manage_suffix', { manage_url: 'https://api.example.com/m/abcdefgh' });
    expect(text.length).toBeLessThanOrEqual(306);
  });
});
