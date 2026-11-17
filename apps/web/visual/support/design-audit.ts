import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { Page } from '@playwright/test';

/** A template color and the highest opacity the template uses it at. */
export type PaletteColor = [r: number, g: number, b: number, maxAlpha: number];

/**
 * The "original template": every color the design system defines in
 * globals.css (theme tokens and the literals used by its utilities), plus
 * black for the Radix dialog overlay (bg-black/75). Opaque tokens can be used
 * at any opacity (Tailwind `/10` modifiers); translucent literals such as the
 * white border tints only up to the opacity the template gives them.
 */
export function loadTemplatePalette(): PaletteColor[] {
  const css = readFileSync(path.join(__dirname, '../../src/app/globals.css'), 'utf8');
  const palette = new Map<string, PaletteColor>();
  const add = (r: number, g: number, b: number, alpha: number) => {
    const key = `${r},${g},${b}`;
    palette.set(key, [r, g, b, Math.max(alpha, palette.get(key)?.[3] ?? 0)]);
  };

  for (const [, hex] of css.matchAll(/#([0-9a-f]{6}|[0-9a-f]{3})\b/gi)) {
    const full = hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex;
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
    add(r, g, b, 1);
  }
  for (const [, r, g, b, a] of css.matchAll(/rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)(?:\s*[/,]\s*([\d.]+%?))?\s*\)/g)) {
    const alpha = a === undefined ? 1 : a.endsWith('%') ? parseFloat(a) / 100 : parseFloat(a);
    add(Number(r), Number(g), Number(b), alpha);
  }
  add(0, 0, 0, 0.75);
  return [...palette.values()];
}

export interface AuditOptions {
  /** Elements whose subtree is audited (defaults to the whole page). */
  scope?: string[];
  palette: PaletteColor[];
}

export interface AuditResult {
  offPaletteColors: string[];
  nativeControls: string[];
  titleAttributes: string[];
  nonLucideIcons: string[];
  unlabeledControls: string[];
  foreignFonts: string[];
  spanishText: string[];
  horizontalOverflow: string[];
}

/** Runs every design-system rule against what is currently rendered. */
export async function auditDesign(page: Page, options: AuditOptions): Promise<AuditResult> {
  return page.evaluate(({ scope, palette }) => {
    const TOLERANCE = 4;

    // ── Color parsing (rgb, color(srgb), oklab, oklch, hex) → [r, g, b, a] ──
    const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
    const linToSrgb = (v: number) => (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055) * 255;
    const num = (token: string, percentScale = 1) =>
      token.endsWith('%') ? (parseFloat(token) / 100) * percentScale : parseFloat(token);
    const alphaOf = (token?: string) => (token === undefined ? 1 : num(token, 1));

    function oklabToRgb(L: number, a: number, b: number): number[] {
      const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
      const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
      const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
      return [
        linToSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
        linToSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
        linToSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
      ].map(clamp);
    }

    function parseColor(value: string): number[] | null {
      const v = value.trim();
      if (v === 'transparent' || v === 'currentcolor') return null;
      let m = v.match(/^rgba?\(([^)]+)\)$/);
      if (m) {
        const parts = m[1].split(/[\s,/]+/).filter(Boolean);
        return [num(parts[0], 255), num(parts[1], 255), num(parts[2], 255), alphaOf(parts[3])].map((x, i) => (i < 3 ? clamp(x) : x));
      }
      m = v.match(/^color\(srgb ([^)]+)\)$/);
      if (m) {
        const parts = m[1].split(/[\s/]+/).filter(Boolean);
        return [...parts.slice(0, 3).map((p) => clamp(num(p, 1) * 255)), alphaOf(parts[3])];
      }
      m = v.match(/^oklab\(([^)]+)\)$/);
      if (m) {
        const parts = m[1].split(/[\s/]+/).filter(Boolean);
        return [...oklabToRgb(num(parts[0], 1), num(parts[1], 0.4), num(parts[2], 0.4)), alphaOf(parts[3])];
      }
      m = v.match(/^oklch\(([^)]+)\)$/);
      if (m) {
        const parts = m[1].split(/[\s/]+/).filter(Boolean);
        const C = num(parts[1], 0.4);
        const h = (parseFloat(parts[2]) * Math.PI) / 180;
        return [...oklabToRgb(num(parts[0], 1), C * Math.cos(h), C * Math.sin(h)), alphaOf(parts[3])];
      }
      m = v.match(/^#([0-9a-f]{6})$/i);
      if (m) return [0, 2, 4].map((i) => parseInt(m![1].slice(i, i + 2), 16)).concat(1);
      return null;
    }

    const ALPHA_TOLERANCE = 0.02;
    const inPalette = (rgba: number[]) =>
      palette.some(
        (p) =>
          Math.abs(p[0] - rgba[0]) <= TOLERANCE &&
          Math.abs(p[1] - rgba[1]) <= TOLERANCE &&
          Math.abs(p[2] - rgba[2]) <= TOLERANCE &&
          rgba[3] <= p[3] + ALPHA_TOLERANCE,
      );

    const roots = scope?.length
      ? scope.flatMap((s) => Array.from(document.querySelectorAll<HTMLElement>(s)))
      : [document.body];
    const elements = new Set<Element>();
    for (const root of roots) {
      elements.add(root);
      root.querySelectorAll('*').forEach((el) => elements.add(el));
    }

    const describe = (el: Element) => {
      const cls = typeof el.className === 'string' ? el.className.trim().split(/\s+/).slice(0, 4).join('.') : '';
      const text = (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 40);
      return `<${el.tagName.toLowerCase()}${cls ? `.${cls}` : ''}>${text ? ` "${text}"` : ''}`;
    };

    const isVisible = (el: Element) => {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return false;
      const style = getComputedStyle(el);
      return style.visibility !== 'hidden' && style.display !== 'none' && Number(style.opacity) > 0;
    };

    const result = {
      offPaletteColors: new Set<string>(),
      nativeControls: [] as string[],
      titleAttributes: [] as string[],
      nonLucideIcons: [] as string[],
      unlabeledControls: [] as string[],
      foreignFonts: new Set<string>(),
      spanishText: [] as string[],
      horizontalOverflow: [] as string[],
    };

    const bodyFont = getComputedStyle(document.body).fontFamily;
    const themeFont = getComputedStyle(document.documentElement).getPropertyValue('--font-sans').trim();
    const allowedFonts = new Set([bodyFont, themeFont].map((f) => f.replace(/\s+/g, ' ')));

    for (const el of elements) {
      if (!isVisible(el)) continue;
      const style = getComputedStyle(el);

      const colors: Array<[string, string]> = [['color', style.color], ['background-color', style.backgroundColor]];
      for (const side of ['Top', 'Right', 'Bottom', 'Left'] as const) {
        if (parseFloat(style[`border${side}Width`]) > 0 && style[`border${side}Style`] !== 'none') {
          colors.push([`border-${side.toLowerCase()}-color`, style[`border${side}Color`]]);
        }
      }
      if (el instanceof SVGElement) {
        if (style.stroke !== 'none') colors.push(['stroke', style.stroke]);
        if (style.fill !== 'none') colors.push(['fill', style.fill]);
      }
      for (const stop of style.backgroundImage.match(/(rgba?|oklab|oklch|color)\([^()]*(\([^()]*\)[^()]*)*\)|#[0-9a-f]{6}/gi) ?? []) {
        colors.push(['background-image', stop]);
      }
      for (const [prop, value] of colors) {
        const rgba = parseColor(value);
        if (!rgba || rgba[3] === 0) continue;
        if (!inPalette(rgba)) result.offPaletteColors.add(`${prop}: ${value} on ${describe(el)}`);
      }

      const tag = el.tagName.toLowerCase();
      if ((tag === 'select' && el.getAttribute('aria-hidden') !== 'true') || tag === 'dialog') {
        result.nativeControls.push(describe(el));
      }
      if (el.hasAttribute('title') && !(el instanceof SVGElement)) result.titleAttributes.push(describe(el));
      // Icons must be Lucide. Charts are data graphics, not icons: an <svg> inside an
      // explicit [data-chart] container is exempt (its colors are still audited above).
      if (tag === 'svg' && !el.classList.contains('lucide') && !el.parentElement?.closest('svg') && !el.closest('[data-chart]')) {
        result.nonLucideIcons.push(describe(el.parentElement ?? el));
      }

      const interactive =
        tag === 'button' || (tag === 'a' && el.hasAttribute('href')) || tag === 'textarea' ||
        (tag === 'input' && (el as HTMLInputElement).type !== 'hidden') ||
        ['combobox', 'switch', 'checkbox', 'tab', 'menuitem'].includes(el.getAttribute('role') ?? '');
      if (interactive) {
        const labelledBy = el.getAttribute('aria-labelledby');
        const labelled =
          (el.getAttribute('aria-label') ?? '').trim() ||
          (labelledBy && labelledBy.split(/\s+/).map((id) => document.getElementById(id)?.textContent ?? '').join('').trim()) ||
          ((el as HTMLInputElement).labels?.length ? 'label' : '') ||
          (['input', 'textarea'].includes(tag) ? '' : (el.textContent ?? '').trim());
        if (!labelled) result.unlabeledControls.push(describe(el));
      }

      const hasOwnText = Array.from(el.childNodes).some((n) => n.nodeType === Node.TEXT_NODE && n.textContent?.trim());
      if (hasOwnText && !allowedFonts.has(style.fontFamily.replace(/\s+/g, ' '))) {
        result.foreignFonts.add(`${style.fontFamily} on ${describe(el)}`);
      }
    }

    const SPANISH = /[áéíóúñ¿¡]|\b(el|los|las|del|para|con|una|por|usuarios?|mensajes?|guardar|cancelar|pagos?|nuevo|nueva|facturaci[oó]n|suscripci[oó]n|miembros|en total)\b/i;
    for (const root of roots) {
      for (const line of (root.innerText ?? '').split('\n')) {
        if (SPANISH.test(line)) result.spanishText.push(line.trim().slice(0, 80));
      }
    }

    const doc = document.documentElement;
    if (doc.scrollWidth > window.innerWidth + 1) {
      result.horizontalOverflow.push(`document is ${doc.scrollWidth}px wide in a ${window.innerWidth}px viewport`);
    }
    for (const root of roots) {
      if (root.scrollWidth > root.clientWidth + 1 && getComputedStyle(root).overflowX !== 'auto') {
        result.horizontalOverflow.push(`${describe(root)} overflows (${root.scrollWidth}px > ${root.clientWidth}px)`);
      }
    }

    return {
      ...result,
      offPaletteColors: [...result.offPaletteColors],
      foreignFonts: [...result.foreignFonts],
    };
  }, { scope: options.scope ?? [], palette: options.palette });
}
