/**
 * Minimal "{{variable}}" templates. Copy lives in catalog.ts as plain strings;
 * callers pass the values. Values are inserted as-is: the email layout escapes
 * the rendered text for HTML, SMS is plain text.
 */
export type TemplateVars = Record<string, string | number | null | undefined>;

const PLACEHOLDER = /\{\{\s*([a-z][a-z0-9_]*)\s*\}\}/gi;

/** Who the message is for, when we don't know their name ("Hi there,"). */
export const DEFAULT_USER_NAME = 'there';

export function renderTemplate(template: string, vars: TemplateVars): string {
  return template.replace(PLACEHOLDER, (_match, key: string) => {
    const value = vars[key];
    if (value === null || value === undefined || value === '') {
      return key === 'user_name' ? DEFAULT_USER_NAME : '';
    }
    return String(value);
  });
}

/** The placeholders a template uses (catalog tests check every one is documented). */
export function templateVariables(template: string): string[] {
  return [...new Set([...template.matchAll(PLACEHOLDER)].map((m) => m[1]))];
}
