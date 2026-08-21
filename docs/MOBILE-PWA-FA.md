# راهنمای اپ موبایل و Smart Pool در AMINNOVA

## نصب پنل به‌صورت اپ

1. Worker را با HTTPS باز کنید.
2. روی «نصب اپ» در نوار بالای پنل بزنید.
3. در Android/Chrome گزینه Install و در iOS/Safari گزینه Share → Add to Home Screen را انتخاب کنید.
4. آیکون AMINNOVA از Home Screen در حالت Standalone باز می‌شود.

اپ نصب‌شده همان پنل امن Cloudflare است؛ دیتابیس یا Secret جداگانه روی گوشی ذخیره نمی‌کند. Service Worker فقط HTML/CSS/JS/Manifest/Icon عمومی را Cache می‌کند و مسیرهای `/api`، `/sub`، `/healthz`، `/connect` و `/e…` را کنار می‌گذارد.

## ساخت Smart Pool

1. در داشبورد Endpointهای متعلق به همین Worker را انتخاب کنید.
2. گزینه Anycast را برای افزودن کاندیدهای رسمی Cloudflare روشن بگذارید.
3. گزینه **Smart Pool نامحدود زمانی** را روشن کنید.
4. Rotation را روی ۱ تا ۶۰ دقیقه قرار دهید؛ مقدار پیش‌فرض ۱ دقیقه است.
5. تعداد مسیر فعال را تعیین کنید. حالت MAX Heavy عدد ۲۰۰ و پنج Iron Profile را انتخاب می‌کند.
6. «ساخت Smart Subscription» را بزنید.

Smart Pool پاسخ نامتناهی تولید نمی‌کند. در هر دریافت، یک پنجره حداکثر ۲۰۰ مسیره می‌سازد و در دوره بعد ترتیب و اتصال Anycast را تغییر می‌دهد. این طراحی از هنگ یا Crash کلاینت جلوگیری می‌کند.

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

## چرا خود PWA مستقیماً VPN نمی‌شود؟

مرورگر به PWA مجوز Android `VpnService` یا iOS Network Extension نمی‌دهد. ساخت یک VPN Native نیازمند پروژه جداگانه Android/iOS، هسته پروتکل ممیزی‌شده، امضای برنامه و مجوزهای Store است. AMINNOVA به‌جای ادعای اتصال غیرواقعی، لینک استاندارد برای کلاینت‌های معتبر تولید می‌کند.

## پایداری

هیچ IP، Worker یا ISP بدون قطعی تضمین نمی‌شود. برای کاهش ریسک:

- از Custom Domain متعلق به خودتان استفاده کنید.
- فایل Backup حساس را خارج از Cloudflare و داخل فضای ذخیره‌سازی رمزگذاری‌شده نگه دارید.
- Deploy دوم در حساب مستقل داشته باشید.
- DNS Failover را بیرون از حساب Worker پیکربندی کنید.
- Endpointها و نتیجه WSS را از شبکه واقعی کاربر تست کنید.
