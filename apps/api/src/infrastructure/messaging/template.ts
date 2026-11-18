/**
 * Minimal "{{variable}}" templates. Copy lives in catalog.ts (platform
 * messages) or in automation steps (organization messages); callers pass the
 * values. Values are inserted as-is: the email layout escapes the rendered
 * text for HTML, SMS is plain text.
 *
 * Syntax:
 *   {{user_name}}                   flat key (platform catalog)
 *   {{contact.first_name}}          dotted path into nested values
 *   {{contact.first_name|there}}    fallback when the value is empty
 *   {{#if appointment.meeting_url}}Join: {{appointment.meeting_url}}{{else}}…{{/if}}
 */
export type TemplateVars = Record<string, unknown>;

const PATH = '[a-z][a-z0-9_]*(?:\\.[a-z0-9_-]+)*';
const PLACEHOLDER = new RegExp(`\\{\\{\\s*(${PATH})\\s*(?:\\|([^{}]*))?\\}\\}`, 'gi');
/** An {{#if}} block with no other {{#if}} inside: blocks are resolved innermost first. */
const IF_BLOCK = new RegExp(
  `\\{\\{#if\\s+(${PATH})\\s*\\}\\}((?:(?!\\{\\{#if\\s)[\\s\\S])*?)\\{\\{\\/if\\}\\}`,
  'i',
);
const ELSE = /\{\{else\}\}/i;

/** Who the message is for, when we don't know their name ("Hi there,"). */
export const DEFAULT_USER_NAME = 'there';

/** A flat key wins (`appointment_title`); otherwise the dotted path is walked. */
export function lookupTemplateValue(vars: TemplateVars, path: string): unknown {
  if (Object.prototype.hasOwnProperty.call(vars, path)) return vars[path];
  let current: unknown = vars;
  for (const part of path.split('.')) {
    if (current === null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function isEmpty(value: unknown): boolean {
  return (
    value === null ||
    value === undefined ||
    value === '' ||
    value === false ||
    (Array.isArray(value) && value.length === 0)
  );
}

function stringify(value: unknown): string {
  if (Array.isArray(value)) return value.filter((v) => !isEmpty(v)).map(String).join(', ');
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  if (typeof value === 'object') return '';
  return String(value);
}

function resolveConditionals(template: string, vars: TemplateVars): string {
  let out = template;
  for (let match = IF_BLOCK.exec(out); match; match = IF_BLOCK.exec(out)) {
    const [whole, path, body] = match;
    const elseAt = body.search(ELSE);
    const whenTrue = elseAt >= 0 ? body.slice(0, elseAt) : body;
    const whenFalse = elseAt >= 0 ? body.slice(elseAt).replace(ELSE, '') : '';
    out = out.slice(0, match.index) + (isEmpty(lookupTemplateValue(vars, path)) ? whenFalse : whenTrue) + out.slice(match.index + whole.length);
  }
  return out;
}

export function renderTemplate(template: string, vars: TemplateVars): string {
  // Conditionals first, on the template only: values are never re-interpreted.
  return resolveConditionals(template, vars).replace(PLACEHOLDER, (_match, path: string, fallback?: string) => {
    const value = lookupTemplateValue(vars, path);
    if (isEmpty(value) && value !== false) {
      if (fallback !== undefined) return fallback.trim();
      return path === 'user_name' ? DEFAULT_USER_NAME : '';
    }
    return stringify(value);
  });
}

/** The placeholders (and {{#if}} paths) a template uses. */
export function templateVariables(template: string): string[] {
  const paths = [...template.matchAll(PLACEHOLDER)].map((m) => m[1]);
  const conditions = [...template.matchAll(new RegExp(`\\{\\{#if\\s+(${PATH})\\s*\\}\\}`, 'gi'))].map((m) => m[1]);
  return [...new Set([...paths, ...conditions])];
}
