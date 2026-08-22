# راهنمای اپ موبایل و Smart Pool در AMINNOVA

## نصب پنل به‌صورت اپ

1. Worker را با HTTPS باز کنید.
2. روی «نصب اپ» در نوار بالای پنل بزنید.
3. در Android/Chrome گزینه Install و در iOS/Safari گزینه Share → Add to Home Screen را انتخاب کنید.
4. آیکون AMINNOVA از Home Screen در حالت Standalone باز می‌شود.

اپ نصب‌شده همان پنل امن Cloudflare است؛ دیتابیس یا Secret جداگانه روی گوشی ذخیره نمی‌کند. Service Worker فقط HTML/CSS/JS/Manifest/Icon عمومی را Cache می‌کند و مسیرهای `/api`، `/sub`، `/healthz`، `/connect` و `/e…` را کنار می‌گذارد.

## ساخت با دستیار AI

1. در داشبورد، داخل «دستیار ساخت کانفیگ با متن فارسی» نیاز خود را بنویسید؛ تعداد ساب/کانفیگ، بازی، Iron، کم‌پینگ یا پایداری، Smart Pool و Domestic Direct را می‌توانید در یک جمله بیاورید.
2. «فقط طراحی» فرم را پر می‌کند تا قبل از ساخت بررسی کنید. «طراحی و ساخت با AI» همان طرح را بعد از اعتبارسنجی وارد Probe + Auto Build می‌کند.
3. طرح فقط از فیلدهای امن پنل و Game IDهای Catalogue استفاده می‌کند. AI نمی‌تواند Host/SNI، کد یا گزینه دلخواه تزریق کند.
4. اگر Workers AI در دسترس نباشد، Parser داخلی فارسی/انگلیسی کار را بدون خطا ادامه می‌دهد. اگر Binding فعال باشد، متن Prompt برای inference به Workers AI حساب Cloudflare ارسال می‌شود؛ Token ساب، رمز، Secret و Backup ارسال نمی‌شوند.

نمونه: `برای کالاف ۳۰ کانفیگ LOW PING آهنین بساز، سه ساب و نت ملی مستقیم بماند`.

## ساخت Smart Pool

1. در داشبورد Endpointهای متعلق به همین Worker را انتخاب کنید.
2. گزینه Anycast را برای افزودن کاندیدهای رسمی Cloudflare روشن بگذارید.
3. گزینه **Smart Pool نامحدود زمانی** را روشن کنید.
4. Rotation را روی ۱ تا ۶۰ دقیقه قرار دهید؛ مقدار پیش‌فرض ۱ دقیقه است.
5. تعداد مسیر فعال را تعیین کنید. تا ۲۰۰ برای موبایل پیشنهاد می‌شود؛ دکمه MAX Giant عدد ۲۰۰۰، Whole-subscription Iron و پنج Iron Pack را فعال می‌کند.
6. «ساخت Smart Subscription» را بزنید.

Smart Pool پاسخ نامتناهی تولید نمی‌کند. در هر دریافت یک پنجره حداکثر ۲۰۰۰ مسیره می‌سازد و در دوره بعد ترتیب و اتصال Anycast را تغییر می‌دهد. بالاتر از ۲۰۰ ممکن است Import، حافظه و تست سلامت کلاینت موبایل را کند یا ناپایدار کند؛ ابتدا با تعداد کم آزمایش کنید.

## Normal، Gaming و Iron

- **Normal** برای استفاده عمومی و بیشترین سازگاری شروع مناسب‌تری است.
- **LOW PING** Route سالم با کمترین زمان اندازه‌گیری‌شده را با URL-test سریع‌تر انتخاب و خرابی را Fail-fast می‌کند. این حالت فاصله فیزیکی یا Peering ISP را عوض نمی‌کند و Ping مشخصی را تضمین نمی‌کند.
- **Gaming** دارای جست‌وجو و «انتخاب همه» برای ۱۷۴ بازی، از جمله Call of Duty و Minecraft است. این حالت دامنه‌های رسمی Login/Launcher/Store/Content را در Clash و sing-box به گروه `url-test` می‌دهد و در Xray Iron نیز Rule متناظر می‌سازد.
- **Whole-subscription Iron** تمام Routeهای همان ساب را با `IRON` نام‌گذاری می‌کند؛ با انتخاب ۲۰۰ Route می‌توان یک ساب ۲۰۰ کانفیگ Iron داشت. این گزینه با «۱ تا ۵ Iron Pack» فرق دارد: Packها فایل JSON تجمیعی جداگانه‌اند.
- Raw/Base64 فقط مجموعه URI است و Rule دامنه مستقل حمل نمی‌کند؛ نام `GAMING`/`IRON` را دارد اما Policy Gaming کامل را باید با Clash، sing-box یا Xray Iron Import کرد.
- Worker ترافیک UDP دلخواه Gameplay را عبور نمی‌دهد و UDP فقط برای DNS/53 است. Ping زیر ۹۰ ms، موقعیت خارجی، عبور همگانی DPI یا دسترسی همه سرویس‌ها تضمین نمی‌شود.

## Domestic Direct روی موبایل

این گزینه پیش‌فرض روشن است. در Clash/Mihomo مسیرهای LAN/Private همیشه Direct هستند و `.ir`/GeoIP ایران نیز هنگام فعال بودن گزینه پیش از تونل Direct می‌شوند. sing-box برای Private/Local و `.ir` Rule مستقیم دارد؛ Xray Iron از دیتابیس `geosite:ir`/`geoip:ir` کلاینت استفاده می‌کند. Raw/Base64 این Ruleها را حمل نمی‌کند.

اگر فقط Worker بین‌المللی خراب شود، ترافیک داخلی واجد شرایط همچنان از اینترنت مستقیم گوشی عبور می‌کند. اما این حالت نمی‌تواند Airplane Mode، قطع ISP، اختلال DNS/Route داخلی، خرابی مقصد یا خاموشی سراسری شبکه را جبران کند. هیچ دامنه ایرانی به‌عنوان SNI/Host جعلی برای ترافیک خارجی استفاده نمی‌شود.

## Multi-Endpoint واقعی

در تب «پینگ»، برای هر Worker/Custom Domain واقعاً تحت کنترل خودتان Endpoint بسازید و یک برچسب مکان صادقانه مانند `Frankfurt Primary` بدهید. Auto Build آن‌ها را Probe و سالم‌ترین/کم‌تأخیرترین نتیجه Edge را جلوتر می‌گذارد. یک IP Cloudflare Anycast کشور ثابتی را ثابت نمی‌کند و AMINNOVA کشور جعلی تولید نمی‌کند.

## Import در کلاینت

در تب «اپ موبایل»، مشترک را انتخاب کنید:

- **ساب خودکار/Base64:** V2RayNG، V2Box، MahsaNG و NapsternetV
- **VLESS خام:** Import دستی لینک‌ها
- **Clash/Mihomo:** لینک YAML دارای URLTest و Fallback
- **sing-box:** لینک JSON دارای Selector و URLTest
- **Iron:** JSON تجمیعی Xray یا sing-box از تب آهنین

لینک Subscription یک Credential خصوصی است. فقط برای صاحب همان اشتراک Share کنید.

## Rotation یک‌دقیقه‌ای چگونه کار می‌کند؟

- Backend بر اساس دقیقه جاری یک Epoch می‌سازد.
- Path، Token و UUID ثابت می‌مانند.
- ترتیب مسیرها و تخصیص IPهای Cloudflare عوض می‌شود.
- مسیر Direct همیشه در پنجره باقی می‌ماند.
- تغییر جدید وقتی دیده می‌شود که کلاینت Subscription را Refresh کند.
- Clash/Mihomo و sing-box حتی بین Refreshها مسیرهای موجود را Health Check می‌کنند.

تب اپ یک مانیتور اختیاری دارد که تا زمانی که صفحه باز است هر دقیقه Headerهای Rotation را بررسی می‌کند. مرورگر پس از بسته‌شدن اپ اجازه اجرای دائمی Timer را تضمین نمی‌کند.

## اگر کانفیگ Timeout شد

نسخه Timeout Fix جهت `WebSocketPair` را اصلاح کرده است؛ در نسخه قدیمی `101 Switching Protocols` موفق بود اما Frameهای VLESS به سمت Worker تحویل نمی‌شدند. بنابراین فقط Refresh‌کردن Subscription روی Backend قدیمی کافی نیست و Worker باید دوباره Deploy شود.

1. `/healthz` دامنه Deploy را باز کنید و مطمئن شوید `version` برابر `1.3.0` و `release` برابر `2026.08.22-ai-low-ping.4` است.
2. اگر کانفیگ‌ها هنوز دامنه Deploy قبلی را دارند، بالای پنل دکمه **«تعمیر همه کانفیگ‌ها روی دامنه فعلی»** را بزنید. UUID و Token حفظ می‌شود ولی Routeها به دامنه فعال بازسازی می‌شوند.
3. Subscription را در کلاینت Refresh کنید و Route دارای برچسب **DIRECT SAFE** را آزمایش کنید. تمام Routeهای مستقیم بدون Early Data، Padding و Fragment صادر می‌شوند.
4. نتیجه تست داخل داشبورد باید وضعیت `WSS + VLESS + TCP` را نشان دهد؛ بازشدن WebSocket به‌تنهایی نشانه کارکرد تونل نیست.
5. Health URL را روی خود Worker قرار ندهید. Worker نمی‌تواند از TCP Socket به خودش یا IPهای Cloudflare Loop بزند؛ AMINNOVA به‌طور پیش‌فرض از gstatic استفاده می‌کند.
6. اگر DIRECT SAFE کار کرد ولی Anycastها نه، Anycast را برای آن شبکه خاموش کنید؛ «IP تمیز همگانی» وجود ندارد. فرم ساخت موبایل اکنون در حالت Stable/Direct شروع می‌شود و Heavy اختیاری است.
7. اگر مقصد نهایی روی Cloudflare میزبانی شده باشد، محدودیت Workers Sockets ممکن است اتصال آن مقصد را مسدود کند؛ Route بیشتر یا SNI جعلی این محدودیت را رفع نمی‌کند.

## Update Center اپ

- «آپدیت Shell اپ» از Service Worker می‌خواهد HTML/CSS/JS عمومی را دوباره بررسی کند.
- «بررسی GitHub / Deploy» نسخه `1.3.0` داخل Worker را با `package.json` شاخه عمومی مقایسه می‌کند و نتیجه موفق را پنج دقیقه Cache می‌کند.
- اگر نسخه جدید باشد، دکمه Deploy رسمی باز می‌شود. پنل Cloudflare API Token نمی‌گیرد و بدون Git Integration، Deploy Button، Wrangler Login یا مجوز حساب نمی‌تواند کد Worker را خودکار جایگزین کند.
- در صورت اختلال GitHub، اتصال‌ها و ساخت ساب از کار نمی‌افتند؛ فقط بررسی نسخه پیام خطای قابل‌فهم نشان می‌دهد.

## چرا خود PWA مستقیماً VPN نمی‌شود؟

مرورگر به PWA مجوز Android `VpnService` یا iOS Network Extension نمی‌دهد. ساخت یک VPN Native نیازمند پروژه جداگانه Android/iOS، هسته پروتکل ممیزی‌شده، امضای برنامه و مجوزهای Store است. AMINNOVA به‌جای ادعای اتصال غیرواقعی، لینک استاندارد برای کلاینت‌های معتبر تولید می‌کند.

## پایداری

هیچ IP، Worker یا ISP بدون قطعی تضمین نمی‌شود. برای کاهش ریسک:

- از Custom Domain متعلق به خودتان استفاده کنید.
- فایل Backup حساس را خارج از Cloudflare و داخل فضای ذخیره‌سازی رمزگذاری‌شده نگه دارید.
- Deploy دوم در حساب مستقل داشته باشید.
- DNS Failover را بیرون از حساب Worker پیکربندی کنید.
- Endpointها و نتیجه WSS را از شبکه واقعی کاربر تست کنید.
