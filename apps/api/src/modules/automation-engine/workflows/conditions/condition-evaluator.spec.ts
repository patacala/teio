import type { ConditionGroup } from '@crm/shared';
import { evaluateCondition, evaluateRule, matchesKeywords } from './condition-evaluator';
import { DEFAULT_OPT_OUT_KEYWORDS } from '../system/opt-out-keywords';

const NOW = new Date('2026-03-20T12:00:00Z');
const scope = {
  contact: {
    first_name: 'Ana',
    email: 'ana@example.com',
    phone: null,
    tags: ['VIP', 'lead'],
    lead_score: 60,
    handled_by: 'ai',
    channels: ['whatsapp', 'email'],
    custom: { budget: '5000', decision_maker: 'yes', urgency_level: 'High' },
    created_at: '2026-03-01T00:00:00Z',
    last_contacted_at: null,
  },
  conversation: { channel: 'whatsapp', ai_active: true },
  trigger: { channel: 'whatsapp', content: 'Hola, ¿tienen citas mañana?', reminder: false, offset_minutes: 1440 },
};
const rule = (field: string, operator: string, value?: unknown) => evaluateRule({ field, operator, value } as never, scope, NOW);
const group = (...blocks: Array<Array<[string, string, unknown?]>>): ConditionGroup => ({
  any: blocks.map((rules) => ({ all: rules.map(([field, operator, value]) => ({ field, operator, value }) as never) })),
});

describe('condition evaluator', () => {
  it('matches text case-insensitively and lists by membership', () => {
    expect(rule('contact.first_name', 'equals', 'ana')).toBe(true);
    expect(rule('contact.tags', 'equals', 'vip')).toBe(true);
    expect(rule('contact.tags', 'not_equals', 'customer')).toBe(true);
    expect(rule('contact.channels', 'equals', 'sms')).toBe(false);
    expect(rule('contact.custom.urgency_level', 'in', ['high', 'urgent'])).toBe(true);
    expect(rule('trigger.channel', 'not_in', 'instagram, facebook')).toBe(true);
  });

  it('handles tags, emptiness, contains and starts_with', () => {
    expect(rule('contact.tags', 'has_tag', 'vip')).toBe(true);
    expect(rule('contact.tags', 'not_has_tag', 'opt-out')).toBe(true);
    expect(rule('contact.phone', 'is_empty')).toBe(true);
    expect(rule('contact.email', 'is_not_empty')).toBe(true);
    expect(rule('contact.nickname', 'is_empty')).toBe(true);
    expect(rule('trigger.content', 'contains', 'CITAS')).toBe(true);
    expect(rule('contact.email', 'starts_with', 'ANA@')).toBe(true);
  });

  it('matches booleans loosely, like the funnel rules', () => {
    expect(rule('contact.custom.decision_maker', 'is_true')).toBe(true);
    expect(rule('contact.custom.decision_maker', 'equals', true)).toBe(true);
    expect(rule('conversation.ai_active', 'is_true')).toBe(true);
    expect(rule('trigger.reminder', 'is_false')).toBe(true);
    expect(rule('trigger.reminder', 'equals', false)).toBe(true);
  });

  it('compares numbers (also numeric text) and dates', () => {
    expect(rule('contact.lead_score', 'gte', 60)).toBe(true);
    expect(rule('contact.lead_score', 'gt', '60')).toBe(false);
    expect(rule('contact.custom.budget', 'lt', 10000)).toBe(true);
    expect(rule('trigger.offset_minutes', 'equals', '1440')).toBe(true);
    expect(rule('contact.created_at', 'lt', '2026-03-02')).toBe(true);
  });

  it('compares ages in days, and a missing date never matches', () => {
    expect(rule('contact.created_at', 'older_than_days', 14)).toBe(true);
    expect(rule('contact.created_at', 'newer_than_days', 30)).toBe(true);
    expect(rule('contact.created_at', 'newer_than_days', 7)).toBe(false);
    expect(rule('contact.last_contacted_at', 'older_than_days', 30)).toBe(false);
    expect(rule('contact.last_contacted_at', 'newer_than_days', 30)).toBe(false);
  });

  it('a missing value never satisfies a comparison', () => {
    expect(rule('contact.custom.missing', 'equals', 'x')).toBe(false);
    expect(rule('contact.custom.missing', 'gt', 1)).toBe(false);
    expect(rule('contact.custom.missing', 'contains', 'x')).toBe(false);
  });

  it('ORs blocks and ANDs the rules inside a block; empty always matches', () => {
    expect(evaluateCondition(undefined, scope, NOW)).toBe(true);
    expect(evaluateCondition({ any: [] }, scope, NOW)).toBe(true);
    expect(evaluateCondition({ any: [{ all: [] }] }, scope, NOW)).toBe(true);
    expect(evaluateCondition(group([['contact.tags', 'has_tag', 'vip'], ['trigger.channel', 'equals', 'sms']]), scope, NOW)).toBe(false);
    expect(
      evaluateCondition(
        group([['trigger.channel', 'equals', 'sms']], [['contact.lead_score', 'gt', 50], ['conversation.ai_active', 'is_true']]),
        scope,
        NOW,
      ),
    ).toBe(true);
  });
});

describe('keyword matching', () => {
  it('matches whole words and phrases, ignoring case, accents and spacing', () => {
    expect(matchesKeywords('Por favor, NO  MÁS mensajes', ['no mas'])).toBe(true);
    expect(matchesKeywords('stopped', ['stop'])).toBe(false);
    expect(matchesKeywords('Please STOP.', ['stop'])).toBe(true);
    expect(matchesKeywords('deja de escribirme', ['deja de escribir*'])).toBe(true);
    expect(matchesKeywords('deja de escribirme', ['deja de escribir'])).toBe(false);
    expect(matchesKeywords('precio?', [' ', ''])).toBe(false);
  });

  // The regular expressions that used to be hard-coded for inbound opt-outs.
  const LEGACY = [
    /\bno\s+(quiero|deseo|necesito)\b/i,
    /\bya\s+no\b/i,
    /\bno\s+m[aá]s\b/i,
    /\b(stop|cancelar|parar|desuscribir|unsubscribe)\b/i,
    /\bdeja\s+de\s+(escribir|enviar|mandar)/i,
    /\bno\s+(me\s+)?(contacten|escriban|envien|manden)/i,
  ];
  const legacy = (text: string) => LEGACY.some((p) => p.test(text.toLowerCase().trim()));

  const CORPUS = [
    'STOP',
    'stop por favor',
    'Unsubscribe me',
    'Quiero cancelar',
    'ya no me interesa',
    'no quiero más mensajes',
    'No deseo continuar',
    'no necesito nada gracias',
    'no más por favor',
    'no mas',
    'deja de escribirme',
    'Deja de enviar cosas',
    'dejá de mandarme mensajes',
    'no me contacten',
    'no me escriban más',
    'no envien nada',
    'no manden promociones',
    'hola, quiero una cita',
    'sí, me interesa',
    'cuánto cuesta?',
    'no, el martes no puedo',
    'no sé todavía',
    'mañana a las 10',
    'parará el servicio?',
    'stopwatch',
    'la cancelación es gratis?',
  ];

  /**
   * The legacy expressions used ASCII word boundaries, so accented letters
   * broke them both ways. These are the only intended differences.
   */
  const FIXED_BY_ACCENT_HANDLING: Record<string, boolean> = {
    'dejá de mandarme mensajes': true, // "dejá" (stop) was missed
    'parará el servicio?': false, // "parar" inside "parará" was a false opt-out
    'no me envíen nada': true, // "envíen" was missed
  };

  it('the default opt-out keywords agree with the legacy expressions, except accent fixes', () => {
    const disagreements = [...new Set([...CORPUS, ...Object.keys(FIXED_BY_ACCENT_HANDLING)])]
      .filter((text) => matchesKeywords(text, DEFAULT_OPT_OUT_KEYWORDS) !== legacy(text))
      .sort();
    expect(disagreements).toEqual(Object.keys(FIXED_BY_ACCENT_HANDLING).sort());
    for (const [text, optOut] of Object.entries(FIXED_BY_ACCENT_HANDLING)) {
      expect(matchesKeywords(text, DEFAULT_OPT_OUT_KEYWORDS)).toBe(optOut);
    }
  });
});
