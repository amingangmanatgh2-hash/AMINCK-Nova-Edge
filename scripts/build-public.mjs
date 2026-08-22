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
import { deflateSync } from 'node:zlib';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const name = Buffer.from(type);
  const length = Buffer.alloc(4); length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, crc]);
}

/** Dependency-free maskable PNG matching the SVG brand icon. */
function makeIconPng(size) {
  const rows = Buffer.alloc((size * 4 + 1) * size);
  const stride = size * 4 + 1;
  for (let y = 0; y < size; y++) {
    rows[y * stride] = 0;
    for (let x = 0; x < size; x++) {
      const nx = x / size; const ny = y / size;
      const glowA = Math.max(0, 1 - Math.hypot(nx - .23, ny - .2) / .42);
      const glowB = Math.max(0, 1 - Math.hypot(nx - .79, ny - .8) / .48);
      let r = 7 + 22 * glowB; let g = 10 + 26 * glowA; let b = 25 + 48 * glowA + 25 * glowB;
      const inside = nx > .2 && nx < .8 && ny > .2 && ny < .8;
      if (inside) {
        const t = (nx + ny) / 2;
        r = 25 + 205 * Math.max(0, t - .25); g = 215 - 115 * t; b = 225 - 12 * t;
      }
      const left = nx > .33 && nx < .39 && ny > .31 && ny < .7;
      const right = nx > .61 && nx < .67 && ny > .31 && ny < .7;
      const diagonal = ny > .31 && ny < .7 && Math.abs(nx - (.33 + (ny - .31) * .87)) < .026;
      if (left || right || diagonal) { r = 255; g = 255; b = 255; }
      const p = y * stride + 1 + x * 4;
      rows[p] = Math.round(Math.min(255, r)); rows[p + 1] = Math.round(Math.min(255, g)); rows[p + 2] = Math.round(Math.min(255, b)); rows[p + 3] = 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137,80,78,71,13,10,26,10]),
    pngChunk('IHDR', ihdr), pngChunk('IDAT', deflateSync(rows, { level: 9 })), pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

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
  writeFileSync(join(out, 'index.html'), mod.uiShell('AMINNOVA'), 'utf8');
  writeFileSync(join(out, 'manifest.webmanifest'), mod.UI_MANIFEST_JSON, 'utf8');
  writeFileSync(join(out, 'sw.js'), mod.UI_SW_JS, 'utf8');
  writeFileSync(join(out, 'icon.svg'), mod.UI_ICON_SVG, 'utf8');
  writeFileSync(join(out, 'icon-192.png'), makeIconPng(192));
  writeFileSync(join(out, 'icon-512.png'), makeIconPng(512));
  console.log(
    `build-public: OK — app.js (${Buffer.byteLength(mod.UI_APP_JS)} B), app.css (${Buffer.byteLength(mod.UI_APP_CSS)} B), PWA shell + manifest + service worker`,
  );
} finally {
  rmSync(buildDir, { recursive: true, force: true });
}
