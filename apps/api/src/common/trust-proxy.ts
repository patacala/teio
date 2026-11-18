/**
 * Express "trust proxy" setting, so req.ip is the real client behind Traefik
 * (and the Next.js /api rewrite) instead of the proxy's address. Used by the
 * rate limiter and the demo IP checks.
 *
 * Default: trust proxies on loopback / private networks only. Express then
 * walks X-Forwarded-For from the right and stops at the first public address,
 * so a client cannot spoof its IP by sending its own X-Forwarded-For.
 * Override with TRUST_PROXY: a hop count ("1"), "true"/"false", or a list of
 * addresses/subnets (e.g. when a CDN with public IPs sits in front).
 */
export const DEFAULT_TRUST_PROXY = 'loopback, linklocal, uniquelocal';

export function parseTrustProxy(value: string | undefined | null): boolean | number | string {
  const v = (value ?? '').trim();
  if (!v) return DEFAULT_TRUST_PROXY;
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (/^\d+$/.test(v)) return Number(v);
  return v;
}
