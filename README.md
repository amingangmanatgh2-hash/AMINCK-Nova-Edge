# AMINCK Nova Edge — AMINCK GOD Edition

پنل فارسی، RTL و Serverless برای مدیریت کاربران و Subscriptionهای **VLESS + WebSocket + TLS** روی **Cloudflare Workers** — طراحی‌شده برای فروش و مدیریت اشتراک. تمام داده‌ها در یک **Durable Object** خودکار نگهداری می‌شوند؛ بدون D1، بدون KV و بدون تنظیمات دستی.

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/amingangmanatgh2-hash/AMINCK-Nova-Edge)

---

## فهرست

- [امکانات](#امکانات)
- [نصب و Deploy](#نصب-و-deploy)
- [ساختار پروژه](#ساختار-پروژه)
- [API خلاصه](#api-خلاصه)
- [خروجی‌های کانفیگ](#خروجیهای-کانفیگ)
- [نقش‌ها و سطوح قدرت](#نقشها-و-سطوح-قدرت)
- [توسعه و تست](#توسعه-و-تست)
- [امنیت](#امنیت)

---

## امکانات

| بخش | جزئیات |
|---|---|
| پروتکل | VLESS روی WebSocket + TLS، Early Data (تا ۴۰۹۶ در حالت GOD)، TCP connect retry، UDP فقط برای DNS روی پورت ۵۳، DNS-over-HTTPS با چند Resolver و Failover |
| امنیت پروکسی | مسدودسازی IPهای خصوصی (Literal و حاصل از رزولوشن)، مسدودسازی پورت‌های SMTP (۲۵/۴۶۵/۵۸۷/۲۵۲۵)، جلوگیری از Open Proxy، سقف اتصال مستقل هر مشترک، شمارش نشست‌های WebSocket |
| اشتراک | UUID و Token مستقل برای هر مشترک، لینک `/sub/{token}`، هدر `subscription-userinfo`، فاصلهٔ Update قابل تنظیم، Health URL قابل تنظیم |
| خروجی‌ها | V2Ray Base64، Raw VLESS، Clash Meta YAML (گروه‌های NOVA-AUTO / NOVA-FALLBACK / NOVA-BALANCE / NOVA-SMART با `unified-delay`، `tcp-concurrent` و ذخیرهٔ انتخاب کاربر)، sing-box JSON (TUN + Mixed + DoH + Direct برای شبکهٔ خصوصی + Smart route) |
| ساخت کانفیگ | ۱ تا ۲۰۰ مسیر، تنوع کنترل‌شدهٔ Endpoint (حداکثر ۵۰)، پورت‌های TLS مجاز کلودفلر، Fingerprintهای Chrome/Firefox/Safari/Edge/Random، قالب نام با `{brand} {app} {user} {profile} {index} {endpoint} {port}`، نام اختصاصی هر مشترک |
| پنل مالک | ورود با `ADMIN_PASSWORD`، نام کاربری «AMINCK» یا خالی، مالک غیرقابل حذف/غیرفعال‌سازی، همهٔ Permissionها |
| مدیریت ادمین | نقش‌های `owner / admin / operator / support`، رمز با PBKDF2-SHA256 + Salt تصادفی (حداقل ۱۰ کاراکتر)، قطع فوری دسترسی، وصل مجدد، تعویض رمز، آخرین ورود، باطل‌شدن نشست ادمین غیرفعال در درخواست بعدی |
| سطوح قدرت | Limited (۵ مسیر) / Normal (۳۰) / Strong (۸۰) / Ultra (۲۰۰) — **همیشه در Backend اعمال می‌شود** |
| مدیریت مشترک | ساخت/ویرایش/حذف، فعال/غیرفعال، حجم/زمان/اتصال نامحدود (۰ = نامحدود)، ریست مصرف/اتصال، تعویض UUID/Token، آخرین اتصال، آخرین دریافت ساب، حجم و اتصال باقی‌مانده، جست‌وجو، Backup کامل JSON |
| ساخت ساب اتومات | Probe کردن Endpointها از Edge کلودفلر، مرتب‌سازی سالم‌ها، انتخاب تعداد مسیر/نام/حجم/زمان/سقف اتصال/Mode، نمایش Progress، لینک ساب + Smart Profile بعد از ساخت |
| Scanner | TCP handshake latency از Cloudflare Edge، Timeout قابل تنظیم، حداکثر ۵۰ Endpoint، ذخیرهٔ نتایج، Cron خودکار هر ۳۰ دقیقه (با توضیح صادقانه که پینگ دستگاه کاربر نیست) |
| Speed Preset | Stable / Balanced / Turbo / GOD — Early Data، تعداد retry، فاصلهٔ Health Check، Tolerance و `tcp-concurrent` واقعی و متفاوت |
| Audit Log | ورود/خروج ادمین، ساخت/ویرایش/حذف کاربر، ساخت کانفیگ/اتومات، تغییر تنظیمات، ساخت/قطع/حذف ادمین با Actor / Action / Target / Details / Timestamp و نمایش ۲۰۰+ رویداد آخر |
| امنیت وب | Session با HMAC-SHA256، کوکی HttpOnly + Secure + SameSite=Strict، بررسی Same-Origin، CSP، X-Frame-Options، Referrer-Policy، Permissions-Policy، Login delay و قفل بعد از تلاش‌های ناموفق |
| رابط کاربری | کاملاً فارسی و RTL، Dark/Light، Responsive، داشبورد آمار، Sidebar، صفحات کاربران/کانفیگ آهنین/Scanner/تنظیمات/نصب/ادمین/Audit/قابلیت‌ها، Modal ساخت اتومات و ویرایش، Toast، مخفی‌شدن دکمه‌ها بر اساس Permission |
| قابلیت‌ها | Capability Manifest با ۱۵۰+ قابلیت واقعی (۵۰+ مورد مدیریت مالک/ادمین) که در پنل نمایش داده می‌شود |

> هیچ ادعایی دربارهٔ «سرعت تضمینی» در کد یا پنل وجود ندارد. اعداد Probe فقط تأخیر TCP+TLS از Edge کلودفلر هستند.

## نصب و Deploy

### گزینه ۱ — دکمهٔ رسمی Deploy

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/amingangmanatgh2-hash/AMINCK-Nova-Edge)

مخزن: `https://github.com/amingangmanatgh2-hash/AMINCK-Nova-Edge`

Durable Object با migration خودکار Provision می‌شود — هیچ D1 یا KV دستی لازم نیست. رابط کاربری پنل به‌صورت Workers Static Assets (دایرکتوری `public/`، تولیدشده از `src/ui.ts`) Deploy می‌شود؛ چون `run_worker_first` فعال است، همهٔ درخواست‌ها از Worker عبور می‌کنند و هدرهای امنیتی روی همهٔ پاسخ‌ها می‌مانند.

> اگر بعد از تغییر UI خروجی فایل‌های استاتیک را به‌روز کنید: `npm run build:public` (و در CI هم‌گامی آن تست می‌شود).

### گزینه ۲ — CLI

```bash
git clone https://github.com/amingangmanatgh2-hash/AMINCK-Nova-Edge.git
cd AMINCK-Nova-Edge
npm install
npx wrangler login
npm run deploy
```

### Secretهای لازم (در Git هرگز قرار نمی‌گیرند)

```bash
wrangler secret put ADMIN_PASSWORD   # رمز مالک (حداقل ۱۰ کاراکتر)
wrangler secret put SESSION_SECRET  # کلید امضای نشست؛ تولید: openssl rand -hex 32
```

محلی: `.dev.vars.example` را به `.dev.vars` کپی کنید (فایل `.dev.vars` در `.gitignore` است).

پنل روی دامنهٔ Worker شما بالا می‌آید؛ با نام «AMINCK» و رمز مالک وارد شوید. Endpoint پیش‌فرض (خود دامنهٔ Worker) به‌صورت خودکار در صفحهٔ Scanner اضافه می‌شود.

## ساختار پروژه

```
src/
  index.ts        ورودی Worker: روتینگ، WS proxy، ساببش، هدرهای امنیتی، Cron probe
  store.ts        Durable Object: تمام state، احراز هویت، Permissionها، سقف قدرت، Audit
  proxy.ts        موتور نشست VLESS: طبقه‌بندی مقصد، بلاک خصوصی/SMTP، UDP-DNS، شمارش ترافیک
  protocol.ts     پارسر هدر VLESS و ابزارهای DNS (RFC 8484)
  config.ts       سازندهٔ کانفیگ: V2Ray / Clash Meta / sing-box / قالب نام
  probe.ts        اسکنر TCP+TLS از Edge با retry و failover
  types.ts        تایپ‌های دامنه، نقش‌ها، قدرت‌ها، Presetها
  utils.ts        crypto (HMAC/PBKDF2)، IPها، encode
  capabilities.ts مانیفست ۱۵۰+ قابلیت واقعی
  ui.ts           پنل (CSS + HTML + JavaScript خالص بدون CDN)
test/             تست‌های واحد + یکپارچه (Miniflare) + چک‌های CI
.github/workflows ci.yml و deploy.yml
wrangler.jsonc    تنظیمات Worker: DO migration، Cron، Observability، Static Assets
public/           فایل‌های استاتیک پنل (تولیدشده از src/ui.ts با npm run build:public)
scripts/          build-public.mjs و check-ui.mjs
```

## API خلاصه

| مسیر | مجوز | توضیح |
|---|---|---|
| `GET /healthz` | عمومی | Health check با CORS |
| `POST /api/login` | — | ورود مالک/ادمین (کوکی HttpOnly) |
| `GET /api/me` | Session | اطلاعات نقش/قدرت/Permissionها |
| `GET /api/stats` | users:view | آمار داشبورد |
| `GET /api/users` | users:view | فهرست + جست‌وجو |
| `POST /api/user-create` | users:create | ساخت مشترک (سقف قدرت اعمال می‌شود) |
| `POST /api/user-update` | users:edit | ویرایش + بازسازی مسیرها |
| `POST /api/user-delete` | users:delete | حذف |
| `POST /api/users/:id` | users:edit | toggle / reset_usage / reset_connections / rotate_uuid / rotate_token |
| `POST /api/config-build` | configs:build | ساخت کانفیگ (سقف قدرت اعمال می‌شود) |
| `POST /api/auto-build` | configs:build + users:create | ساخت ساب اتومات |
| `POST /api/probe` | endpoints:probe | Probe از Edge |
| `GET/POST /api/endpoints` | endpoints:probe | مدیریت Endpointها |
| `GET/POST /api/settings` | settings:manage | تنظیمات پنل |
| `GET/POST /api/admins/*` | admins:manage | مدیریت ادمین‌ها |
| `GET/POST /api/audit` | audit:view | لاگ رویدادها |
| `GET/POST /api/backup` | backup:export | Backup کامل JSON |
| `GET /sub/{token}` | Token مشترک | V2Ray Base64 (یا با `?format=clash|singbox|raw`) |
| `WS /e{slug}{userId}` | UUID مشترک | پروکسی VLESS + WS + TLS |

تمام درخواست‌های تغییردهنده با بررسی Same-Origin محافظت می‌شوند؛ هدرهای امنیتی روی همهٔ پاسخ‌ها اعمال می‌شوند.

## خروجی‌های کانفیگ

- **V2Ray Base64**: برای V2RayNG، MahsaNG، V2Box، NapsternetV
- **Clash Meta YAML**: گروه‌های `NOVA-AUTO` (url-test)، `NOVA-FALLBACK` (fallback)، `NOVA-BALANCE` (load-balance)، `NOVA-SMART` (selector با ذخیرهٔ انتخاب)، `unified-delay`، `cache-file`، `tcp-concurrent` (Turbo/GOD)
- **sing-box JSON**: TUN inbound + Mixed inbound + DoH + Direct برای IPهای خصوصی + Smart route نهایی

## نقش‌ها و سطوح قدرت

| نقش | قابلیت‌ها |
|---|---|
| owner | همهٔ ۱۰ Permission؛ با `ADMIN_PASSWORD` وارد می‌شود؛ غیرقابل حذف/تغییر |
| admin | مدیریت کاربران (شامل حذف)، کانفیگ، Probe، بکاپ، Audit |
| operator | مدیریت کاربران بدون حذف، کانفیگ، Probe، بکاپ، Audit |
| support | فقط view کاربران، ساخت کانفیگ، مشاهدهٔ Audit |

| قدرت | حداکثر مسیر (Backend) |
|---|---|
| Limited | ۵ |
| Normal | ۳۰ |
| Strong | ۸۰ |
| Ultra | ۲۰۰ |

## توسعه و تست

```bash
npm install
npm test            # ۱۳۰+ تست واحد + یکپارچه (Miniflare)
npm run check       # tsc --noEmit + node --check روی JavaScript پنل
npm audit --audit-level=high
```

تست‌ها شامل: ساخت ۲۰۰ مسیر، برند AMINCK، قالب نام، Auto/Fallback/Load-Balance، VLESS parser، بلاک IP خصوصی/SMTP، محدودیت UDP، HMAC Session، PBKDF2، نامحدود (صفر)، سقف اتصال، مانیفست قابلیت‌ها، اجبار Permission و قدرت، قطع فوری دسترسی ادمین، Backup و خروجی‌های ساب.

## امنیت

- Session با HMAC-SHA256 + کوکی `HttpOnly; Secure; SameSite=Strict`
- بررسی Same-Origin + CSP + X-Frame-Options + Referrer-Policy + Permissions-Policy
- Login delay و قفل‌شدن موقت بعد از ۱۰ تلاش ناموفق
- رمز ادمین‌ها PBKDF2-SHA256 (۲۱۰هزار دور) با Salt تصادفی؛ Hash/Salt در API نمایش داده نمی‌شوند
- مسدودسازی مقصد خصوصی و SMTP در مسیر پراکسی؛ UDP فقط DNS/53
- فقط دامنهٔ واقعی Worker برای SNI/Host؛ بدون SNI جعلی یا دامنهٔ شخص ثالث
- هیچ Secret در Git: `.dev.vars` در `.gitignore` است
- جزئیات بیشتر: [SECURITY.md](SECURITY.md)

## لایسنس

MIT — ببینید [LICENSE](LICENSE)
