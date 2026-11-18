import type { ConfigService } from '@nestjs/config';
import { renderEmail, type RenderedEmail } from './email-layout';
import { EMAIL_TEMPLATES, SMS_TEMPLATES, type EmailTemplateKey, type SmsTemplateKey } from './catalog';
import { renderTemplate, type TemplateVars } from './template';

export { escapeHtml, type RenderedEmail } from './email-layout';
export { renderTemplate, type TemplateVars } from './template';
export * from './catalog';

/** Renders a catalog email: subject + escaped HTML. */
export function emailFromTemplate(key: EmailTemplateKey, vars: TemplateVars): RenderedEmail {
  return renderEmail(EMAIL_TEMPLATES[key], vars);
}

/** Renders a catalog SMS (plain text). */
export function smsFromTemplate(key: SmsTemplateKey, vars: TemplateVars): string {
  return renderTemplate(SMS_TEMPLATES[key], vars);
}

/**
 * Base URL of the web app for links in messages. FRONTEND_URL wins, then the
 * NEXT_PUBLIC_WEB_URL every deployment sets (same order as the invite redirect
 * in UsersService).
 */
export function webAppUrl(config: ConfigService): string {
  const url =
    config.get<string>('FRONTEND_URL') ||
    config.get<string>('NEXT_PUBLIC_WEB_URL') ||
    'http://localhost:3000';
  return url.replace(/\/+$/, '');
}
