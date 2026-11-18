import { AudienceCompileError, compileAudience } from './audience-sql.compiler';

const one = (field: string, operator: string, value?: unknown) => ({ any: [{ all: [{ field, operator, value }] }] }) as never;

describe('contact filter compiler', () => {
  it('matches everyone when the filter is empty', () => {
    expect(compileAudience(undefined)).toEqual({ sql: 'TRUE', params: {} });
    expect(compileAudience({ any: [{ all: [] }] })).toEqual({ sql: 'TRUE', params: {} });
  });

  it('passes every value as a parameter, never inside the SQL', () => {
    const { sql, params } = compileAudience(one("contact.custom.x'; DROP TABLE contacts; --", 'equals', "'); DELETE"));
    expect(sql).not.toContain('DROP');
    expect(sql).not.toContain('DELETE');
    expect(Object.values(params)).toContain("x'; DROP TABLE contacts; --");
  });

  it.each([
    ['trigger.channel', 'equals', 'sms', 'cannot be used to choose recipients'],
    ['conversation.ai_active', 'is_true', undefined, 'cannot be used to choose recipients'],
    ['contact.tags', 'gt', 3, 'cannot be used with'],
    ['contact.lead_score', 'contains', '5', 'cannot be used with'],
    ['contact.lead_score', 'gt', 'many', 'only be compared with a number'],
    ['contact.created_at', 'older_than_days', 'soon', 'needs a number of days'],
    ['contact.custom.budget', 'gt', 'big', 'only be compared with a number'],
    ['contact.custom.a.b', 'equals', 'x', 'is not a captured field'],
    ['contact.email', 'contains', '', 'needs a value'],
  ])('rejects %s %s %p', (field, operator, value, message) => {
    expect(() => compileAudience(one(field, operator, value))).toThrow(AudienceCompileError);
    expect(() => compileAudience(one(field, operator, value))).toThrow(message);
  });
});
