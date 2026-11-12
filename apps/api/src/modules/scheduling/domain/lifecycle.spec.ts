import { canTransition, isActiveBooking, needsOutcome } from './lifecycle';
import { signConfirmationToken, verifyConfirmationToken } from './confirmation-token';

const ALL = ['held', 'scheduled', 'confirmed', 'completed', 'no_show', 'cancelled'];

describe('booking transitions', () => {
  const allowed: Record<string, string[]> = {
    held: ['confirmed', 'cancelled'],
    scheduled: ['confirmed', 'cancelled', 'completed', 'no_show'],
    confirmed: ['completed', 'no_show', 'cancelled'],
    completed: ['no_show'],
    no_show: ['completed'],
    cancelled: [],
  };

  for (const from of ALL) {
    for (const to of ALL) {
      const expected = allowed[from].includes(to);
      it(`${from} → ${to} is ${expected ? 'allowed' : 'rejected'}`, () => {
        expect(canTransition(from, to)).toBe(expected);
      });
    }
  }

  it('only held, scheduled and confirmed occupy a slot', () => {
    expect(ALL.filter(isActiveBooking)).toEqual(['held', 'scheduled', 'confirmed']);
  });

  it('flags ended, unresolved bookings as needing an outcome', () => {
    const now = new Date('2026-03-23T12:00:00Z');
    const ended = new Date('2026-03-23T11:00:00Z');
    expect(needsOutcome({ status: 'confirmed', ends_at: ended }, now)).toBe(true);
    expect(needsOutcome({ status: 'scheduled', ends_at: ended }, now)).toBe(true);
    expect(needsOutcome({ status: 'completed', ends_at: ended }, now)).toBe(false);
    expect(needsOutcome({ status: 'confirmed', ends_at: new Date('2026-03-23T13:00:00Z') }, now)).toBe(false);
  });
});

describe('confirmation tokens', () => {
  const secret = 'test-secret-with-enough-length-123';
  const now = new Date('2026-03-20T00:00:00Z');
  const claims = { appointmentId: '10000000-0000-0000-0000-000000000001', version: 2, expiresAt: new Date('2026-03-23T15:00:00Z') };

  it('round-trips', () => {
    const result = verifyConfirmationToken(secret, signConfirmationToken(secret, claims), now);
    expect(result).toEqual({ ok: true, claims });
  });

  it('rejects tampering, other secrets, expiry and garbage', () => {
    const token = signConfirmationToken(secret, claims);
    const forged = signConfirmationToken(secret, { ...claims, version: 3 }).split('.')[0] + '.' + token.split('.')[1];
    expect(verifyConfirmationToken(secret, forged, now)).toEqual({ ok: false, error: 'bad_signature' });
    expect(verifyConfirmationToken('other-secret', token, now)).toEqual({ ok: false, error: 'bad_signature' });
    expect(verifyConfirmationToken(secret, token, new Date('2026-03-23T15:00:00Z'))).toEqual({ ok: false, error: 'expired' });
    expect(verifyConfirmationToken(secret, 'abc', now)).toEqual({ ok: false, error: 'malformed' });
    expect(verifyConfirmationToken(secret, '', now)).toEqual({ ok: false, error: 'malformed' });
  });
});
