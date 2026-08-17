#!/usr/bin/env node
/**
 * AMINCK Nova Edge — UI JavaScript sanity check.
 *
 * The panel app ships as a string constant inside src/ui.ts. This script
 * extracts the exact bytes between the NOVA-UI-START / NOVA-UI-END markers
 * and runs `node --check` on them, so the browser JavaScript is syntax-checked
 * in CI (and during `npm run check`).
 */
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const src = readFileSync(new URL('../src/ui.ts', import.meta.url), 'utf8');

const start = src.indexOf('/*NOVA-UI-START*/');
const end = src.indexOf('/*NOVA-UI-END*/');
if (start < 0 || end < 0 || end <= start) {
  console.error('check-ui: markers NOVA-UI-START/END not found in src/ui.ts');
  process.exit(1);
}
const js = src.slice(start + '/*NOVA-UI-START*/'.length, end);

// Sanity: the JS must not contain backticks or ${} (it lives in a template literal).
const bad = js.match(/[`]|\$\{/);
if (bad) {
  console.error('check-ui: JS payload contains backticks or ${ — invalid inside template literal:', bad[0]);
  process.exit(1);
}

const dir = mkdtempSync(join(tmpdir(), 'nova-ui-'));
const file = join(dir, 'app.js');
writeFileSync(file, js, 'utf8');
try {
  execFileSync(process.execPath, ['--check', file], { stdio: 'inherit' });
  console.log(`check-ui: OK (${Buffer.byteLength(js)} bytes of browser JS passed node --check)`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
