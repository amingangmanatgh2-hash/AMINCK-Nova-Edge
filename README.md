# AMINNOVA — پنل فروش ساب روی Cloudflare Workers

پنل فارسی و RTL برای مدیریت مشترک، ساخت Subscription و اجرای **VLESS + WebSocket + TLS** روی Cloudflare Workers. وضعیت در یک Durable Object نگه‌داری می‌شود و D1/KV جدا لازم نیست.

> **شفافیت فنی:** هیچ پروژه‌ای نمی‌تواند سرعت، پایداری، عبور از DPI یا کارکرد روی «نت ملی» را برای همهٔ اپراتورها تضمین کند. AMINNOVA به‌جای دامنه/SNI جعلی از hostname واقعی Worker یا دامنه‌های متعلق به خود اپراتور استفاده می‌کند. Probe نیز تأخیر HTTPS از Edge کلودفلر است، نه Ping اینترنت گوشی کاربر.

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https%3A%2F%2Fgithub.com%2Famingangmanatgh2-hash%2FAMINCK-Nova-Edge%2Ftree%2Farena%2F01a01b70-aminck-nova-edge)

## امکانات اصلی

- پنل سادهٔ فارسی، RTL، واکنش‌گرا و Dark/Light
- ورود مالک و ادمین‌های چندنقشی با Permissionهای Backend
- ساخت، ویرایش، فعال/غیرفعال و حذف مشترک
- حجم، زمان، اتصال همزمان و تعداد درخواست ساب؛ مقدار `0` یعنی نامحدود
- ساخت دسته‌ای ۱، ۲، ۳، ۵ یا ۱۰ ساب مستقل با یک کلیک
- انتخاب ۱ تا ۲۰۰ کانفیگ داخل هر Subscription (با سقف نقش ادمین)
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
- Audit log، Backup/Restore قابل حمل، چرخش UUID/Token و Hot Update مسیرها
- Session تصادفی ۲۵۶ بیتی، PBKDF2، Lockout، Same-Origin و Security Headerها
- مانیفست داخل پنل با **۲۰۰+ کنترل و قابلیت پیاده‌سازی‌شده**

## نصب سریع و امن

### روش ۱: Deploy رسمی

روی دکمهٔ بالا بزنید. این لینک مستقیماً شاخهٔ عمومی و تست‌شدهٔ کامل پروژه را Clone می‌کند تا به مخزن Seed ناقص وابسته نباشد. Wizard رسمی Cloudflare از روی `.dev.vars.example` فقط یک مورد از شما می‌پرسد:

| Secret | مقدار |
|---|---|
| `ADMIN_PASSWORD` | رمز ورود مالک با نام کاربری `AMINCK`؛ حداقل ۱۰ کاراکتر |

بعد از اتمام Deploy، URL ورکر را باز کنید، وارد شوید و دکمهٔ **ساخت اتومات ساب** را بزنید. Durable Object، Assets، Cron و Endpoint اولیه خودکار Provision می‌شوند و تنظیم دستی D1/KV لازم نیست. [Deploy Buttonهای Cloudflare](https://developers.cloudflare.com/workers/platform/deploy-buttons/) از Secretهای تعریف‌شده در `.dev.vars.example` پشتیبانی می‌کنند. اسکریپت `build` پوشه `public/` را پیش از استقرار بازتولید و بررسی می‌کند و `predeploy` نیز برای اجرای مستقیم `npm run deploy` همین کار را تکرار می‌کند.

> توکن Cloudflare را داخل صفحهٔ یک Worker عمومی Paste نکنید. AMINNOVA عمداً فرم دریافت توکن ندارد.

### رفع خطای Static Assets

اگر Cloudflare پیام `Could not detect a directory containing static files` نشان داد، مخزن Source انتخاب‌شده ناقص است. ریشهٔ Repository باید حداقل `package.json`، `wrangler.jsonc`، پوشه‌های `src/` و `public/` را داشته باشد؛ مخزنی که فقط `README.md` دارد قابل Deploy نیست. در Build settings، فرمان Build را `npm run build` و فرمان Deploy را `npm run deploy` نگه دارید.

### روش ۲: Wrangler

```bash
git clone --branch arena/01a01b70-aminck-nova-edge --single-branch https://github.com/amingangmanatgh2-hash/AMINCK-Nova-Edge.git aminnova
cd aminnova
npm ci
npx wrangler login
npx wrangler secret put ADMIN_PASSWORD
npm run deploy
```

### روش ۳: GitHub Actions (قالب آماده)

فایل‌های آماده در `docs/github-actions/` قرار دارند. آن‌ها را به `.github/workflows/` کپی کنید و سپس در `Settings → Secrets and variables → Actions` این Secretها را ثبت کنید:

- `CLOUDFLARE_API_TOKEN` با حداقل دسترسی Workers Scripts: Edit
- `CLOUDFLARE_ACCOUNT_ID`
- `ADMIN_PASSWORD`

سپس Workflow **Deploy AMINNOVA** را دستی اجرا کنید. Push به `main` نیز Deploy را اجرا می‌کند.

## شروع کار پنل

1. URL ورکر را باز کنید.
2. نام کاربری مالک `AMINCK` و مقدار `ADMIN_PASSWORD` را وارد کنید.
3. در داشبورد تعداد ساب مستقل، تعداد کانفیگ داخل هر ساب و تعداد پروفایل آهنین را انتخاب کنید.
4. محدودیت‌ها را وارد کنید یا دکمهٔ `∞ نامحدود` را بزنید.
5. **ساخت اتومات ساب** را بزنید؛ پنل Probe و انتخاب Endpoint سالم را خودش انجام می‌دهد و در Deploy تازه از همان hostname ورکر استفاده می‌کند.
6. لینک اصلی ساب یا لینک Clash/sing-box را کپی کنید.

افزودن Custom Domain در تب **پینگ** اختیاری است و فقط وقتی لازم می‌شود که دامنهٔ متعلق به خودتان را قبلاً به همین Worker Route کرده باشید.

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

سپس سه ساب مستقل، هرکدام با پنج کانفیگ، و سه پروفایل آهنین برای ساب اول بسازید:

```bash
curl -X POST https://YOUR_WORKER/api/auto-build \
  -H 'content-type: application/json' \
  -b cookies.txt \
  -d '{
    "name":"VIP-Ali",
    "subscriptionCount":3,
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


## پایداری و بازیابی بعد از حذف حساب Cloudflare

حذف کامل حساب Cloudflare یعنی Worker، Durable Object و دامنه `workers.dev` آن حساب نیز حذف می‌شوند؛ هیچ کدی داخل همان حساب نمی‌تواند بعد از حذف حساب همچنان اجرا شود. راه عملی AMINNOVA:

1. برای لینک‌های دائمی از **Custom Domain متعلق به خودتان** استفاده کنید.
2. از تب **بکاپ** فایل JSON را دانلود کنید.
3. اگر حساب حذف شد، روی حساب جدید Deploy کنید و فایل را Restore کنید. Restore مالک-only است و بکاپ فرمت فعلی یا نسخهٔ قبلی AMINCK را می‌پذیرد.
4. DNS همان Custom Domain را به Deploy جدید منتقل کنید. Token و UUID مشترک‌ها حفظ می‌شوند و مسیرها به Worker جدید Rebind می‌شوند.

برای Zero-downtime واقعی باید یک Deploy دوم در حساب/ارائه‌دهنده‌ای مستقل و DNS failover بیرون از حساب حذف‌شونده داشته باشید. این موضوع نمی‌تواند فقط با یک Worker در یک حساب تضمین شود.

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
| `POST /api/auto-build` | ساخت اتومات ۱ تا ۱۰ Subscription |
| `POST /api/iron-build` | ساخت ۱ تا ۵ پروفایل آهنین |
| `POST /api/probe` | Probe از Edge |
| `POST /api/endpoints` | مدیریت Endpoint |
| `POST /api/settings` | تنظیم نام، پورت، Alias و Preset |
| `POST /api/hot-update` | بازسازی مسیرها بدون تغییر دامنه |
| `POST /api/backup` | خروجی Backup قابل حمل |
| `POST /api/restore` | بازیابی مالک و اتصال مسیرها به دامنه جدید |
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
