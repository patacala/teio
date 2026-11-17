/**
 * Channel configs hold provider credentials (Meta page tokens, app secrets,
 * webhook verify tokens, Telnyx/Retell API keys…). They must never reach the
 * browser. The edit form sends `***` back for untouched secrets, which
 * ChannelsService.update() already ignores, so masking is safe for editing.
 */
export const MASKED_VALUE = '***';

const EXPLICIT_SENSITIVE_KEYS = new Set([
  'api_key',
  'password',
  'access_token',
  'page_access_token',
  'api_secret',
  'app_secret',
  'auth_token',
  'hmac_secret',
  'verify_token',
]);

/** Any key ending in token / secret / password / api_key is treated as a credential. */
const SENSITIVE_KEY_PATTERN = /(token|secret|password|api_?key)$/i;

export function isSensitiveConfigKey(key: string): boolean {
  return EXPLICIT_SENSITIVE_KEYS.has(key) || SENSITIVE_KEY_PATTERN.test(key);
}

export function maskChannelConfig(config: Record<string, unknown> | null | undefined): Record<string, unknown> {
  const masked: Record<string, unknown> = { ...(config ?? {}) };
  for (const [key, value] of Object.entries(masked)) {
    if (isSensitiveConfigKey(key) && typeof value === 'string' && value.length > 0) {
      masked[key] = MASKED_VALUE;
    }
  }
  return masked;
}
