# یادداشت انتشار AMINNOVA 1.4.0

**Release marker:** `2026.08.23-arena-ai-services.5`  
**تاریخ:** ۱۴۰۵/۰۶/۰۱ — 2026-08-23

## تغییرات اصلی

### AMINNOVA Arena — میان‌افزار سرویس‌های AI

- چهار سرویس هوش مصنوعی امن پشت یک مسیر یکپارچه `POST /api/arena` قرار گرفتند؛ `GET /api/arena` کاتالوگ سرویس‌ها را به نشست معتبر برمی‌گرداند.
- **طراح طرح ساخت (`build-plan`):** همان Parser امن فارسی/انگلیسی دستیار ساخت، این‌بار با گزارش یافته‌ها و متریک‌های تعداد Route، ساب، بازی و بسته‌های Iron.
- **مربی پروفایل (`profile-coach`):** فقط از تأخیرهای واقعی Probe حداکثر ۵۰ Endpoint سالم استفاده می‌کند و ترکیب محافظه‌کار Speed Preset / Profile Mode را پیشنهاد می‌دهد؛ بدون داده، Stable/Fallback انتخاب می‌شود.
- **تحلیل‌گر Endpoint (`endpoint-analyst`):** نتایج Probe را به گزارش فارسی سالم/خراب/کهنگی (قدیمی‌تر از ۳۰ دقیقه)، بهترین تأخیر و پراکندگی تبدیل می‌کند و نبود Endpoint سالم یا تک‌Endpoint‌بودن را صریح هشدار می‌دهد.
- **داور امنیت تنظیمات (`security-review`):** تنظیمات پنل را با امتیاز ۰ تا ۱۰۰ داوری می‌کند؛ DoH غیر HTTPS، Resolver جایگزین ناامن، Health Check با اشاره به دامنه خود Worker (TCP Loop)، پورت خارج از فهرست رسمی Cloudflare، Host Alias بدون مالکیت، لینک پشتیبانی غیر HTTPS و عنوان/برند بیش‌ازاندازه بلند امتیاز کم می‌کنند.
- نتیجه معتبر هر سرویس همیشه از موتور تعیین‌پذیر داخل Worker ساخته می‌شود. در صورت دسترس‌بودن Binding، Cloudflare AI فقط متن خلاصه را بازنویسی می‌کند و آن هم پس از پاکسازی کامل؛ اعداد، Enumها، یافته‌ها و امتیازها از مدل نمی‌آیند.

### امنیت و حریم خصوصی Arena

- هر چهار سرویس فقط با نشست HttpOnly معتبر و Permission `configs:build` اجرا می‌شوند؛ سرویس ناشناخته با `400` و فهرست کاتالوگ رد می‌شود.
- بدنه Context از Whitelist سخت‌گیر عبور می‌کند: فقط `latencies` (حداکثر ۵۰ عدد، بازه ۰ تا ۶۰٬۰۰۰)، `goal`، `results` (حداکثر ۱۰۰ رکورد)، زیرمجموعه غیرحساس `settings`، `workerHost` و `now` پذیرفته می‌شود و بقیه کلیدها — از جمله هر مقدار شبیه Secret — حذف می‌شوند.
- خروجی مدل با `sanitizeArenaText` از URL، آدرس IP، UUID و رشته‌های طولانی شبه‌Token پاکسازی می‌شود؛ متن خالی یا خیلی کوتاه پذیرفته نیست و موتور داخلی جایگزین می‌شود.
- فراخوانی مدل سقف ۴ ثانیه دارد و در نبود Binding، مدل، سهمیه یا پاسخ معتبر، سرویس Fail-open با پاسخ تعیین‌پذیر ادامه می‌دهد؛ رمز مالک، Cookie نشست، Token/UUID ساب و Backup به مدل ارسال نمی‌شوند.

### UI، PWA و مانیفست

- کارت Liquid Glass «سرویس‌های هوش مصنوعی Arena» در داشبورد اضافه شد: انتخاب سرویس، ورود Prompt (برای طراح طرح) و نمایش خلاصه، یافته‌ها، هشدارها، امتیاز داور امنیت و پیشنهاد مربی پروفایل با نشان موتور داخلی یا Cloudflare AI.
- Context سرویس‌های مربی، تحلیل‌گر و داور مستقیم از داده واقعی همان پنل (نتایج Probe، حالت Normal/Gaming انتخاب‌شده و تنظیمات) پر می‌شود.
- Cache پوسته PWA به `aminnova-shell-v9-arena-ai` ارتقا یافت؛ API، Subscription و Credentialها همچنان Cache نمی‌شوند.
- ۱۲ رکورد واقعی دسته `ai` به مانیفست اضافه شد و شمار کل به **۵۷۲** رسید.

### نگهداری Release

- لینک Deploy رسمی و Update Center اکنون به شاخه پایدار `main` مخزن اشاره می‌کند تا Deploy همیشه آخرین نسخه تست‌شده را نصب کند.
- نسخه به **1.4.0** و شناسه Release به `2026.08.23-arena-ai-services.5` ارتقا یافت و در `/healthz`، هدرهای Subscription و Topbar قابل بررسی است.

## تفکیک Normal/Gaming و تنظیمات GOD (بدون تغییر)

- دو بخش مستقل **Normal** و **Gaming** با Gaming Route Studio، ۱۷۴ بازی قابل جست‌وجو و قواعد دامنه رسمی Login/Launcher/Store/Content در Clash/Mihomo، sing-box و Xray Iron حفظ شده‌اند.
- پنج Preset سرعت **Stable / Balanced / Turbo / GOD / LOW PING** و تنظیمات کامل پنل (DoH، Health Check، پورت‌ها، Host Alias، Anti-Detect، قالب نام و برند AMINCK GOD Edition) بدون تغییر باقی مانده‌اند.
- هیچ‌کدام از قابلیت‌های نسخه‌های قبلی حذف یا Reset نشده‌اند.

## سازگاری و مهاجرت

- Schema یا Migration جدید Durable Object لازم نیست؛ Arena Stateless است و داده‌ای ذخیره نمی‌کند.
- خروجی‌های V2Ray Base64، Raw VLESS، Clash/Mihomo، sing-box و Iron و رفتار `/api/ai-plan` بدون تغییر حفظ شده‌اند.
- سقف‌ها بدون تغییرند: Limited=5، Normal=100، Strong=500، Ultra/owner=2000. برای موبایل ۲۰۰ Route یا کمتر توصیه می‌شود.
- Workers AI برای Production در `wrangler.jsonc` تعریف شده و Preview محلی `wrangler.local.jsonc` بدون Binding نیز کار می‌کند.

## بررسی Deploy

پس از Deploy این URL را باز کنید:

```text
https://YOUR_WORKER/healthz
```

پاسخ باید `version: "1.4.0"` و `release: "2026.08.23-arena-ai-services.5"` داشته باشد. Refresh کردن Subscription به‌تنهایی Backend قدیمی را ارتقا نمی‌دهد.

## محدودیت‌های صریح

- هیچ تضمین Ping، سرعت، IP خارجی، Location، دسترسی همه سرویس‌ها، عبور همگانی DPI، Zero downtime یا جلسه بدون وقفه وجود ندارد.
- پیشنهادهای Arena تصمیم نهایی نیستند؛ Backend همه ورودی‌ها را دوباره اعتبارسنجی می‌کند و ساخت واقعی همچنان از مسیر Probe + Auto Build می‌گذرد.
- UDP دلخواه بازی از Gateway امن عبور نمی‌کند؛ فقط DNS/53 مجاز است.
- دامنه‌های ایرانی یا شخص ثالث به‌عنوان Host/SNI جعلی برای ترافیک خارجی استفاده نمی‌شوند.
- Worker بدون مجوز Cloudflare حساب نمی‌تواند خودش را Deploy کند؛ Update Center فقط Source عمومی را بررسی و مسیر Deploy رسمی را باز می‌کند.
