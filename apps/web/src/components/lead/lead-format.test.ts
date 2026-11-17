import { describe, expect, it } from 'vitest';
import { leadDisplayName, leadFullName, leadInitials } from './lead-format';

describe('lead-format', () => {
  it('joins first and last name', () => {
    expect(leadFullName({ first_name: 'Ada', last_name: 'Lovelace' })).toBe('Ada Lovelace');
  });

  it('falls back to email then phone then a placeholder when there is no name', () => {
    expect(leadDisplayName({ first_name: '', last_name: '', email: 'ada@example.com' })).toBe('ada@example.com');
    expect(leadDisplayName({ first_name: '', last_name: '', phone: '+1234567890' })).toBe('+1234567890');
    expect(leadDisplayName({ first_name: '', last_name: '' })).toBe('Unnamed lead');
  });

  it('builds initials from whatever name is displayed', () => {
    expect(leadInitials({ first_name: 'Ada', last_name: 'Lovelace' })).toBe('AL');
  });
});
