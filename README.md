# AMINNOVA — پنل فروش ساب روی Cloudflare Workers

پنل فارسی و RTL برای مدیریت مشترک، ساخت Subscription و اجرای **VLESS + WebSocket + TLS** روی Cloudflare Workers. وضعیت در یک Durable Object نگه‌داری می‌شود و D1/KV جدا لازم نیست.

> **شفافیت فنی:** هیچ پروژه‌ای نمی‌تواند سرعت، پایداری، عبور از DPI، Ping زیر ۹۰ ms یا کارکرد روی «نت ملی» را برای همهٔ اپراتورها تضمین کند. LOW PING فقط کم‌تأخیرترین Route سالمِ قابل‌اندازه‌گیری را بین Deployهای واقعی شما انتخاب می‌کند. Domestic Direct نیز فقط مقصدهای خصوصی و قابل‌شناسایی `.ir`/GeoIP ایران را در کلاینت‌های Rule-capable مستقیم می‌کند و نمی‌تواند خاموشی ISP یا شبکه سراسری را برطرف کند. AMINNOVA به‌جای دامنه/SNI جعلی از hostname واقعی Worker یا دامنه‌های متعلق به خود اپراتور استفاده می‌کند. Probe Worker تأخیر HTTPS از Edge کلودفلر است، نه Ping اینترنت گوشی کاربر.

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https%3A%2F%2Fgithub.com%2Famingangmanatgh2-hash%2FAMINCK-Nova-Edge%2Ftree%2Farena%2F01a01b70-aminck-nova-edge)

## امکانات اصلی

- پنل حرفه‌ای **Liquid Glass** فارسی/RTL با Dark/Light، انیمیشن، SVG Icon، Bottom Navigation و Reduced Motion
- ورود مالک و ادمین‌های چندنقشی با Permissionهای Backend
- ساخت، ویرایش، فعال/غیرفعال و حذف مشترک
- حجم، زمان، اتصال همزمان و تعداد درخواست ساب؛ مقدار `0` یعنی نامحدود
- ساخت دسته‌ای ۱، ۲، ۳، ۵ یا ۱۰ ساب مستقل با یک کلیک
- انتخاب ۱ تا **۲۰۰۰** مسیر یکتا داخل هر Subscription برای مالک Ultra؛ ۲۰۰ یا کمتر پیشنهاد موبایل است و Giant بالاتر از ۲۰۰ کاملاً Opt-in و همراه هشدار است
- قالب نام با `{brand}`، `{app}`، `{user}`، `{profile}`، `{index}`، `{endpoint}` و `{port}`
- نام پیش‌فرض دارای برند **AMINCK**
- خروجی V2Ray Base64، Raw VLESS، Clash Meta و sing-box
- سازگار با Import استاندارد در V2Box، V2RayNG، MahsaNG، NapsternetV، Clash Meta/Mihomo و sing-box
- گروه‌های Auto، Fallback، Balance، Multi و گروه‌های Rule برای YouTube، Instagram و TikTok
- دو بخش مستقل **Normal** و **Gaming** با ۱۷۴ بازی قابل جست‌وجو، Call of Duty، Minecraft و انتخاب همه؛ قواعد رسمی Login/Launcher/Store/Content در Clash، sing-box و Xray Iron
- **Whole-subscription Iron Mode** برای برچسب‌گذاری و تجمیع تمام Routeهای همان ساب، از جمله نمونه‌های ۲۰۰ مسیره و حالت Giant تا سقف ۲۰۰۰
- ساخت ۱ تا ۵ بسته مستقل «آهنین» Xray/sing-box؛ هر بسته همهٔ مسیرهای انتخاب‌شده را با `leastPing`/`urltest` تجمیع می‌کند
- Probe اجباری Backend پیش از هر Auto Build و Probe دستی از Cloudflare Edge؛ بدون مصرف سهمیه Cron حساب
- بازیابی صحیح Token، UUID و مسیرها پس از Cold Start یا Restart شدن Durable Object
- ساخت اتومات با انتخاب چند Deploy/Custom Domain یا «انتخاب همه»، برچسب مکان تأییدشده توسط اپراتور و اولویت Endpointهای سالم با کمترین تأخیر اندازه‌گیری‌شده؛ کشور از Anycast حدس زده نمی‌شود
- مخزن کاندیدهای Cloudflare Anycast و ورودی دستی محدود به بازه‌های IPv4 رسمی Cloudflare؛ direct و IPها ساخته می‌شوند تا `url-test`/`leastPing` روی ISP واقعی انتخاب کند
- تست WSS پس از ساخت از داخل همان مرورگر برای تفکیک سلامت Edge از وضعیت واقعی ISP کاربر
- کمک اختیاری binding رسمی Cloudflare Workers AI برای انتخاب Profile از روی اعداد Probe؛ با Fail-open کامل و بدون وابستگی ساخت به AI
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
- PWA نصب‌پذیر روی Android/iOS/Desktop با Manifest، Service Worker امن، Share و مانیتور Rotation
- Update Center داخلی برای مقایسه نسخه Deploy با Source عمومی GitHub و لینک نصب امن Cloudflare؛ پنل توکن Deploy دریافت نمی‌کند و خوداستقرار جعلی ندارد
- مانیفست قابل جست‌وجو با **۵۶۰ کنترل، قابلیت و Preset پیاده‌سازی‌شده**

## نصب سریع و امن

### روش ۱: Deploy رسمی

روی دکمهٔ بالا بزنید. این لینک مستقیماً شاخهٔ عمومی و تست‌شدهٔ کامل پروژه را Clone می‌کند تا به مخزن Seed ناقص وابسته نباشد. Wizard رسمی Cloudflare از روی `.dev.vars.example` فقط یک مورد از شما می‌پرسد:

| Secret | مقدار |
|---|---|
| `ADMIN_PASSWORD` | رمز ورود مالک با نام کاربری `AMINCK`؛ حداقل ۱۰ کاراکتر |

بعد از اتمام Deploy، URL ورکر را باز کنید، وارد شوید و دکمهٔ **ساخت اتومات ساب** را بزنید. Durable Object، Assets و Endpoint اولیه خودکار Provision می‌شوند و تنظیم دستی D1/KV یا Cron لازم نیست. [Deploy Buttonهای Cloudflare](https://developers.cloudflare.com/workers/platform/deploy-buttons/) از Secretهای تعریف‌شده در `.dev.vars.example` پشتیبانی می‌کنند. اسکریپت `build` پوشه `public/` را پیش از استقرار بازتولید و بررسی می‌کند و `predeploy` نیز برای اجرای مستقیم `npm run deploy` همین کار را تکرار می‌کند.

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

برای Preview محلی بدون اتصال Workers AI به حساب Cloudflare:

```bash
cp .dev.vars.example .dev.vars
# مقدار ADMIN_PASSWORD را در .dev.vars تعیین کنید
npm run dev:local
```

فایل `wrangler.local.jsonc` فقط Binding هوش مصنوعی راه‌دور را از Preview حذف می‌کند؛ تنظیم Production همچنان `wrangler.jsonc` است.

### روش ۳: GitHub Actions (قالب آماده)

فایل‌های آماده در `docs/github-actions/` قرار دارند. آن‌ها را به `.github/workflows/` کپی کنید و سپس در `Settings → Secrets and variables → Actions` این Secretها را ثبت کنید:

- `CLOUDFLARE_API_TOKEN` با حداقل دسترسی Workers Scripts: Edit
- `CLOUDFLARE_ACCOUNT_ID`
- `ADMIN_PASSWORD`

سپس Workflow **Deploy AMINNOVA** را دستی اجرا کنید. Push به `main` نیز Deploy را اجرا می‌کند.

## شروع کار پنل

1. URL ورکر را باز کنید.
2. نام کاربری مالک `AMINCK` و مقدار `ADMIN_PASSWORD` را وارد کنید.
3. راه سریع: در **دستیار ساخت کانفیگ** بنویسید چه می‌خواهید؛ مثلاً «برای کالاف ۳۰ کانفیگ LOW PING آهنین بساز و نت ملی مستقیم بماند». ابتدا «فقط طراحی» را برای بازبینی یا «طراحی و ساخت با AI» را برای اجرای همان طرح بزنید.
4. راه دستی: **Normal** یا **Gaming** را انتخاب کنید؛ در Gaming حداقل یک بازی یا «انتخاب همه» را بزنید.
5. تعداد ساب مستقل، تعداد Route داخل هر ساب، LOW PING/GOD، Domestic Direct و Whole-subscription Iron را انتخاب کنید. برای موبایل از ۲۰۰ یا کمتر شروع کنید.
6. محدودیت‌ها را وارد کنید یا دکمهٔ `∞ نامحدود` را بزنید.
7. **ساخت اتومات ساب** را بزنید؛ پنل Probe و انتخاب Endpoint سالم را خودش انجام می‌دهد و در Deploy تازه از همان hostname ورکر استفاده می‌کند.
8. لینک اصلی ساب یا لینک Clash/sing-box را کپی کنید.

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
    "speedPreset":"latency",
    "profileMode":"auto",
    "usageMode":"gaming",
    "gameIds":["cod-mobile","minecraft-java"],
    "ironMode":true,
    "domesticDirect":true,
    "configNameTemplate":"{brand} AMINCK {user} {index}",
    "limitBytes":0,
    "limitSeconds":0,
    "maxConnections":0,
    "limitRequests":0
  }'
```

`gameIds` فقط از فهرست `POST /api/game-catalog` پذیرفته می‌شود. اگر `usageMode` برابر `gaming` باشد حداقل یک شناسه معتبر لازم است. این Presetها فقط قواعد دامنه رسمی را در خروجی‌های Rule-capable اضافه می‌کنند؛ Raw/Base64 امکان حمل Policy جداگانه ندارد.

## دستیار AI و Fallback بدون مدل

`POST /api/ai-plan` فقط برای نشست دارای Permission `configs:build` است، Prompt را به ۱۰۰۰ کاراکتر محدود می‌کند و هیچ URI، Host، SNI، Secret یا فیلد آزاد از مدل نمی‌پذیرد. طرح نهایی فقط شامل فیلدهای موجود Auto Build، Enumهای شناخته‌شده، سقف ۲۰۰۰ Route/۱۰ ساب/۵ Iron Pack و Game IDهای Catalogue است. دکمه «فقط طراحی» طرح را روی فرم می‌گذارد؛ دکمه «طراحی و ساخت» پس از همین اعتبارسنجی، مسیر عادی Probe + Auto Build را اجرا می‌کند.

اگر Binding `AI`، مدل یا سهمیه Workers AI در دسترس نباشد یا ظرف پنج ثانیه پاسخ معتبر ندهد، Parser فارسی/انگلیسی تعیین‌پذیر داخل Worker همان درخواست را به طرح محدود تبدیل می‌کند. بنابراین ساخت به AI ابری وابسته نیست. هنگام استفاده از استودیوی مکالمه‌ای و فعال بودن Binding، متن Prompt برای inference به سرویس Workers AI همان حساب Cloudflare ارسال می‌شود؛ Secret، Token اشتراک و Backup به Prompt افزوده نمی‌شوند. استفاده ممکن است سهمیه/هزینه حساب را مصرف کند.

نمونه API طراحی بدون ساخت:

```bash
curl -X POST https://YOUR_WORKER/api/ai-plan \
  -H 'content-type: application/json' \
  -b cookies.txt \
  -d '{"prompt":"سه ساب، هرکدام 30 کانفیگ LOW PING برای کالاف، آهنین و Domestic Direct"}'
```

## LOW PING و واقعیت تأخیر

- `speedPreset: "latency"` Health Check کلاینت را هر ۱۵ ثانیه، tolerance را ۲۰ ms، Probe timeout را ۲٫۵ ثانیه و TCP retry را یک تلاش تنظیم می‌کند. Clash/Mihomo از `tcp-concurrent` و گروه `url-test` استفاده می‌کند.
- Auto Build قبل از ساخت Endpointهای متعلق به اپراتور را Probe و نتایج سالم را بر اساس زمان اندازه‌گیری‌شده مرتب می‌کند. URL-test/leastPing کلاینت سپس روی شبکه واقعی کاربر از بین Routeهای صادرشده انتخاب می‌کند.
- این اعداد زمان تشخیص/انتخاب هستند، نه Ping وعده‌داده‌شده بازی. فاصله کاربر، Peering اپراتور، ازدحام، مسیر سرور بازی و محدودیت TCP-only Worker همچنان تعیین‌کننده‌اند.
- `GOD` برای Throughput/قدرت عمومی با Early Data بیشتر، دو TCP retry و Health interval بیست‌وپنج‌ثانیه‌ای باقی مانده است؛ LOW PING برای Fail-fast است و الزاماً در همه شبکه‌ها Throughput بیشتری ندارد.

## Domestic Direct و تداوم واقع‌بینانه داخلی

- Clash همیشه RFC1918/LAN/IPv6 Local را Direct می‌کند و در حالت Domestic Direct، `.ir` و GeoIP ایران را قبل از قواعد تونل قرار می‌دهد.
- sing-box مسیرهای Private/Local و دامنه‌های `.ir` را Direct می‌کند. Xray Iron از `geosite:ir` و `geoip:ir` استفاده می‌کند و به دیتابیس GeoSite/GeoIP کلاینت وابسته است.
- این Split-routing در **دستگاه کاربر** اجرا می‌شود؛ بنابراین ترافیک واجد شرایط برای Worker بین‌المللی صف نمی‌کشد و هنگام خرابی فقط همان تونل، مسیر مستقیم داخلی می‌تواند باقی بماند.
- Raw VLESS و V2Ray Base64 فقط URI هستند و قانون تفکیک مسیر حمل نمی‌کنند. برای این قابلیت از Clash/Mihomo، sing-box یا Xray Iron استفاده کنید.
- این حالت نمی‌تواند خاموشی ISP، اختلال DNS محلی، خرابی مقصد، قطع Route داخلی یا قطعی سراسری/ملی را خنثی کند. دامنه‌های ایرانی به‌عنوان SNI/Host ترافیک خارجی جعل نمی‌شوند.

## Normal، Gaming و محدودیت واقعی بازی

- **Normal:** خروجی عمومی با DIRECT SAFE و گروه‌های Auto/Fallback/Balance است.
- **Gaming:** دامنه‌های رسمی انتخاب‌شده را در Clash و sing-box به گروه اندازه‌گیری‌شده می‌فرستد و همین قواعد در بسته Xray Iron قرار می‌گیرند. Call of Duty و Minecraft در Catalogue حضور دارند و «انتخاب همه» همه ۱۷۴ مورد را فعال می‌کند.
- Gateway امن AMINNOVA فقط UDP/53 را برای DNS می‌پذیرد. در نتیجه ترافیک UDP دلخواه Gameplay از Worker عبور نمی‌کند؛ Login، Launcher، Store، Download و ترافیک TCP-compatible هدف این Preset هستند.
- Rule مسیر سالم‌تر را میان Deployهای موجود انتخاب می‌کند، اما فاصله فیزیکی تا سرور بازی را تغییر نمی‌دهد. Ping زیر ۹۰ ms، IP خارجی ثابت، دسترسی Gemini/Google یا عبور همگانی از DPI تضمین نمی‌شود.
- «کشور» فقط برچسبی است که مالک برای یک Deploy واقعی خودش وارد می‌کند. Cloudflare Anycast یا یک Worker واحد سه خروجی کشوری مستقل ایجاد نمی‌کند.

## پایداری و بازیابی بعد از حذف حساب Cloudflare

حذف کامل حساب Cloudflare یعنی Worker، Durable Object و دامنه `workers.dev` آن حساب نیز حذف می‌شوند؛ هیچ کدی داخل همان حساب نمی‌تواند بعد از حذف حساب همچنان اجرا شود. راه عملی AMINNOVA:

1. برای لینک‌های دائمی از **Custom Domain متعلق به خودتان** استفاده کنید.
2. از تب **بکاپ** فایل JSON را دانلود کنید.
3. اگر حساب حذف شد، روی حساب جدید Deploy کنید و فایل را Restore کنید. Restore مالک-only است و بکاپ فرمت فعلی یا نسخهٔ قبلی AMINCK را می‌پذیرد.
4. DNS همان Custom Domain را به Deploy جدید منتقل کنید. Token و UUID مشترک‌ها حفظ می‌شوند و مسیرها به Worker جدید Rebind می‌شوند.

برای Zero-downtime واقعی باید یک Deploy دوم در حساب/ارائه‌دهنده‌ای مستقل و DNS failover بیرون از حساب حذف‌شونده داشته باشید. این موضوع نمی‌تواند فقط با یک Worker در یک حساب تضمین شود.

## Smart Pool ∞ و تعویض یک‌دقیقه‌ای

پاسخ واقعاً «بی‌نهایت خط» نه در HTTP عملی است و نه توسط کلاینت‌های موبایل قابل Import؛ چنین خروجی‌ای حافظه و CPU را تمام می‌کند. حالت **Smart Pool ∞** راه امن این نیاز است:

- هر پاسخ یک پنجره فعال ۱ تا ۲۰۰۰ مسیره دارد؛ ۲۰۰ یا کمتر برای Import موبایل پیشنهاد می‌شود و Giant می‌تواند حافظه و Health Check کلاینت را سنگین کند.
- در هر Refresh و با بازه پیش‌فرض یک دقیقه، ترتیب مسیرها و تخصیص IPهای Anycast معتبر تغییر می‌کند.
- Path، Token و UUID ثابت می‌مانند تا Rotation اتصال‌های موجود را عمداً خراب نکند.
- مسیر اول و هر دهمین مسیر Direct است؛ بنابراین کاندید Anycast نامناسب همه خروجی را حذف نمی‌کند.
- Headerهای `x-aminck-pool-mode`، `x-aminck-rotation-epoch`، `x-aminck-refresh-seconds` و `x-aminck-active-routes` برای مانیتورینگ صادر می‌شوند.
- تعویض Server-side فقط هنگام Refresh ساب دیده می‌شود؛ کلاینت باید Refresh دوره‌ای داشته باشد. Clash/Mihomo و sing-box مسیرهای حاضر را با `url-test` پیوسته بررسی می‌کنند.

این روش قطعی صفر را تضمین نمی‌کند. برای دسترس‌پذیری جدی از Custom Domain خودتان، Backup، Deploy دوم و DNS Failover خارج از حساب اصلی استفاده کنید.

## Release 1.3.0 — AI Builder / LOW PING / Domestic Direct

Release `2026.08.22-ai-low-ping.4` استودیوی مکالمه‌ای ساخت، Fallback تعیین‌پذیر بدون مدل، Preset کم‌تأخیر، تنظیم دوباره GOD، تداوم مستقیم مقصدهای Private/ایرانی در خروجی‌های Rule-capable، ویرایش و Backup/Restore این گزینه‌ها و مانیفست ۵۶۰ موردی را اضافه می‌کند. جزئیات در [یادداشت انتشار ۱.۳.۰](docs/RELEASE-1.3.0-FA.md) آمده است.

قابلیت‌های Giant/Gaming نسخه ۱.۲ حفظ شده‌اند: سقف مالک ۲۰۰۰ Route، Normal/Gaming، Whole-subscription Iron، Catalogue دارای ۱۷۴ بازی و Update Center. حالت Giant را ابتدا روی یک کلاینت آزمایشی Import کنید. فایل Clash/sing-box شامل ۲۰۰۰ Outbound می‌تواند چند مگابایت شود و روی موبایل‌های ضعیف کند باشد. Route بیشتر الزاماً Throughput، Location، Ping یا پایداری بیشتری نمی‌دهد؛ نتیجه به Deployهای واقعی، ISP و مقصد وابسته است. Update Center فقط نسخه عمومی را کشف و Deploy رسمی Cloudflare را باز می‌کند؛ Worker بدون مجوز Cloudflare نمی‌تواند کد خودش را امن Deploy کند.

## رفع Timeout کانفیگ

Release `2026.08.21-rescue-mobile.2` مجموعهٔ قبلی Timeout Fix را کامل‌تر کرد:

- جهت `WebSocketPair` اصلاح شده است: نسخه قبلی سمت اشتباه Pair را `accept` می‌کرد؛ Handshake با کد `101` باز می‌شد اما Frameهای VLESS هرگز به Handler داخل Worker نمی‌رسیدند.
- Health Check دیگر آدرس همان Worker را از داخل تونل صدا نمی‌زند. این کار TCP Loop می‌ساخت و چون Cloudflare Workers اتصال Socket خروجی به IPهای Cloudflare را مسدود می‌کند، Routeها در `url-test` به‌اشتباه Timeout دیده می‌شدند. مقصد پیش‌فرض `https://www.gstatic.com/generate_204` است.
- **تمام** Routeهای مستقیم با برچسب **DIRECT SAFE** بدون Anycast، Fragment، Early Data و Path padding صادر می‌شوند؛ تنظیمات پیشرفته فقط روی کپی‌های اختیاری Anycast اعمال می‌شود.
- دامنه‌ای که پنل از روی آن باز شده Route اول است؛ Endpoint قدیمی یا Worker حذف‌شده دیگر به‌صورت ناخواسته Route اصلی نمی‌شود.
- اگر DoHهای تنظیم‌شده موقتاً در دسترس نباشند، پس از مسدودسازی نام‌های Local/Special-use، DNS داخلی Workers Sockets به‌عنوان Fallback استفاده می‌شود. پاسخ عمومی DoH نیز ۶۰ ثانیه Cache می‌شود.
- دکمه **«تعمیر همه کانفیگ‌ها روی دامنه فعلی»** UUID و Token را نگه می‌دارد اما تمام مشترک‌ها را در حالت Stable و DIRECT SAFE به همین Deploy متصل می‌کند. پس از آن Subscription کلاینت باید Refresh شود.
- تست داخل پنل فقط موفقیت `101 WebSocket` را گزارش نمی‌کند؛ Packet واقعی VLESS و درخواست TCP ارسال و وضعیت پاسخ داده می‌شود.

در `/healthz`، فیلد `version` و هدرهای `x-aminck-release` / `x-aminck-version` نسخه Deploy را بررسی کنید. در نسخه جاری باید `version` برابر `1.3.0` و Release برابر `2026.08.22-ai-low-ping.4` باشد. اگر این شناسه دیده نمی‌شود، Worker هنوز کد قدیمی را اجرا می‌کند و Refresh اشتراک به‌تنهایی Backend را ارتقا نمی‌دهد.

محدودیت پلتفرم: طبق [ملاحظات رسمی Cloudflare TCP Sockets](https://developers.cloudflare.com/workers/runtime-apis/tcp-sockets/#considerations)، مقصد نهایی‌ای که خودش روی IPهای Cloudflare میزبانی می‌شود ممکن است با Workers TCP Sockets قابل اتصال نباشد. این محدودیت با جعل SNI یا افزودن تعداد Route حل نمی‌شود؛ برای چنین مقصدی Gateway مستقل و متعلق به اپراتور لازم است.

## اپ موبایل نصب‌پذیر

پنل یک **Progressive Web App** در همان مخزن و همان Worker است. از دکمه «نصب اپ» می‌توان آن را روی Home Screen نصب کرد. اپ همراه مدیریت مشترک، Normal/Gaming، Copy/Share همه فرمت‌ها، بررسی Shell و Source Update و مانیتور یک‌دقیقه‌ای Pool را ارائه می‌دهد. بررسی Source اطلاعات عمومی GitHub را می‌خواند؛ نصب کد جدید همچنان به مجوز Deploy Cloudflare نیاز دارد. Service Worker فقط Shell عمومی را Cache می‌کند و عمداً `/api`، `/sub`، `/healthz`، `/connect` و WebSocket را Cache نمی‌کند.

PWA مرورگر اجازه ایجاد VPN سیستمی (`VpnService`/Network Extension) ندارد؛ بنابراین برای اتصال واقعی، Subscription را در V2RayNG، V2Box، MahsaNG، NapsternetV، Clash/Mihomo یا sing-box Import کنید. تب «اپ موبایل» لینک مناسب هر فرمت را می‌دهد؛ جزئیات در [راهنمای اپ موبایل و Smart Pool](docs/MOBILE-PWA-FA.md) آمده است.

## Host Alias و Multi-port

- **workers.dev:** فقط پورت `443` پیشنهاد می‌شود.
- **Custom Domain:** فقط پورت‌هایی را فعال کنید که Cloudflare برای hostname پروکسی‌شدهٔ شما می‌پذیرد.
- **Host Alias:** باید دامنهٔ متعلق به شما باشد، به همین Worker Route شده باشد و قبلاً در Endpointها ثبت شده باشد.
- دامنه‌های شخص ثالث مانند فروشگاه‌ها، بانک‌ها یا سرویس‌های ایرانی به‌عنوان SNI/Host جعل نمی‌شوند؛ این کار هم غیرقابل‌اعتماد است و هم می‌تواند حقوق دیگران را نقض کند.

## Probe و «IP تمیز»

دکمهٔ **ساخت اتومات ساب** پیش از ساخت، `/healthz` Endpointها را **از محل اجرای Worker** می‌سنجد و فقط دامنه‌ای را سالم می‌داند که Marker خود AMINNOVA را برگرداند؛ Probe دستی نیز در تب پینگ موجود است. این طراحی هیچ Cron حسابی مصرف نمی‌کند. عدد Edge وضعیت ISP کاربر را نشان نمی‌دهد؛ بنابراین در حالت Anycast، لینک مستقیم و کاندیدهای Cloudflare با SNI واقعی Worker تولید می‌شوند و انتخاب نهایی به `url-test`/`leastPing` کلاینت روی همان ISP سپرده می‌شود. هیچ IP یا دسترسی‌ای برای همه شبکه‌ها تضمین نمی‌شود.

گزینهٔ قدیمی **Cloudflare Workers AI** در Auto Build پیش‌فرض خاموش است و فقط Profile معتبر را از روی اعداد Probe پیشنهاد می‌دهد. استودیوی مکالمه‌ای هنگام کلیک روی دکمه‌های AI، در صورت وجود Binding از Workers AI استفاده می‌کند و در غیر این صورت فوراً به Parser تعیین‌پذیر داخلی می‌رود. AI نمی‌تواند وضعیت فیلترینگ ISP را حدس قطعی بزند. اگر مدل، سهمیه یا Binding در دسترس نباشد، ساخت بدون خطا ادامه می‌یابد. inference ممکن است طبق تعرفهٔ حساب Cloudflare هزینه/سهمیه مصرف کند.

## APIهای مهم

| مسیر | توضیح |
|---|---|
| `GET /healthz` | سلامت، نسخه و Release Worker |
| `GET /api/launch` | لینک Source/Deploy و نسخه جاری |
| `GET /api/update-check` | مقایسه نسخه جاری با package عمومی GitHub؛ بدون دریافت توکن Cloudflare |
| `POST /api/login` | ورود |
| `GET /api/me` | نشست و Permissionها |
| `POST /api/users` | فهرست/جست‌وجوی مشترک |
| `POST /api/user-create` | ساخت مشترک Normal/Gaming/Iron |
| `POST /api/user-update` | ویرایش محدودیت، مسیر، بازی‌ها و Iron Mode |
| `POST /api/game-catalog` | Metadata امن ۱۷۴ بازی و شناسه‌های انتخاب |
| `POST /api/ai-plan` | طراحی محدودشده از متن؛ نیازمند نشست و `configs:build`، با Fallback بدون مدل |
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

- محدودیت CPU، Request و Durable Objects تابع Plan حساب شماست؛ AMINNOVA به Cron حساب نیاز ندارد.
- چند مسیر داخل یک Subscription ظرفیت جادویی ایجاد نمی‌کند؛ Groupهای Health Check فقط مسیر سالم را انتخاب می‌کنند.
- Cloudflare ممکن است اتصال به برخی مقصدها یا IPهای Cloudflare را محدود کند.
- استفاده باید مطابق قوانین محل شما، قوانین Cloudflare و حقوق دامنه‌های دیگر باشد.

## امنیت

جزئیات در [SECURITY.md](SECURITY.md) است. Secret واقعی، Token، فایل `.dev.vars` یا Backup را Commit نکنید.

## مجوز

[MIT](LICENSE)
