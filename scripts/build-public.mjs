#!/usr/bin/env node
/**
 * EDGE PANEL — generate the `public/` static assets directory.
 *
 * The panel UI lives as strings inside src/ui.ts (single source of truth).
 * This script compiles src/ui.ts with esbuild and writes the *evaluated*
 * constants to real files (public/index.html, public/app.js, public/app.css)
 * so they are byte-identical to what the Worker serves as a fallback.
 *
 * Why this matters for deploys:
 *   - the official Cloudflare "Deploy to Workers" pipeline refuses to build a
 *     project when it cannot detect a static-files directory; public/ fixes
 *     that, and
 *   - `wrangler deploy` uploads the panel as Workers Static Assets served
 *     through the Worker (run_worker_first) with the security headers.
 */
import { build } from 'esbuild';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const buildDir = join(root, '.nova-build');
mkdirSync(buildDir, { recursive: true });
const outfile = join(buildDir, 'ui.mjs');

try {
  await build({
    entryPoints: [join(root, 'src', 'ui.ts')],
    bundle: true,
    format: 'esm',
    platform: 'neutral',
    target: 'es2022',
    outfile,
    logLevel: 'error',
  });
  const mod = await import(`${pathToFileURL(outfile).href}?v=${Date.now()}`);
  const out = join(root, 'public');
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'app.js'), mod.UI_APP_JS, 'utf8');
  writeFileSync(join(out, 'app.css'), mod.UI_APP_CSS, 'utf8');
  writeFileSync(join(out, 'index.html'), mod.uiShell('AMINCK GOD Edition'), 'utf8');
  console.log(
    `build-public: OK — app.js (${Buffer.byteLength(mod.UI_APP_JS)} B), app.css (${Buffer.byteLength(mod.UI_APP_CSS)} B), index.html (${Buffer.byteLength(mod.uiShell('EDGE PANEL'))} B)`,
  );
} finally {
  rmSync(buildDir, { recursive: true, force: true });
}
