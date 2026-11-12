import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Signed, single-appointment confirmation links. The version is bumped on
 * every reschedule so links sent for an old time stop working.
 */
export interface ConfirmationClaims {
  appointmentId: string;
  version: number;
  expiresAt: Date;
}

export type TokenError = 'malformed' | 'bad_signature' | 'expired';

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

function sign(secret: string, payload: string): Buffer {
  return createHmac('sha256', secret).update(payload).digest();
}

export function signConfirmationToken(secret: string, claims: ConfirmationClaims): string {
  const payload = `${claims.appointmentId}.${claims.version}.${Math.floor(claims.expiresAt.getTime() / 1000)}`;
  return `${b64url(payload)}.${b64url(sign(secret, payload))}`;
}

export function verifyConfirmationToken(
  secret: string,
  token: string,
  now: Date,
): { ok: true; claims: ConfirmationClaims } | { ok: false; error: TokenError } {
  const [encodedPayload, encodedSig, extra] = String(token ?? '').split('.');
  if (!encodedPayload || !encodedSig || extra !== undefined) return { ok: false, error: 'malformed' };

  const payload = Buffer.from(encodedPayload, 'base64url').toString('utf8');
  const [appointmentId, versionRaw, expRaw] = payload.split('.');
  const version = Number(versionRaw);
  const exp = Number(expRaw);
  if (!appointmentId || !Number.isInteger(version) || !Number.isInteger(exp)) {
    return { ok: false, error: 'malformed' };
  }

  const expected = sign(secret, payload);
  const given = Buffer.from(encodedSig, 'base64url');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return { ok: false, error: 'bad_signature' };
  }
  if (exp * 1000 <= now.getTime()) return { ok: false, error: 'expired' };

  return { ok: true, claims: { appointmentId, version, expiresAt: new Date(exp * 1000) } };
}
