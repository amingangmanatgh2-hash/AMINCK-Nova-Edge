#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════
//  e2e.mjs — اجرای معتبر تست end-to-end با «دیتابیس تازه»
//
//  چرا؟ DO SQLite محلی (wrangler dev --persist) بین اجراها باقی می‌ماند و
//  راه‌اندازی مالک فقط یک‌بار مجاز است. این اسکریپت:
//    1) یک دایرکتوری persist موقت و خالی می‌سازد
//    2) wrangler dev را روی پورت ۸۷۹۹ بالا می‌آورد
//    3) scripts/e2e-live.mjs را با BASE همان پورت اجرا می‌کند
//    4) سرور را می‌کشد و کد خروج تست را برمی‌گرداند
//
//  اجرا: npm run test:e2e
// ═══════════════════════════════════════════════════════════════════
import { spawn } from 'node:child_process';
import { rmSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const PORT = Number(process.env.E2E_PORT || 8799);
const PERSIST = join(ROOT, '.wrangler-e2e');
const BASE = `http://127.0.0.1:${PORT}`;

rmSync(PERSIST, { recursive: true, force: true });
mkdirSync(PERSIST, { recursive: true });

console.log(`e2e: دیتابیس تازه در ${PERSIST}`);
console.log(`e2e: بالا آوردن wrangler dev روی پورت ${PORT} …`);

const dev = spawn('npx', ['wrangler', 'dev', '--local', '--ip', '127.0.0.1', '--port', String(PORT), '--persist-to', PERSIST], {
  cwd: ROOT,
  env: { ...process.env, WRANGLER_SEND_METRICS: 'false' },
  stdio: ['ignore', 'pipe', 'pipe'],
  detached: true,
});

let devLog = '';
const onOut = (d) => { devLog += d.toString(); };
dev.stdout.on('data', onOut);
dev.stderr.on('data', onOut);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitReady(timeoutMs = 120_000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    if (dev.exitCode !== null) throw new Error(`wrangler dev زودتر از موعد خارج شد (code=${dev.exitCode}):\n${devLog.slice(-2000)}`);
    try {
      const r = await fetch(BASE + '/mc/api/status', { signal: AbortSignal.timeout(2000) });
      if (r.status < 500) return true;
    } catch {}
    await sleep(1000);
  }
  throw new Error('wrangler dev در مهلت مقرر آماده نشد:\n' + devLog.slice(-2000));
}

let code = 1;
try {
  await waitReady();
  console.log(`e2e: سرور آماده است — اجرای e2e-live.mjs با BASE=${BASE}\n`);
  code = await new Promise((resolve) => {
    const live = spawn(process.execPath, [join(ROOT, 'scripts/e2e-live.mjs')], {
      cwd: ROOT,
      env: { ...process.env, BASE },
      stdio: 'inherit',
    });
    live.on('exit', (c) => resolve(c ?? 1));
  });
} catch (e) {
  console.error('e2e: ' + e.message);
} finally {
  try { process.kill(-dev.pid, 'SIGTERM'); } catch { dev.kill('SIGTERM'); }
  await sleep(800);
  if (dev.exitCode === null) {
    try { process.kill(-dev.pid, 'SIGKILL'); } catch { dev.kill('SIGKILL'); }
  }
  rmSync(PERSIST, { recursive: true, force: true });
}
console.log(code === 0 ? '\ne2e: موفق ✅' : `\ne2e: ناموفق ❌ (code=${code})`);
process.exit(code);
