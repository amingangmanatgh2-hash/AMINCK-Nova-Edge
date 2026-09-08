#!/usr/bin/env node
// ست‌آپ دستی (اختیاری) — با دکمه Deploy دیگر لازم نیست.
// حالا فقط ورود و دیپلوی کافی است؛ Durable Object خودکار ساخته می‌شود.
import { execSync } from 'node:child_process';
const run = (c) => { console.log('\n$ ' + c); execSync(c, { stdio: 'inherit' }); };
console.log('🚀 AMINCK Nova Bot');
try { run('npx wrangler whoami'); } catch { console.error('❌ اول: npx wrangler login'); process.exit(1); }
run('npx wrangler deploy');
console.log(`
✅ دیپلوی شد! آدرس ورکر را از خروجی بالا کپی کنید و (اختیاری) جلوی WORKER_URL در wrangler.toml بگذارید.
🤖 حالا در تلگرام /start بزنید — اولین کاربر سوپرادمین است و پروفایل بات خودکار تنظیم می‌شود.
`);
