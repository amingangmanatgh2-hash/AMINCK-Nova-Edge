#!/usr/bin/env node
// ست‌آپ دستی (اختیاری) — با دکمه Deploy دیگر لازم نیست.
// حالا فقط ورود و دیپلوی کافی است؛ Durable Object خودکار ساخته می‌شود.
import { execSync } from 'node:child_process';
const run = (c) => { console.log('\n$ ' + c); execSync(c, { stdio: 'inherit' }); };
console.log('🚀 AMINCK Nova Bot');
try { run('npx wrangler whoami'); } catch { console.error('❌ اول: npx wrangler login'); process.exit(1); }
run('npx wrangler deploy');
console.log(`
✅ دیپلوی شد! آدرس Worker را از خروجی بالا باز کنید و مسیر /setup را بروید.
🔐 توکن BotFather را همان‌جا وارد کنید؛ وب‌هوک خودکار ثبت و توکن داخل Durable Object ذخیره می‌شود.
🤖 سپس در تلگرام /start بزنید — اولین کاربر سوپرادمین است و پروفایل بات خودکار تنظیم می‌شود.
`);
