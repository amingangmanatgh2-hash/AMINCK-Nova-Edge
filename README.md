# AMINNOVA — پنل فروش ساب روی Cloudflare Workers

پنل فارسی و RTL برای مدیریت مشترک، ساخت Subscription و اجرای **VLESS + WebSocket + TLS** روی Cloudflare Workers. وضعیت در یک Durable Object نگه‌داری می‌شود و D1/KV جدا لازم نیست.

> **شفافیت فنی:** هیچ پروژه‌ای نمی‌تواند سرعت، پایداری، عبور از DPI یا کارکرد روی «نت ملی» را برای همهٔ اپراتورها تضمین کند. AMINNOVA به‌جای دامنه/SNI جعلی از hostname واقعی Worker یا دامنه‌های متعلق به خود اپراتور استفاده می‌کند. Probe نیز تأخیر HTTPS از Edge کلودفلر است، نه Ping اینترنت گوشی کاربر.

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https%3A%2F%2Fgithub.com%2Famingangmanatgh2-hash%2FIR-penalty-)

## امکانات اصلی

- پنل سادهٔ فارسی، RTL، واکنش‌گرا و Dark/Light
- ورود مالک و ادمین‌های چندنقشی با Permissionهای Backend
- ساخت، ویرایش، فعال/غیرفعال و حذف مشترک
- حجم، زمان، اتصال همزمان و تعداد درخواست ساب؛ مقدار `0` یعنی نامحدود
- انتخاب ۱ تا ۲۰۰ مسیر در هر Subscription (با سقف نقش ادمین)
- قالب نام با `{brand}`، `{app}`، `{user}`، `{profile}`، `{index}`، `{endpoint}` و `{port}`
- نام پیش‌فرض دارای برند **AMINCK**
- خروجی V2Ray Base64، Raw VLESS، Clash Meta و sing-box
- سازگار با Import استاندارد در V2Box، V2RayNG، MahsaNG، NapsternetV، Clash Meta/Mihomo و sing-box
- گروه‌های Auto، Fallback، Balance، Multi و گروه‌های Rule برای YouTube، Instagram و TikTok
- ساخت ۱ تا ۵ پروفایل مستقل «آهنین» Xray/sing-box
- Probe دستی و Cron هر ۳۰ دقیقه از Cloudflare Edge
- ساخت اتومات با اولویت Endpointهای سالم و کم‌تأخیر
- مخزن کاندیدهای Cloudflare Anycast با هشدار تست از شبکهٔ واقعی؛ هیچ IP ثابت به‌صورت کور تزریق نمی‌شود
- Host Alias فقط برای دامنه‌ای که مالک آن هستید و به همین Worker Route شده است
- Multi-port اختیاری برای Custom Domain؛ پیش‌فرض امن و پایدار `443`
- مسیر تصادفی، Path Jitter و Padding؛ Fragment hint به‌صورت اختیاری و پیش‌فرض خاموش
- Early Data تا 4096 بایت و دریافت Early Data از `Sec-WebSocket-Protocol`
- اتصال Upstream به‌صورت Raw TCP (TLS کلاینت بدون TLS تو‌در‌تو)
- احراز UUID + مسیر اختصاصی در WebSocket
- UDP فقط DNS/53 از طریق DoH و Failover Resolver
- جلوگیری از مقصد خصوصی/Metadata، SMTP و پورت‌های خارج از Allow-list
- شمارش تقریبی مصرف، نشست زنده، انقضا و سقف درخواست
- Audit log، Backup JSON، چرخش UUID/Token و Hot Update مسیرها
- Session امضاشده، PBKDF2، Lockout، Same-Origin و Security Headerها
- مانیفست داخل پنل با **۲۰۰+ کنترل و قابلیت پیاده‌سازی‌شده**

## نصب سریع و امن

### روش ۱: Deploy رسمی

روی دکمهٔ بالا بزنید و Repository را در حساب Cloudflare خود Deploy کنید. سپس در Dashboard ورکر، این دو Secret را بسازید:

| Secret | مقدار |
|---|---|
| `ADMIN_PASSWORD` | رمز مالک، حداقل ۱۰ کاراکتر |
| `SESSION_SECRET` | رشتهٔ تصادفی حداقل ۳۲ کاراکتر |

ساخت مقدار مناسب برای `SESSION_SECRET`:

```bash
openssl rand -hex 32
```

> توکن Cloudflare را داخل صفحهٔ یک Worker عمومی Paste نکنید. AMINNOVA عمداً فرم دریافت توکن ندارد.

### روش ۲: Wrangler

```bash
git clone https://github.com/amingangmanatgh2-hash/IR-penalty-.git
cd IR-penalty-
npm ci
npx wrangler login
npx wrangler secret put ADMIN_PASSWORD
npx wrangler secret put SESSION_SECRET
npm run deploy
```

### روش ۳: GitHub Actions (قالب آماده)

فایل‌های آماده در `docs/github-actions/` قرار دارند. آن‌ها را به `.github/workflows/` کپی کنید و سپس در `Settings → Secrets and variables → Actions` این Secretها را ثبت کنید:

- `CLOUDFLARE_API_TOKEN` با حداقل دسترسی Workers Scripts: Edit
- `CLOUDFLARE_ACCOUNT_ID`
- `ADMIN_PASSWORD`
- `SESSION_SECRET`

سپس Workflow **Deploy AMINNOVA** را دستی اجرا کنید. Push به `main` نیز Deploy را اجرا می‌کند.

## شروع کار پنل

1. URL ورکر را باز کنید.
2. نام کاربری مالک `AMINCK` و مقدار `ADMIN_PASSWORD` را وارد کنید.
3. در تب **پینگ**، Custom Domainهای Route‌شده به همین Worker را اضافه کنید.
4. Probe را اجرا کنید؛ ساخت اتومات Endpointهای سالم را جلو می‌آورد.
5. در داشبورد نام ساب، تعداد مسیر و تعداد پروفایل آهنین را انتخاب کنید.
6. محدودیت‌ها را وارد کنید یا دکمهٔ `∞ نامحدود` را بزنید.
7. لینک اصلی ساب یا لینک Clash/sing-box را کپی کنید.

## لینک‌های Subscription

```text
https://YOUR_WORKER/sub/TOKEN
https://YOUR_WORKER/sub/TOKEN/raw
https://YOUR_WORKER/sub/TOKEN/v2ray
https://YOUR_WORKER/sub/TOKEN/clash
https://YOUR_WORKER/sub/TOKEN/singbox
```

بدون suffix، فرمت با User-Agent تشخیص داده می‌شود.

## ساخت اتومات با API

ابتدا Login کنید و Cookie را نگه دارید:

```bash
curl -X POST https://YOUR_WORKER/api/login \
  -H 'content-type: application/json' \
  -d '{"username":"AMINCK","password":"YOUR_PASSWORD"}' \
  -c cookies.txt
```

سپس یک مشترک با پنج مسیر و سه پروفایل آهنین بسازید:

```bash
curl -X POST https://YOUR_WORKER/api/auto-build \
  -H 'content-type: application/json' \
  -b cookies.txt \
  -d '{
    "name":"VIP-Ali",
    "paths":5,
    "ironCount":3,
    "speedPreset":"god",
    "profileMode":"auto",
    "configNameTemplate":"{brand} AMINCK {user} {index}",
    "limitBytes":0,
    "limitSeconds":0,
    "maxConnections":0,
    "limitRequests":0
  }'
```

## Host Alias و Multi-port

- **workers.dev:** فقط پورت `443` پیشنهاد می‌شود.
- **Custom Domain:** فقط پورت‌هایی را فعال کنید که Cloudflare برای hostname پروکسی‌شدهٔ شما می‌پذیرد.
- **Host Alias:** باید دامنهٔ متعلق به شما باشد، به همین Worker Route شده باشد و قبلاً در Endpointها ثبت شده باشد.
- دامنه‌های شخص ثالث مانند فروشگاه‌ها، بانک‌ها یا سرویس‌های ایرانی به‌عنوان SNI/Host جعل نمی‌شوند؛ این کار هم غیرقابل‌اعتماد است و هم می‌تواند حقوق دیگران را نقض کند.

## Probe و «IP تمیز»

Cron هر ۳۰ دقیقه HTTPS را **از محل اجرای Worker** اندازه می‌گیرد. این عدد برای مرتب‌سازی Endpointهای Worker مفید است، ولی وضعیت ISP کاربر در ایران یا کشور دیگر را نشان نمی‌دهد. کاندیدهای Anycast نیز باید روی دستگاه و ISP واقعی تست شوند؛ به همین دلیل Auto Build هیچ IP ثابتی را کورکورانه وارد ساب نمی‌کند.

## APIهای مهم

| مسیر | توضیح |
|---|---|
| `GET /healthz` | سلامت Worker |
| `POST /api/login` | ورود |
| `GET /api/me` | نشست و Permissionها |
| `POST /api/users` | فهرست/جست‌وجوی مشترک |
| `POST /api/user-create` | ساخت مشترک |
| `POST /api/user-update` | ویرایش محدودیت و مسیر |
| `POST /api/config-build` | بازسازی خروجی با Save اختیاری |
| `POST /api/auto-build` | ساخت اتومات Subscription |
| `POST /api/iron-build` | ساخت ۱ تا ۵ پروفایل آهنین |
| `POST /api/probe` | Probe از Edge |
| `POST /api/endpoints` | مدیریت Endpoint |
| `POST /api/settings` | تنظیم نام، پورت، Alias و Preset |
| `POST /api/hot-update` | بازسازی مسیرها بدون تغییر دامنه |
| `POST /api/backup` | Backup مجاز |
| `POST /api/audit` | Audit log |

## توسعه و دیباگ

```bash
npm ci
npm test
npm run check
npm audit --audit-level=high
npm run build:public
npx wrangler deploy --dry-run
```

## محدودیت‌های Cloudflare

- محدودیت CPU، Request، Durable Objects و Cron تابع Plan حساب شماست.
- چند مسیر داخل یک Subscription ظرفیت جادویی ایجاد نمی‌کند؛ Groupهای Health Check فقط مسیر سالم را انتخاب می‌کنند.
- Cloudflare ممکن است اتصال به برخی مقصدها یا IPهای Cloudflare را محدود کند.
- استفاده باید مطابق قوانین محل شما، قوانین Cloudflare و حقوق دامنه‌های دیگر باشد.

## امنیت

جزئیات در [SECURITY.md](SECURITY.md) است. Secret واقعی، Token، فایل `.dev.vars` یا Backup را Commit نکنید.

## مجوز

[MIT](LICENSE)
