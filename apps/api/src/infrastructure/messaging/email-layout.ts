import { renderTemplate, type TemplateVars } from './template';

/**
 * An email as data: every string may contain {{placeholders}}. Rendering
 * fills them, HTML-escapes the result and drops the parts that end up empty
 * (a button or link without URL, a details row without value, a paragraph
 * without text), so one template covers "with/without location" etc.
 */
export interface EmailTemplate {
  subject: string;
  heading: string;
  /** Defaults to "Hi {{user_name}},"; null for no greeting. */
  greeting?: string | null;
  paragraphs: string[];
  details?: Array<{ label: string; value: string }>;
  button?: { label: string; url: string };
  links?: Array<{ label: string; url: string }>;
  notes?: string[];
  linkFallback?: { label: string; url: string };
  footer?: string;
}

export interface RenderedEmail {
  subject: string;
  html: string;
}

export const DEFAULT_GREETING = 'Hi {{user_name}},';

export function escapeHtml(value: string): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Escaped text with line breaks kept. */
function text(value: string): string {
  return escapeHtml(value).replace(/\r?\n/g, '<br>');
}

export function renderEmail(template: EmailTemplate, vars: TemplateVars): RenderedEmail {
  const r = (s: string) => renderTemplate(s, vars).trim();

  const greetingTpl = template.greeting === undefined ? DEFAULT_GREETING : template.greeting;
  const greeting = greetingTpl ? r(greetingTpl) : '';
  const paragraphs = template.paragraphs.map(r).filter(Boolean);
  const details = (template.details ?? [])
    .map((d) => ({ label: r(d.label), value: r(d.value) }))
    .filter((d) => d.value);
  const buttonUrl = template.button ? r(template.button.url) : '';
  const links = (template.links ?? []).map((l) => ({ label: r(l.label), url: r(l.url) })).filter((l) => l.url);
  const notes = (template.notes ?? []).map(r).filter(Boolean);
  const fallbackUrl = template.linkFallback ? r(template.linkFallback.url) : '';
  const footer = template.footer ? r(template.footer) : '';

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#F7F8FA;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
<div style="max-width:560px;margin:40px auto;background:#ffffff;border-radius:8px;border:1px solid #E6E8EB;overflow:hidden">
  <div style="background:#2563EB;padding:24px 32px">
    <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:600">${text(r(template.heading))}</h1>
  </div>
  <div style="padding:32px">
${[
  greeting && `    <p style="margin:0 0 16px;color:#111827;font-size:16px">${text(greeting)}</p>`,
  ...paragraphs.map((p) => `    <p style="margin:0 0 16px;color:#6B7280;font-size:14px;line-height:1.6">${text(p)}</p>`),
  details.length > 0 &&
    `    <div style="background:#F7F8FA;border-radius:6px;padding:16px 20px;margin-bottom:8px">
      <table style="width:100%;border-collapse:collapse;font-size:14px">
${details
  .map(
    (d, i) =>
      `        <tr><td style="padding:8px 0;color:#6B7280;width:120px">${text(d.label)}</td><td style="padding:8px 0;color:#111827">${i === 0 ? `<strong>${text(d.value)}</strong>` : text(d.value)}</td></tr>`,
  )
  .join('\n')}
      </table>
    </div>`,
  buttonUrl &&
    `    <div style="text-align:center;margin:24px 0"><a href="${escapeHtml(buttonUrl)}" style="display:inline-block;background:#2563EB;color:#ffffff;padding:12px 32px;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px">${text(r(template.button!.label))}</a></div>`,
  ...links.map(
    (l) => `    <p style="margin:16px 0 0;font-size:13px"><a href="${escapeHtml(l.url)}" style="color:#2563EB">${text(l.label)}</a></p>`,
  ),
  ...notes.map((n) => `    <p style="margin:16px 0 0;color:#6B7280;font-size:13px;line-height:1.5">${text(n)}</p>`),
  fallbackUrl &&
    `    <p style="margin:16px 0 0;color:#9CA3AF;font-size:12px;line-height:1.5;word-break:break-all">${text(r(template.linkFallback!.label))}<br>${text(fallbackUrl)}</p>`,
]
  .filter(Boolean)
  .join('\n')}
  </div>${
    footer
      ? `
  <div style="padding:16px 32px;background:#F7F8FA;border-top:1px solid #E6E8EB;text-align:center">
    <p style="margin:0;color:#9CA3AF;font-size:12px">${text(footer)}</p>
  </div>`
      : ''
  }
</div>
</body>
</html>`;

  // A subject is a single header line: no line breaks from variables.
  return { subject: r(template.subject).replace(/[\r\n]+/g, ' '), html };
}
