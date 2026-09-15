#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════
//  تولید shared/spec/bundle.mjs از روی فایل‌های JSON اسپک
//  چرا؟ Node برای import مستقیم JSON نیاز به import attribute دارد و
//  برخی باندلرها آن را پشتیبانی نمی‌کنند. JSON منبع حقیقت می‌ماند
//  (Java/PHP همان JSON را می‌خوانند) و برای JS یک ماژول تولید می‌شود.
//  اجرا:  npm run gen:spec
// ═══════════════════════════════════════════════════════════════════
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import crypto from 'node:crypto';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const specDir = path.join(root, 'shared', 'spec');
const FILES = ['gamemodes', 'ranks', 'bot-tiers', 'cosmetics', 'economy'];

async function main() {
  const parts = [
    '// ═══════════════════════════════════════════════════════════════',
    '//  ⚠️ این فایل تولیدشده است — دستی ویرایش نکنید.',
    '//  منبع: shared/spec/*.json   تولید: scripts/gen-spec-js.mjs',
    '// ═══════════════════════════════════════════════════════════════',
  ];
  const names = {};
  for (const f of FILES) {
    const raw = await readFile(path.join(specDir, `${f}.json`), 'utf8');
    JSON.parse(raw); // اعتبارسنجی
    const name = f.replace(/-(\w)/g, (_, c) => c.toUpperCase()).replace(/^\w/, (c) => c.toUpperCase());
    names[f] = name;
    const hash = crypto.createHash('sha256').update(raw).digest('hex').slice(0, 12);
    parts.push(`/** ${f}.json — sha256:${hash} */`);
    parts.push(`export const ${name} = ${raw.trim()};`);
    parts.push('');
  }
  parts.push(`export const SPEC_HASHES = ${JSON.stringify(
    Object.fromEntries(
      await Promise.all(
        FILES.map(async (f) => {
          const raw = await readFile(path.join(specDir, `${f}.json`), 'utf8');
          return [f, crypto.createHash('sha256').update(raw).digest('hex').slice(0, 12)];
        })
      )
    )
  )};`);
  parts.push('');
  const out = path.join(specDir, 'bundle.mjs');
  await writeFile(out, parts.join('\n'), 'utf8');
  console.log(`✅ wrote ${path.relative(root, out)} (${(parts.join('\n').length / 1024).toFixed(1)} KB)`);
}

main().catch((e) => {
  console.error('❌', e);
  process.exit(1);
});
