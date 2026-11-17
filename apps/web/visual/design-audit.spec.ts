import { test, expect } from '@playwright/test';
import { billingOverview } from '@/test/fixtures/billing';
import { auditDesign, loadTemplatePalette } from './support/design-audit';
import { openView, VIEW_SCOPE } from './support/view';

/** The rules only protect the template if they fail on real violations. */
test('the design audit reports every kind of violation', async ({ page }) => {
  await openView(page, '/admin/billing', { user: { role: 'owner' }, overview: billingOverview(), invoices: [] });

  await page.evaluate(() => {
    const main = document.querySelector('main')!;
    main.insertAdjacentHTML(
      'beforeend',
      `<section data-violations>
         <p style="color:#3b82f6">Blue brand text</p>
         <div style="background:white;height:10px">white surface</div>
         <select><option>Native select</option></select>
         <span title="Tooltip via title">Hover me</span>
         <svg width="10" height="10"><circle r="4" cx="5" cy="5" /></svg>
         <div data-chart><svg width="10" height="10"><circle r="4" cx="5" cy="5" /></svg></div>
         <button style="width:20px;height:20px"></button>
         <p style="font-family:Georgia, serif">Serif text</p>
         <p>Guardar cambios</p>
         <div style="width:3000px;height:4px"></div>
       </section>`,
    );
  });

  const audit = await auditDesign(page, { palette: loadTemplatePalette(), scope: VIEW_SCOPE });

  expect(audit.offPaletteColors.join('\n')).toContain('rgb(59, 130, 246)');
  expect(audit.offPaletteColors.join('\n')).toContain('rgb(255, 255, 255)');
  expect(audit.nativeControls).toEqual([expect.stringContaining('<select')]);
  expect(audit.titleAttributes).toEqual([expect.stringContaining('Hover me')]);
  expect(audit.nonLucideIcons.length).toBe(1); // the bare <svg>; the one inside [data-chart] is a chart, not an icon
  expect(audit.unlabeledControls.join('\n')).toContain('<button');
  expect(audit.foreignFonts.join('\n')).toContain('Georgia');
  expect(audit.spanishText).toContain('Guardar cambios');
  expect(audit.horizontalOverflow.length).toBeGreaterThan(0);
});

test('the template palette comes from globals.css', () => {
  const palette = new Map(loadTemplatePalette().map(([r, g, b, a]) => [`${r},${g},${b}`, a]));
  expect(palette.get('183,255,74')).toBe(1); // --color-accent #b7ff4a, usable at any opacity
  expect(palette.get('16,17,15')).toBe(1); // --color-surface #10110f
  expect(palette.get('244,244,240')).toBe(1); // --text-color-primary #f4f4f0
  expect(palette.get('255,255,255')).toBeCloseTo(0.12); // white only as a faint border tint
  expect(palette.has('59,130,246')).toBe(false); // Tailwind blue-500
});
