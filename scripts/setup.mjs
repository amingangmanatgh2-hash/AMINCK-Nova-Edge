#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════
//  ست‌آپ خودکار: ساخت KV و D1، اتصال به wrangler.toml و دیپلوی اولیه
//  اجرا:  npm run setup
// ═══════════════════════════════════════════════════════════════════
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const run = (cmd, silent = false) => {
  if (!silent) console.log('\n\x1b[33m$', cmd, '\x1b[0m');
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    console.error(e.stdout || '', e.stderr || e.message);
    throw e;
  }
};

console.log('🚀 AMINCK Nova Bot — ست‌آپ خودکار');

// ۱) بررسی ورود به کلادفلر
try {
  run('npx wrangler whoami', true);
  console.log('✅ احراز هویت کلادفلر تایید شد.');
} catch {
  console.error('❌ ابتدا وارد شوید:  npx wrangler login');
  process.exit(1);
}

let toml = readFileSync('wrangler.toml', 'utf8');

// ۲) ساخت KV
if (toml.includes('KV_PLACEHOLDER_ID')) {
  console.log('\n📦 ساخت KV Namespace...');
  const out = run('npx wrangler kv namespace create KV');
  const m = out.match(/id\s*=\s*"([^"]+)"/);
  if (!m) throw new Error('خطا در دریافت آیدی KV');
  toml = toml.replace('KV_PLACEHOLDER_ID', m[1]);
  console.log('✅ KV ساخته شد:', m[1]);
} else console.log('ℹ️ KV از قبل تنظیم شده است.');

// ۳) ساخت D1
if (toml.includes('D1_PLACEHOLDER_ID')) {
  console.log('\n🗄 ساخت دیتابیس D1...');
  const out = run('npx wrangler d1 create nova-bot-db');
  const m = out.match(/database_id\s*=\s*"([^"]+)"/);
  if (!m) throw new Error('خطا در دریافت آیدی D1');
  toml = toml.replace('D1_PLACEHOLDER_ID', m[1]);
  console.log('✅ دیتابیس ساخته شد:', m[1]);
} else console.log('ℹ️ D1 از قبل تنظیم شده است.');

writeFileSync('wrangler.toml', toml);

// ۴) یادآوری سکرت‌ها
console.log(`
🔐 حالا سکرت‌ها را تنظیم کنید (توکن تلگرام لازم است):

  echo "TELEGRAM_BOT_TOKEN_را_اینجا_بگذارید" | npx wrangler secret put TELEGRAM_BOT_TOKEN
  echo "gsk_..." | npx wrangler secret put GROQ_API_KEY     # اختیاری برای چت هوش مصنوعی و تایید فیش

🚀 سپس دیپلوی کنید:

  npm run deploy

🌐 بعد از اولین دیپلوی، آدرس ورکر (مثلاً https://aminck-nova-bot.USER.workers.dev)
را در فایل wrangler.toml جلوی WORKER_URL بگذارید و دوباره دیپلوی کنید تا
لینک‌های ساب، مینی‌اپ و وب‌هوک به‌درستی کار کنند.
`);
