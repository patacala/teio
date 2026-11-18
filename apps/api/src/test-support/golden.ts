import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';

/**
 * Golden files: recorded outputs that a behaviour must keep producing.
 *
 * They outlive the code that first produced them — the automation engine is
 * checked against the files recorded from the consumers it replaces, after
 * those consumers are deleted. Record or refresh with:
 *
 *   UPDATE_GOLDEN=1 pnpm --filter @crm/api test <spec>
 *
 * A refresh is a behaviour change: review the diff like any other change.
 */
const GOLDEN_DIR = join(__dirname, 'golden');

export function goldenPath(name: string): string {
  return join(GOLDEN_DIR, `${name}.json`);
}

export function readGolden<T = unknown>(name: string): T {
  const path = goldenPath(name);
  if (!existsSync(path)) {
    throw new Error(`Golden file ${name}.json is missing — record it with UPDATE_GOLDEN=1`);
  }
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

/** Compares `actual` with the golden file, or records it when UPDATE_GOLDEN=1. */
export function expectGolden(name: string, actual: unknown): void {
  const normalized = JSON.parse(JSON.stringify(actual)) as unknown;
  if (process.env.UPDATE_GOLDEN === '1') {
    const path = goldenPath(name);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${JSON.stringify(normalized, null, 2)}\n`);
    return;
  }
  expect(normalized).toEqual(readGolden(name));
}
