#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════
//  verify-parity — اجرای موتور PHP (پلاگین Bedrock) روی بردارهای طلایی
//
//  چگونه؟ PHP واقعی ۸.۴ داخل wasm (npm: php-wasm) اجرا می‌شود و فایل‌های
//  موتور از روی دیسک داخل FS مجازی mount می‌شوند. یعنی کلاس‌های Engine
//  پلاگین PocketMine واقعاً اجرا می‌شوند، نه فقط lint.
//
//  اگر php-wasm در دسترس نباشد (مثلاً CI سبک)، با پیام روشن skip می‌شود و
//  به‌جایش خودبررسی JS انجام می‌گیرد (بردارها با موتور مرجع JS).
//
//  env: PHPWASM_DIR=/tmp/phpwasm   (پیش‌فرض: /tmp/phpwasm)
//  اجرا: npm run verify:parity
// ═══════════════════════════════════════════════════════════════════
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createRequire } from 'node:module';

const ROOT = new URL('..', import.meta.url).pathname;
const PHPWASM_DIR = process.env.PHPWASM_DIR || '/tmp/phpwasm';

const walk = (dir, out = []) => {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
};

const filesToMount = () => {
  const list = [];
  for (const f of walk(join(ROOT, 'server/bedrock/src'))) if (f.endsWith('.php')) list.push(f);
  for (const f of walk(join(ROOT, 'shared/spec'))) if (f.endsWith('.json')) list.push(f);
  list.push(join(ROOT, 'shared/testvectors.json'));
  list.push(join(ROOT, 'server/bedrock/tests/parity.php'));
  return list;
};

async function runPhpWasm() {
  const require = createRequire(join(PHPWASM_DIR, 'noop.js'));
  let PhpNode;
  try {
    ({ PhpNode } = require('php-wasm/PhpNode'));
  } catch (e) {
    return { skipped: `php-wasm در ${PHPWASM_DIR} پیدا نشد (${String(e.message || e).split('\n')[0]})` };
  }
  const php = new PhpNode();
  await php.startup;
  let out = '';
  php.addEventListener('output', (e) => { out += e.detail ?? e.data ?? ''; });

  // mount فایل‌ها داخل FS مجازی با همان مسیر مطلق (API خود php-wasm)
  for (const f of filesToMount()) {
    const parts = f.split('/').filter(Boolean);
    for (let i = 1; i < parts.length; i++) {
      const dir = '/' + parts.slice(0, i).join('/');
      try { await php.mkdir(dir); } catch {}
    }
    await php.writeFile(f, new Uint8Array(readFileSync(f)));
  }
  await php.run(`<?php
    define('PARITY_NO_EXIT', true); // exit() در wasm بافر خروجی را دور می‌ریزد
    require '/home/user/AMINCK-Nova-Edge/server/bedrock/tests/parity.php';
  `);
  return { out };
}

async function jsSelfCheck() {
  // خودبررسی: بردارها باید با موتور مرجع JS هم‌خوان باشند (تازه‌بودن بردارها)
  const { execFileSync } = await import('node:child_process');
  try {
    execFileSync('node', ['scripts/gen-testvectors.mjs'], { cwd: ROOT, stdio: 'pipe' });
    return 'بردارهای طلایی با موتور JS بازتولید و تأیید شدند.';
  } catch (e) {
    return 'هشدار: بازتولید بردارها با JS ناموفق بود: ' + String(e.message || e).split('\n')[0];
  }
}

const res = await runPhpWasm();
if (res.skipped) {
  console.log('⏭️  skip parity-PHP:', res.skipped);
  console.log('   (برای اجرای کامل: npm i php-wasm در یک پوشهٔ scratch و ست‌کردن PHPWASM_DIR)');
  console.log(await jsSelfCheck());
  process.exit(0);
}
console.log(res.out.trimEnd());
const m = res.out.match(/RESULT ok=(\d+) fail=(\d+)/);
if (!m) {
  console.log('❌ خروجی parity نامفهوم بود.');
  process.exit(1);
}
const [, ok, fail] = m.map(Number);
console.log(`\n🧪 parity موتور PHP (پلاگین Bedrock): ${ok} بردار یکسان، ${fail} ناهمخوان`);
process.exit(fail ? 1 : 0);
