# یادداشت انتشار AMINNOVA 1.3.0

**Release marker:** `2026.08.22-ai-low-ping.4`  
**تاریخ:** ۱۴۰۵/۰۵/۳۱ — 2026-08-22

## تغییرات اصلی

### استودیوی ساخت مکالمه‌ای

- توضیح فارسی یا انگلیسی کاربر را به طرحی شامل ۱ تا ۲۰۰۰ Route، ۱ تا ۱۰ Subscription، Normal/Gaming، بازی‌های Catalogue، Whole-subscription Iron، ۰ تا ۵ Iron Pack، Profile، Smart Pool، Rotation و Domestic Direct تبدیل می‌کند.
- دو جریان UI دارد: «فقط طراحی» برای بازبینی فرم و «طراحی و ساخت» برای اجرای طرح از مسیر استاندارد Probe + Auto Build.
- `POST /api/ai-plan` فقط با نشست معتبر و Permission `configs:build` کار می‌کند و Prompt را به ۱۰۰۰ کاراکتر محدود می‌کند.
- پاسخ Workers AI به فیلدهای از پیش تعریف‌شده، Enumهای معتبر، سقف‌های Backend و Game IDهای Catalogue تقلیل داده می‌شود. URL، Host/SNI، Secret، کد و کلید ناشناخته پذیرفته نمی‌شود.
- در نبود Binding، مدل، سهمیه، پاسخ معتبر یا پاسخ پنج‌ثانیه‌ای، Parser تعیین‌پذیر فارسی/انگلیسی بدون متوقف‌کردن ساخت استفاده می‌شود.

### LOW PING و تنظیم قدرت

- Preset جدید `latency` با نام **LOW PING** اضافه شد: Health interval برابر ۱۵ ثانیه، tolerance برابر ۲۰ ms، Probe timeout برابر ۲٫۵ ثانیه، یک TCP retry، DNS failover و `tcp-concurrent`.
- Gaming URL-test با interval پایین‌تر و tolerance محدودتر Route اندازه‌گیری‌شده را سریع‌تر انتخاب می‌کند.
- GOD برای تشخیص سریع‌تر خرابی به Health interval بیست‌وپنج‌ثانیه، tolerance سی‌وپنج‌میلی‌ثانیه و Probe timeout سه‌ونیم‌ثانیه تنظیم شد.
- LOW PING فقط انتخاب میان Routeهای واقعاً موجود و سالم را بهینه می‌کند؛ فاصله فیزیکی، Peering، شلوغی ISP یا RTT سرور بازی را تغییر نمی‌دهد و Ping زیر ۹۰ ms تضمین نمی‌شود.

### Domestic Direct

- گزینه برای کاربر و Auto Build پیش‌فرض روشن است و در ساخت، ویرایش، Cold-start migration و Backup/Restore پایدار می‌ماند.
- Clash/Mihomo مسیرهای LAN/RFC1918/IPv6 Local را Direct نگه می‌دارد و در صورت فعال بودن گزینه، `.ir` و GeoIP ایران را پیش از تونل Direct می‌کند.
- sing-box مسیرهای Private/Local و `.ir` را Direct می‌کند.
- Xray Iron برای `geosite:ir` و `geoip:ir` قانون Direct صادر می‌کند.
- Raw VLESS و Base64 نمی‌توانند Split-routing را حمل کنند. این قابلیت فقط هنگام خرابی مسیر Proxy می‌تواند ترافیک داخلی واجد شرایط را روی مسیر مستقیم کلاینت نگه دارد؛ قطع ISP، DNS، Route داخلی یا شبکه سراسری را درمان نمی‌کند.

### UI، PWA و مانیفست

- کارت Liquid Glass برای AI، نمایش خلاصه طرح/هشدار، LOW PING در فرم ساخت/ویرایش/تنظیمات و نشان `IR DIRECT` اضافه شد.
- انتخاب تعداد Subscription اکنون تمام مقادیر ۱ تا ۱۰ را نشان می‌دهد.
- Cache پوسته PWA به `aminnova-shell-v8-ai-low-ping` ارتقا یافت؛ API، Subscription و Credentialها همچنان Cache نمی‌شوند.
- ۹ رکورد واقعی به مانیفست اضافه شد و شمار کل به **۵۶۰** رسید.

## حریم خصوصی AI

وقتی کاربر دکمه AI را می‌زند و Binding فعال است، متن Prompt همراه Instruction ثابت و فهرست عمومی Game IDها به Workers AI حساب Cloudflare ارسال می‌شود. رمز مالک، Cookie نشست، Token/UUID ساب و Backup به Prompt افزوده نمی‌شوند. استفاده ممکن است سهمیه یا هزینه حساب داشته باشد. با نبود AI ابری، Parser داخل Worker فعال است.

## سازگاری و مهاجرت

- Schema یا Migration جدید Durable Object لازم نیست؛ فیلد اختیاری `domesticDirect` هنگام Cold Start برای رکوردهای قدیمی به `true` نرمال می‌شود.
- خروجی‌های V2Ray Base64، Raw VLESS، Clash/Mihomo، sing-box و Iron حفظ شده‌اند.
- سقف‌ها بدون تغییرند: Limited=5، Normal=100، Strong=500، Ultra/owner=2000. برای موبایل ۲۰۰ Route یا کمتر توصیه می‌شود.
- Workers AI برای Production در `wrangler.jsonc` تعریف شده و Preview محلی `wrangler.local.jsonc` بدون Binding نیز کار می‌کند.

## بررسی Deploy

پس از Deploy این URL را باز کنید:

```text
https://YOUR_WORKER/healthz
```

پاسخ باید `version: "1.3.0"` و `release: "2026.08.22-ai-low-ping.4"` داشته باشد. Refresh کردن Subscription به‌تنهایی Backend قدیمی را ارتقا نمی‌دهد.

## محدودیت‌های صریح

- هیچ تضمین Ping، سرعت، IP خارجی، Location، دسترسی همه سرویس‌ها، عبور همگانی DPI، Zero downtime یا جلسه بدون وقفه وجود ندارد.
- UDP دلخواه بازی از Gateway امن عبور نمی‌کند؛ فقط DNS/53 مجاز است.
- دامنه‌های ایرانی یا شخص ثالث به‌عنوان Host/SNI جعلی برای ترافیک خارجی استفاده نمی‌شوند.
- Worker بدون مجوز Cloudflare حساب نمی‌تواند خودش را Deploy کند؛ Update Center فقط Source عمومی را بررسی و مسیر Deploy رسمی را باز می‌کند.
