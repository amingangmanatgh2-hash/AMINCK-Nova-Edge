# AMINCK Nova Edge — Minecraft God Server

Nova Edge یک لایهٔ کامل Cloudflare Workers برای سرور حرفه‌ای Minecraft است:

- وب‌سایت و پنل مالک/ادمین
- فروشگاه با احراز هویت OTP قبل از نمایش محصول
- پرداخت درگاه/کارت‌به‌کارت با بررسی هوشمند فیش
- ۱۴ گیم‌مود، اقتصاد داخلی، رنک، لیدربرد و گزارش تخلف
- بات‌های AI با سطح هوش پویا بر اساس ELO/Level بازیکنان واقعی
- پلاگین Java Paper/Spigot و Bedrock PocketMine-MP
- پل امن HMAC بین پلاگین‌ها و Worker
- Cross-play با Geyser/Floodgate
- بخش کانفیگ‌های اتصال رایگان/نامحدود و مدیریت سلامت کانفیگ‌ها

> این ریپو عمداً به نسخهٔ Minecraft-only پاک‌سازی شده و کدهای legacy ربات/فروشگاه قبلی حذف شده‌اند تا در GitHub و دپلوی قاطی نشوند.

## مسیرهای اصلی

- `/` یا `/mc` — سایت اصلی
- `/mc/setup` — راه‌اندازی اولیه مالک
- `/mc/admin` — داشبورد ادمین
- `/mc/shop` — فروشگاه؛ محصولات فقط بعد از OTP نمایش داده می‌شوند
- `/mc/configs` — کانفیگ‌های اتصال
- `/api/mc/status` — API وضعیت عمومی
- `/api/mc/v1/*` — پل پلاگین Java/Bedrock با امضای HMAC

## دپلوی Cloudflare Workers

### گزینهٔ یک‌کلیک

```text
https://deploy.workers.cloudflare.com/?url=https://github.com/amingangmanatgh2-hash/AMINCK-Nova-Edge
```

### دپلوی دستی

```bash
npm ci
npm run test:all
npx wrangler deploy
```

بعد از دپلوی، لینک پیش‌فرض Workers معمولاً شبیه این است:

```text
https://aminck-nova-edge.<YOUR_CLOUDFLARE_SUBDOMAIN>.workers.dev
```

در این sandbox اگر Wrangler به حساب Cloudflare وصل نباشد، دپلوی واقعی انجام نمی‌شود و باید GitHub/Cloudflare را در Arena reconnect کنید یا `CLOUDFLARE_API_TOKEN` معتبر بدهید.

## راه‌اندازی اولیه

در `/mc/setup` سه فیلد اصلی عمداً خالی هستند و مالک باید خودش وارد کند:

- Admin password
- Server name
- Server IP/domain

همچنین در پنل ادمین، این موارد هم خالی می‌مانند تا مالک بعداً تنظیم کند:

- لینک/تنظیمات ZarinPal یا درگاه مشابه
- شماره کارت کارت‌به‌کارت
- کلیدها یا providerهای OTP/SMS/Telegram در صورت نیاز

## تست‌ها

```bash
npm run verify:parity      # قرارداد موتور مشترک JS/PHP
npm run lint:php           # lint ساختاری Bedrock/PocketMine
npm run lint:java          # lint ساختاری Java/Paper + پوشش vectorها
npm run test:god           # تست جامع Minecraft God Server
npm run test:e2e           # e2e Worker با دیتابیس تازه محلی
npm run sim:match -- --mode bedwars --seed 7 --humans 3
```

> در این محیط JDK/Maven/PHP CLI نصب نیست، بنابراین Java و Bedrock با lint ساختاری و vectorهای طلایی تست می‌شوند. تست Maven/JUnit داخل `server/java` برای مالک قابل اجراست.

## پلاگین‌ها

- Java/Paper: `server/java`
- Bedrock/PocketMine-MP: `server/bedrock`

در هر دو پلاگین، `worker_url` و `bridge_key` در `config.yml` خالی/قابل تنظیم هستند. کلید پل از پنل `/mc/admin` یا `/api/mc/admin/bridge_key` گرفته می‌شود.

## تصاویر

دارایی‌های ثابت در `public/mc/img` هستند و شامل:

- ۱۴ مود × بنر/آیکن/لابی
- hero
- ۶ رنک
- آیکن‌های کازمتیک/باندل/جم/بتل‌پس/کانفیگ ویژه

همه در یک سبک cartoon/pixel/voxel هماهنگ تولید شده‌اند.
