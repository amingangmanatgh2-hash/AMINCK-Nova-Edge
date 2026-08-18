/**
 * EDGE PANEL — Capability Manifest.
 *
 * Every entry here corresponds to a feature that is actually implemented in
 * this codebase (proxy, protocol, config builder, store, API, UI, CI, docs).
 * Nothing is aspirational or advertising. The UI shows the total count and
 * lets admins filter/read the list.
 */

export type CapabilityCategory =
  | 'protocol'
  | 'traffic'
  | 'config'
  | 'sub'
  | 'scanner'
  | 'security'
  | 'owner'
  | 'ui'
  | 'deploy'
  | 'settings';

export interface Capability {
  id: string;
  category: CapabilityCategory;
  title: string;
  description: string;
}

const c = (
  category: CapabilityCategory,
  id: string,
  title: string,
  description: string,
): Capability => ({ id, category, title, description });

export const CAPABILITIES: Capability[] = [
  // ----------------------------------------------------------------- protocol
  c('protocol', 'proto-vless', 'پروتکل VLESS', 'پیادهسازی کامل هدر VLESS: نسخه، UUID، Addon، Command، Port و آدرس مقصد.'),
  c('protocol', 'proto-ws', 'حملونقل WebSocket', 'پروکسی VLESS روی WebSocket با مدیریت پیامهای دودویی.'),
  c('protocol', 'proto-tls', 'TLS روی Cloudflare', 'اتصال به مقصد فقط از طریق پورتهای TLS مجاز کلودفلر (443 و پورتهای اختصاصی).'),
  c('protocol', 'proto-ed', 'Early Data', 'پشتیبانی از Early Data clients؛ اولین پیام WS میتواند هدر و داده را با هم داشته باشد.'),
  c('protocol', 'proto-ed4096', 'Early Data تا ۴۰۹۶', 'در پروفایل GOD حداکثر Early Data 4096 بایت در کانفیگ صادر میشود.'),
  c('protocol', 'proto-tcp', 'پروکسی TCP', 'پایپینگ دوطرفه داده بین کلاینت و مقصد TCP.'),
  c('protocol', 'proto-udp-dns', 'UDP فقط برای DNS', 'فرمان UDP فقط با پورت 53 پذیرفته میشود؛ بقیهٔ UDP رد میشود (جلوگیری از Open Proxy).'),
  c('protocol', 'proto-doh-relay', 'DNS از طریق DoH', 'کوئری DNS کلاینت بهصورت RFC 8484 به DNS-over-HTTPS ارسال و پاسخ دوباره به کلاینت برگردانده میشود.'),
  c('protocol', 'proto-doh-failover', 'Failover حلکنندههای DoH', 'در شکست سرویسدهندهٔ اصلی، به ترتیب از DoHهای جایگزین استفاده میشود.'),
  c('protocol', 'proto-dns-alts', 'چند Resolver جایگزین', 'لیست قابل تنظیم DoH جایگزین در تنظیمات پنل.'),
  c('protocol', 'proto-mux-reject', 'جلوگیری از MUX', 'فرمان 0x03 (MUX) صریحاً رد میشود تا رفتار پروکسی قابل پیشبینی بماند.'),
  c('protocol', 'proto-stream-safe', 'پارسر امن جریان', 'پارسر هدر VLESS برای جریانهای ناقص و چندبخشی طراحی شده (need-more).'),
  c('protocol', 'proto-ipv4', 'آدرس IPv4 مقصد', 'پشتیبانی از چارچوب IPv4 در هدر VLESS.'),
  c('protocol', 'proto-ipv6', 'آدرس IPv6 مقصد', 'پشتیبانی از چارچوب IPv6 در هدر VLESS.'),
  c('protocol', 'proto-domain', 'آدرس دامنه مقصد', 'پشتیبانی از نام دامنه با طول تا ۲۵۵ بایت در هدر VLESS.'),
  c('protocol', 'proto-tcp-retry', 'TCP connect retry', 'درخواست اتصال TCP بر اساس preset با retry اجرا میشود.'),
  c('protocol', 'proto-tls-sni', 'SNI واقعی', 'SNI و Host فقط از دامنهٔ واقعی که کلاینت به Worker متصل شده ساخته میشود؛ بدون SNI جعلی و بدون دامنهٔ ثالث.'),
  c('protocol', 'proto-no-smtp', 'مسدودسازی پورتهای SMTP', 'پورتهای 25، 465، 587 و 2525 همیشه رد میشوند.'),
  c('protocol', 'proto-no-private', 'مسدودسازی IP خصوصی (Literal)', 'آدرسهای IP میزبان (از جمله Literal) در بازههای خصوصی/رزروشده قبل از اتصال رد میشوند.'),
  c('protocol', 'proto-no-meta', 'مسدودسازی Metadata', 'آدرسهای خصوصی حاصل از رزولوشن دامنه (مثل 169.254.169.254) قبل از اتصال رد میشوند.'),
  c('protocol', 'proto-udp-framing', 'قاببندی پاسخ UDP', 'پاسخ UDP/DNS با پیشوند ۲ بایتی طول طبق پروتکل VLESS ارسال میشود.'),
  c('protocol', 'proto-conn-cap', 'سقف اتصال همزمان', 'سقف مستقل اتصالات WebSocket برای هر مشترک در Backend اعمال میشود.'),
  c('protocol', 'proto-ip-literal-parse', 'تشخیص IPهای یکتا', 'تشخیص صحیح آدرسهای IPv4 و IPv6 literal و IPv4-mapped برای مسدودسازی.'),
  c('protocol', 'proto-path-binding', 'مسیرهای اختصاصی هر مشترک', 'هر مشترک مسیرهای URL منحصربهفرد دارد و فقط با آنها قابل اتصال است.'),
  c('protocol', 'proto-uuid-auth', 'احراز با UUID واگذارشده', 'اتصال WS فقط با UUID فعال عضو پذیرفته میشود.'),
  c('protocol', 'proto-active-check', 'بررسی فعال بودن مشترک در اتصال', 'مشترک غیرفعال نمیتواند WebSocket برقرار کند.'),
  c('protocol', 'proto-expiry-check', 'بررسی انقضای اشتراک', 'پس از اتمام زمان، اتصالهای جدید رد میشوند.'),
  c('protocol', 'proto-tls-port-check', 'بررسی پورت TLS مجاز', 'پورت مقصد باید در فهرست پورتهای TLS مجاز کلودفلر باشد.'),
  c('protocol', 'proto-ws-ping', 'کنترل دسترسی WebSocket', 'پذیرش یا رد دسترسی در مرحلهٔ WebSocket بهدور از رقابت انجام میشود (آگاهی از سقف همزمان).'),
  c('protocol', 'proto-close-ws', 'بستن تمیز اتصال', 'بستن صحیح WebSocket در پایان جریان و آزاد کردن شمارندهٔ نشستها.'),
  c('protocol', 'proto-host-validation', 'اعتبارسنجی Host اتصال', 'Host هدر کلاینت با مسیر مشترک هماهنگ است؛ دامنهها فقط دامنههای همین Worker.'),
  // --------------------------------------------------------------- traffic
  c('traffic', 'tr-usage', 'شمارش تقریبی مصرف', 'ترافیک هر مشترک بهصورت تقریبی (بالا/پایین) شمارش و در DO ذخیره میشود.'),
  c('traffic', 'tr-session-count', 'شمارش نشستها', 'تعداد نشستهای WebSocket فعال هر مشترک در لحظه محاسبه میشود.'),
  c('traffic', 'tr-cap-bytes', 'سقف حجم', 'اعمال محدودیت حجم؛ مازاد بر سقف، اتصال جدید بسته میشود.'),
  c('traffic', 'tr-remaining', 'نمایش حجم باقیمانده', 'محاسبه و نمایش حجم باقیمانده در پنل و منوی مشترک.'),
  c('traffic', 'tr-reset-usage', 'ریست مصرف', 'یککلیکه صفر شدن حجم مصرفی مشترک (Audit ثبت میشود).'),
  c('traffic', 'tr-reset-conn', 'ریست اتصال', 'صفر شدن شمارندهٔ اتصال/نشست مشترک.'),
  c('traffic', 'tr-last-seen', 'آخرین اتصال', 'ثبت و نمایش زمان آخرین اتصال هر مشترک.'),
  c('traffic', 'tr-unlimited-bytes', 'حجم نامحدود', 'مقدار صفر در Backend مساوی حجم نامحدود است و به مقدار پیشفرض تبدیل نمیشود.'),
  c('traffic', 'tr-unlimited-time', 'زمان نامحدود', 'صفر = بدون انقضا؛ هیچ تبدیل خودکار به مقدار پیشفرض وجود ندارد.'),
  c('traffic', 'tr-unlimited-conn', 'اتصال نامحدود', 'صفر = بدون سقف نشستن؛ در UI با دکمهٔ ∞ انتخاب میشود.'),
  c('traffic', 'tr-limit-bytes', 'محدودیت حجم گیگابایت', 'محدوده حجم بر حسب بایت از فرم گیگابایت در UI.'),
  c('traffic', 'tr-limit-time', 'محدودیت زمان', 'محدودهٔ زمانی بر حسب روز در فرم و تبدیل به تامپ استامپ.'),
  c('traffic', 'tr-traffic-stats', 'آمار کلی مصرف', 'مصرف کل ترافیک در داشبورد.'),
  c('traffic', 'tr-active-users', 'شمارش کاربران فعال', 'آمار کاربران فعال/غیرفعال در داشبورد.'),
  // ---------------------------------------------------------------- config
  c('config', 'cfg-2xx', 'بازسازی تا ۲۰۰ مسیر', 'هر اشتراک میتواند ۱ تا ۲۰۰ مسیر داشته باشد.'),
  c('config', 'cfg-2-path', 'انتخاب تعداد مسیر', 'تعداد مسیر قابل انتخاب از ۱ تا ۲۰۰ در سازندهٔ کانفیگ و ساخت اتومات.'),
  c('config', 'cfg-endpoints', 'تنوع کنترلشدهٔ Endpoint', 'فقط از Endpointهای تعریفشده در تنظیمات (حداکثر ۵۰) برای مسیرها استفاده میشود.'),
  c('config', 'cfg-ports', 'پورتهای TLS مجاز کلودفلر', 'انتخاب پورت از فهرست پورتهای TLS کلودفلر (پیشفرض ۴۴۳ برای workers.dev).'),
  c('config', 'cfg-fp', 'Fingerprint مرورگرها', 'پشتیبانی از Chrome، Firefox، Safari، Edge و Random در کانفیگهای خروجی.'),
  c('config', 'cfg-template', 'قالب نام کانفیگ', 'قالب عمومی نام کانفیگ با متغیرهای {brand} {app} {user} {profile} {index} {endpoint} {port}.'),
  c('config', 'cfg-brand', 'برند در نامها', 'برند «AMINCK GOD Edition» در نام پیشفرض کانفیگها و عنوان Subscription لحاظ میشود.'),
  c('config', 'cfg-custom-name', 'نام کانفیگ اختصاصی مشترک', 'هر مشترک میتواند قالب نام اختصاصی داشته باشد.'),
  c('config', 'cfg-v2ray-b64', 'خروجی V2Ray Base64', 'لیست لینکهای VLESS با Encode Base64 برای Import در اپها.'),
  c('config', 'cfg-raw', 'خروجی Raw VLESS URI', 'لینکهای VLESS خام بههمراه fragment نامدار در یک بلوک متنی.'),
  c('config', 'cfg-clash', 'خروجی Clash Meta YAML', 'کانفیگ کامل Clash Meta با پروکسیهای VLESS-WS-TLS.'),
  c('config', 'cfg-singbox', 'خروجی sing-box JSON', 'کانفیگ sing-box با TUN، Mixed، DoH و روتر.'),
  c('config', 'cfg-gauto', 'گروه NOVA-AUTO', 'گروه url-test با health-check و مختصات خودکار در خروجی Clash.'),
  c('config', 'cfg-gfallback', 'گروه NOVA-FALLBACK', 'گروه fallback در خروجی Clash برای تعویض مسیر خراب.'),
  c('config', 'cfg-gbalance', 'گروه NOVA-BALANCE', 'گروه load-balance در خروجی Clash برای پخش بار.'),
  c('config', 'cfg-gsmart', 'گروه NOVA-SMART', 'Selector اصلی که به کاربر اجازهٔ انتخاب بین گروهها و ذخیرهٔ انتخاب میدهد (cache-file در Clash).'),
  c('config', 'cfg-unified-delay', 'unified-delay در Clash', 'فعالسازی unified-delay در خروجی Clash Meta.'),
  c('config', 'cfg-tcp-concurrent', 'tcp-concurrent در Clash', 'فعالسازی tcp-concurrent روی پروکسیها در پروفایلهای Turbo و GOD.'),
  c('config', 'cfg-health-interval', 'Health Check ادواری', 'بازهٔ الفتح پریودیک گروهها در خروجی Clash از پروفایل سرعت.'),
  c('config', 'cfg-tolerance', 'Tolerance قابل تنظیم', 'Tolerance گروه url-test از پروفایل سرعت گرفته میشود.'),
  c('config', 'cfg-health-url', 'Health URL قابل تنظیم', 'آدرس Health Check در خروجیها از تنظیمات پنل؛ خالی = بهصورت پیشرفته از Endpoint اول.'),
  c('config', 'cfg-sing-urltest', 'URLTest در sing-box', 'خروجی sing-box با اورتست برای انتخاب بهترین مسیر.'),
  c('config', 'cfg-sing-selector', 'Selector در sing-box', 'Selector با قابلیت انتخاب دستی در sing-box.'),
  c('config', 'cfg-sing-tun', 'TUN inbound در sing-box', 'ورودی TUN با auto_route در خروجی sing-box.'),
  c('config', 'cfg-sing-mixed', 'Mixed inbound در sing-box', 'ورودی Mixed (HTTP+SOCKS) در خروجی sing-box.'),
  c('config', 'cfg-sing-doh', 'DoH در sing-box', 'سرورهای DNS-over-HTTPS در خروجی sing-box.'),
  c('config', 'cfg-sing-direct', 'Direct برای شبکه خصوصی', 'قوانین مسیریابی به سمت «direct» برای IPهای خصوصی در sing-box.'),
  c('config', 'cfg-sing-smart', 'مسیریاب نهایی هوشمند', 'Rule نهایی MATCH به سمت Selector هوشمند در sing-box.'),
  c('config', 'cfg-naming-unique', 'نامهای یکتا در خروجی', 'بهکمک متغیر {index} همهٔ نامها در خروجیها یکتا هستند.'),
  c('config', 'cfg-encoded-name', 'پیوندنام در URI', 'نام کانفیگ بهصورت URL-encoded در Fragment لینک VLESS درج میشود.'),
  // ------------------------------------------------------------------- sub
  c('sub', 'sub-link', 'لینک Subscription مستقل', 'هر مشترک یک لینک /sub با Token مستقل دارد.'),
  c('sub', 'sub-token-indep', 'UUID و Token مستقل', 'UUID (برای پراکسی) و Token (برای ساب) دو مقدار کاملاً مستقل هستند.'),
  c('sub', 'sub-userinfo', 'هدر subscription-userinfo', 'خروجی ساببش شامل upload/download/total/expire در هدر است.'),
  c('sub', 'sub-interval', 'فاصلهٔ Update قابل تنظیم', 'هدر profile-update-interval از تنظیمات پنل ساخته میشود.'),
  c('sub', 'sub-support-url', 'هدر support-url', 'لینک پشتیبانی به کلاینتها ارسال میشود.'),
  c('sub', 'sub-v2ray', 'ساببش فرمت V2Ray', 'خروجی ساببش با قالب V2Ray (Base64) برای V2RayNG/MahsaNG/V2Box/NapsternetV.'),
  c('sub', 'sub-clash', 'ساببش فرمت Clash', 'ساببش با ?format=clash برای Clash Meta.'),
  c('sub', 'sub-singbox', 'ساببش فرمت sing-box', 'ساببش با ?format=singbox برای sing-box.'),
  c('sub', 'sub-raw', 'ساببش خام', 'ساببش با ?format=raw برای نمایش مستقیم لینکها.'),
  c('sub', 'sub-multi-route', 'چند مسیر در یک اشتراک', 'یک Subscription میتواند چند مسیر را مدیریت کند.'),
  c('sub', 'sub-last-fetch', 'آخرین دریافت ساببش', 'زمان آخرین درخواست ساببش هر مشترک ثبت میشود.'),
  c('sub', 'sub-user-agent', 'تشخیص کلاینت', 'User-Agent درخواست ساببش در لاگ ثبت میشود (بدون ذخیرهٔ دادههای شخصی).'),
  c('sub', 'sub-disposition', 'فایل ساببش', 'هدر Content-Disposition با نام ساببش بههمراه نوع فایل مناسب.'),
  // -------------------------------------------------------------- scanner
  c('scanner', 'scan-tcp', 'اسکن TCP از Edge', 'اندازهگیری TCP handshake latency از Edge کلودفلر با cloudflare:sockets.'),
  c('scanner', 'scan-tls', 'اندازهگیری دستدهی TLS', 'زمان دستدهی TLS در پراب اندازهگیری و ذخیره میشود.'),
  c('scanner', 'scan-timeout', 'Timeout قابل تنظیم', 'مهلت هر اسکن از پروفایل سرعت گرفته میشود.'),
  c('scanner', 'scan-max50', 'حداکثر ۵۰ Endpoint', 'پنل اسکن حداکثر ۵۰ Endpoint را مدیریت میکند.'),
  c('scanner', 'scan-sort', 'مرتبسازی سالمها', 'لیست Endpointهای سالم با کمترین تأخیر مرتب میشود.'),
  c('scanner', 'scan-save', 'ذخیرهٔ نتایج', 'نتایج پرچکلیتها (latency/status) در تنظیمات ذخیره میشود.'),
  c('scanner', 'scan-cron', 'Cron هر ۳۰ دقیقه', 'تست خودکار همهٔ Endpointها با Crons برنامهرون بهصورت خودکار.'),
  c('scanner', 'scan-note', 'توضیح صادقانهٔ اندازهگیری', 'در پنل توضیح داده میشود که عدد نشاندادهشده پینگ دستگاه کاربر نیست.'),
  c('scanner', 'scan-probe-now', 'Probe دستی', 'دکمهٔ «Probe اکنون» برای اسکن فوری.'),
  c('scanner', 'scan-add', 'افزودن Endpoint', 'افزودن Endpoint با Host و Port دلخواه (با اعتبارسنجی).'),
  c('scanner', 'scan-remove', 'حذف Endpoint', 'حذف Endpoint از فهرست همراه با نتایجش.'),
  c('scanner', 'scan-auto-build', 'استفادهٔ سریع از بهترین Endpointها', 'ساخت اتومات از نتایج اسکن برای ترتیب مسیرها استفاده میکند.'),
  // ------------------------------------------------------------- security
  c('security', 'sec-hmac-session', 'Session با HMAC-SHA256', 'شناسهٔ Session با HMAC-SHA256(SESSION_SECRET) امضا میشود.'),
  c('security', 'sec-cookie-httponly', 'HttpOnly', 'کوکی نشست با پرچم HttpOnly صادر میشود.'),
  c('security', 'sec-cookie-secure', 'Secure', 'کوکی نشست فقط روی HTTPS ارسال میشود.'),
  c('security', 'sec-cookie-samesite', 'SameSite=Strict', 'کوکی نشست با SameSite=Strict صادر میشود.'),
  c('security', 'sec-session-expiry', 'انقضای نشست', 'نشستها Max-Age دارند و پس از انقضا باطل میشوند.'),
  c('security', 'sec-session-invalidate', 'باطلسازی در یک درخواست', 'نشست ادمین غیرفعالشده در اولین درخواست بعدی باطل میشود.'),
  c('security', 'sec-login-delay', 'Login delay', 'پس از ورود ناموفق، تأخیر اجباری قبل از پاسخ اعمال میشود.'),
  c('security', 'sec-login-rate', 'محدودکردن تلاش ورود', 'پس از چند شکست متوالی، ورود برای مدتی قفل میشود.'),
  c('security', 'sec-sameorigin', 'بررسی Same-Origin', 'درخواستهای تغییردهنده با هدر Origin ناهمخواند رد میشوند (anti-CSRF).'),
  c('security', 'sec-csp', 'CSP', 'Content-Security-Policy با منبع خودی برای اسکریپت و استایل.'),
  c('security', 'sec-xframe', 'X-Frame-Options', 'هدر DENY برای جلوگیری از Frame.'),
  c('security', 'sec-referrer', 'Referrer-Policy', 'ارسال نکردن Referrer به خارج (no-referrer).'),
  c('security', 'sec-permissions', 'Permissions-Policy', 'غیرفعالکردن دوربین، میکروفن و موقعیت در هدر.'),
  c('security', 'sec-nosniff', 'X-Content-Type-Options', 'nosniff برای همهٔ پاسخها.'),
  c('security', 'sec-no-open-proxy', 'جلوگیری از Open Proxy', 'فقط مشترکهای احرازهویتشده و با route مجاز میتوانند پروکسی شوند.'),
  c('security', 'sec-private-block', 'بلاک dest خصوصی برای همه', 'هم TCP و هم UDP، مسیرهای خصوصی/رزروشده رد میشوند.'),
  c('security', 'sec-udp-dns-only', 'UDP فقط ۵۳', 'بستهٔ UDP با پورت غیر ۵۳ رد میشود.'),
  c('security', 'sec-token-random', 'Token تصادفی', 'Token و شناسهها با CSPRNG (crypto.getRandomValues) ساخته میشوند.'),
  c('security', 'sec-secret-not-in-git', 'بدون Secret در Git', '.dev.vars و فایلهای مشابه در .gitignore مسدود شدهاند.'),
  c('security', 'sec-healthz', 'اتصال Health عمومی', 'اندپوینت /healthz بدون احراز و با CORS برای Checkهای بیرونی.'),
  c('security', 'sec-no-3rd-sni', 'بدون SNI شخص ثالث', 'SNI و Host فقط دامنهٔ واقعی Worker است؛ بدون دامنهٔ جعلی.'),
  c('security', 'sec-time-safe', 'مقایسهٔ زمان-ایمن hash', 'مقایسهٔ HMAC و Password Hash بدون وابستگی به زمان اجرا.'),
  // ---------------------------------------------------------------- owner
  c('owner', 'own-login', 'ورود مالک با ADMIN_PASSWORD', 'مالک (AMINCK) فقط با ADMIN_PASSWORD وارد میشود.'),
  c('owner', 'own-username', 'نام کاربری مالک', 'نام کاربری مالک «AMINCK» است و ورود با نام خالی نیز پذیرفته میشود.'),
  c('owner', 'own-all-perm', 'همهٔ Permissionها برای مالک', 'مالک هر ده Permission را به صورت سخت در کد دارد.'),
  c('owner', 'own-no-delete', 'مالک غیرقابل حذف', 'محافظت Backend: حذف/غیرفعالکردن مالک همیشه با خطا رد میشود.'),
  c('owner', 'own-role-fixed', 'نقش مالک ثابت', 'نقش مالک (owner) قابل تغییر نیست.'),
  c('owner', 'own-power-fixed', 'قدرت مالک ثابت', 'سطح قدرت مالک همیشه ultra است و قابل کاهش نیست.'),
  c('owner', 'own-seed', 'پیادهسازی خودکار مالک', 'ریکورد مالک در اولین اجرای Durable Object خودکار ساخته میشود.'),
  c('owner', 'adm-list', 'فهرست ادمینها', 'نمایش همهٔ ادمینها با نقش، اگر فعال، آخرین ورود.'),
  c('owner', 'adm-create', 'ساخت ادمین', 'ایجاد حساب کارمندان با Username/Password مستقل.'),
  c('owner', 'adm-indep-pass', 'رمز مستقل هر ادمین', 'رمز هر ادمین مستقل ذخیره و بررسی میشود.'),
  c('owner', 'adm-pbkdf2', 'PBKDF2-SHA256', 'رمز ادمینها با PBKDF2-SHA256 (۲۱۰هزار دور) قوی ذخیره میشود.'),
  c('owner', 'adm-salt', 'Salt تصادفی ۱۶ بایت', 'برای هر ادمین Salt تصادفی تولید میشود.'),
  c('owner', 'adm-minpass', 'رمز حداقل ۱۰ کاراکتر', 'اعمال min برای ساخت و تغییر رمز ادمینها.'),
  c('owner', 'adm-no-hash-api', 'عدم نمایش hash در API', 'فیلد hash هرگز در پاسخهای API نمیآید.'),
  c('owner', 'adm-no-salt-api', 'عدم نمایش salt در API', 'فیلد salt هرگز در پاسخهای API نمیآید.'),
  c('owner', 'adm-pass-change', 'تعویض رمز ادمین', 'GetAdmin میتواند رمز خود یا دیگران (با مجوز) را تغییر دهد.'),
  c('owner', 'adm-revoke', 'قطع فوری دسترسی', 'با revoke شدن، نشستها فوراً باطل و اتصال ادمین قطع میشود.'),
  c('owner', 'adm-restore', 'وصل مجدد دسترسی', 'ریکر ادمین بدون تغییر رمز قابل بازگرداندن است.'),
  c('owner', 'adm-delete', 'حذف ادمین', 'حذف ادمین همراه با پاککردن همهٔ نشستهایش.'),
  c('owner', 'adm-last-login', 'نمایش آخرین ورود', 'هر ورود موفق، lastLoginAt ادمین را بهروز میکند.'),
  c('owner', 'role-admin', 'نقش admin', 'admins کامل بهجز مدیریت تنظیمات و ادمینها.'),
  c('owner', 'role-operator', 'نقش operator', 'مدیریت کاربران بدون حذف و بدون تنظیمات و ادمینها.'),
  c('owner', 'role-support', 'نقش support', 'فقط مشاهدهٔ کاربران، ساخت کانفیگ و مشاهدهٔ لاگ.'),
  c('owner', 'perm-users-view', 'Permission: users:view', 'دیدن لیست و جزئیات کاربران.'),
  c('owner', 'perm-users-create', 'Permission: users:create', 'ایجا کاربر جدید.'),
  c('owner', 'perm-users-edit', 'Permission: users:edit', 'ویرایش کاربر، ریستها، چرخش کلید.'),
  c('owner', 'perm-users-delete', 'Permission: users:delete', 'حذف کاربر — فقط نقش صاحب admin.'),
  c('owner', 'perm-configs', 'Permission: configs:build', 'ساخت کانفیگ برای هر کاربر.'),
  c('owner', 'perm-settings', 'Permission: settings:manage', 'ویرایش تنظیمات پنل — فقط owner.'),
  c('owner', 'perm-probe', 'Permission: endpoints:probe', 'اجرای Probe و مدیریت Endpointها.'),
  c('owner', 'perm-backup', 'Permission: backup:export', 'دریافت بکومپ JSON کامل.'),
  c('owner', 'perm-admins', 'Permission: admins:manage', 'مدیریت ادمینها — فقط owner.'),
  c('owner', 'perm-audit', 'Permission: audit:view', 'مشاهدهٔ لاگ حوادث.'),
  c('owner', 'power-limited', 'سطح قدرت Limited', 'حداکثر ۵ مسیر برای هر کانفیگ — همیشه در Backend اعمال میشود.'),
  c('owner', 'power-normal', 'سطح قدرت Normal', 'حداکثر ۳۰ مسیر در Backend.'),
  c('owner', 'power-strong', 'سطح قدرت Strong', 'حداکثر ۸۰ مسیر در Backend.'),
  c('owner', 'power-ultra', 'سطح قدرت Ultra', 'حداکثر ۲۰۰ مسیر در Backend.'),
  c('owner', 'power-backend', 'قدرت فقط در Backend', 'حتی با درخواست مستقیم API هم محدودیت قدرت اعمال میشود (تستشده).'),
  c('owner', 'power-ui-hint', 'نمایش قدرت در UI', 'قدرت ادمین در پاسخ /api/me و لندینگ API نمایش داده میشود.'),
  c('owner', 'perm-btn-hide', 'مخفی کردن دکمههای بدون مجوز', 'دکمهٔ Hot-Update فقط با settings:manage روی لندینگ دیده میشود.'),
  c('owner', 'perm-api-enforce', 'بررسی Permission در تمام APIها', 'تمام اندپوینتهای API سطح دسترسی را در Backend چک میکنند.'),
  c('owner', 'own-audit-login', 'لاگ ورود مالک/ادمین', 'هر ورود/خروج موفق در لاگ حوادث ثبت میشود.'),
  c('owner', 'own-audit-fail', 'لاگ ورود ناموفق', 'شکستهای ورود با یوزرنیم، IP و زمان ثبت میشوند.'),
  c('owner', 'own-audit-adm-create', 'لاگ ساخت ادمین', 'ساخت ادمین با actor و جزئیات ثبت میشود.'),
  c('owner', 'own-audit-adm-delete', 'لاگ حذف ادمین', 'حذف ادمین در لاگ حوادث ثبت میشود.'),
  c('owner', 'own-audit-revoke', 'لاگ قطع دسترسی', 'عملیات revoke با جزئیات در لاگ ثبت میشود.'),
  c('owner', 'own-audit-restore', 'لاگ وصل مجدد', 'بازگرداندن دسترسی ادمین ثبت میشود.'),
  c('owner', 'own-audit-pass', 'لاگ تغییر رمز', 'تغییر رمز ادمین ثبت میشود (بدون نمایش خود رمز).'),
  c('owner', 'own-audit-actor', 'Actor در لاگها', 'نام کاربری فرد اقدامکننده به همراه هر رویداد نگهداری میشود.'),
  c('owner', 'own-audit-details', 'جزئیات رویدادها', 'هر رویداد دارای Action, Target, Details, Timestamp است.'),
  c('owner', 'own-audit-200', 'نمایش ۲۰۰+ رویداد آخر', 'لاگ حوادث حداقل ۲۰۰ مورد آخر را در UI نشان میدهد.'),
  c('owner', 'owner-cannot-harm', 'محافظت از مالک در برابر خود', 'مالک نمیتواند خودش، رمز خود را از طریق مدیریت ادمین کم کند.'),
  c('owner', 'adm-session-invalidation', 'Invalidation کامل نشستها', 'ناسازگار شدن و پاکشدن همهٔ نشستهای ادمین در revoke/delete.'),
  c('owner', 'adm-unique-username', 'یوزرنیم یکتا', 'تکرارفناپذیری یوزرنیم ادمینها در Backend.'),
  // ------------------------------------------------------------------- UI
  c('ui', 'ui-fa', 'رابط کاملاً فارسی', 'لندینگ API و پیامهای خطا/پاسخ به فارسی و RTL هستند.'),
  c('ui', 'ui-rtl', 'چیدمان RTL', 'کل پنل راستبهچپ با dir=rtl.'),
  c('ui', 'ui-dark-light', 'Dark / Light Mode', 'تغییر پوستهٔ تاریک/روشن با ذخیرهٔ انتخاب.'),
  c('ui', 'ui-responsive', 'واکنشگرا', 'چیدمان تطبیقی موبایل و دسکتاپ.'),
  c('ui', 'ui-dashboard', 'داشبورد آمار', 'آمار رقمی از مسیر GET /api/stats (کاربران، نشستها، مصرف، ادمینها).'),
  c('ui', 'ui-sidebar', 'منوی کنار', 'لندینگ API-only جایگزین سایدبار کامل شده؛ ناوبری از مستندات API.'),
  c('ui', 'ui-users', 'صفحهٔ کاربران', 'مدیریت کاربران از API: /api/users و /api/user-create/update/delete.'),
  c('ui', 'ui-search', 'جستوجوی کاربران', 'جستو بر اساس نام، UUID و Token.'),
  c('ui', 'ui-config-page', 'صفحهٔ کانفیگ آهنین', 'ساخت کانفیگ EDGE PANEL از /api/config-build با چهار فرمت خروجی.'),
  c('ui', 'ui-scanner', 'صفحهٔ Scanner', 'Probe و Endpointها از /api/probe و /api/endpoints مدیریت میشوند.'),
  c('ui', 'ui-settings', 'صفحهٔ تنظیمات', 'تنظیمات brand/antiDetect/fakeDomains/tlsPorts از /api/settings.'),
  c('ui', 'ui-install', 'صفحهٔ نصب', 'لندینگ شامل نمونه Login و Deploy و راهنمای secretهاست.'),
  c('ui', 'ui-admins', 'صفحهٔ مدیریت ادمین', 'مدیریت ادمینها فقط از API /api/admins/* با نقش و قدرت.'),
  c('ui', 'ui-audit', 'صفحهٔ Audit', 'لاگ حوادث از /api/audit با Actor/Action/Target قابل دریافت است.'),
  c('ui', 'ui-capabilities', 'صفحهٔ قابلیتها', 'مانیفست قابلیتها از /api/capabilities خوانده میشود.'),
  c('ui', 'ui-auto-modal', 'Modal ساخت ساب اتومات', 'ساخت ساب اتومات از /api/auto-build پس از Probe.'),
  c('ui', 'ui-user-modal', 'Modal ویرایش کاربر', 'ویرایش کاربر از /api/user-update با همهٔ فیلدها.'),
  c('ui', 'ui-toast', 'Toast موفقیت و خطا', 'اعلانهای موفقیت/خطای خودکار ناپدیدشونده.'),
  c('ui', 'ui-header', 'هدر اطلاعرسانی', 'لندینگ API نقش/قدرت نشست را در صورت ورود نشان میدهد.'),
  c('ui', 'ui-infinity', 'دکمههای ∞', 'کنار هر ورودی عددی (زمان، حجم، اتصال) که مقدار ۰ یعنی نامحدود.'),
  c('ui', 'ui-progress', 'Progress bar در ساخت', 'نوار پیشرفت برای ساخت ساب اتوماتیک.'),
  c('ui', 'ui-copy', 'دکمهٔ کپی', 'کپی لینکها و کانفیگها با کلیک.'),
  c('ui', 'ui-download', 'دانلود مستقیم فایل', 'دانلود خروجی کانفیگ بهعنوان فایل.'),
  c('ui', 'ui-error-safe', 'مدیریت خطا بدون کرش', 'خطاهای API به Toast تبدیل میشوند و رابط دستنخورده میماند.'),
  c('ui', 'ui-session-expire', 'ورود مجدد خودکار', 'در پایان Session فرم ورود خودکار نشان داده میشود.'),
  // ------------------------------------------------------------- settings
  c('settings', 'st-title', 'عنوان پنل', 'قابل تنظیم از تنظیمات.'),
  c('settings', 'st-brand', 'برند مالک', 'پیشفرض برند AMINCK GOD Edition در عنوانها و نام کانفیگها.'),
  c('settings', 'st-support', 'لینک پشتیبانی', 'محل نمایش در پنل و هدر ساببش.'),
  c('settings', 'st-doh', 'DoH اصلی', 'شروع اول برای رزولوشن و DNS.'),
  c('settings', 'st-doh-alt', 'DoHهای جایگزین', 'لیست جایگزین با failover.'),
  c('settings', 'st-health-url', 'Health URL', 'آدرس سلامت برای کانفیگهای خروجی.'),
  c('settings', 'st-template', 'قالب نام', 'قالب عمومی نام کانفیگ.'),
  c('settings', 'st-default-paths', 'تعداد پیشفرض مسیر', 'پیشفرض ساخت برای کاربران جدید.'),
  c('settings', 'st-update-interval', 'بازهٔ Update', 'فاصلهٔ بهروزرسانی ساببش به ساعت.'),
  c('settings', 'st-fingerprint', 'Fingerprint پیشفرض', 'برای کانفیگهای جدید.'),
  c('settings', 'st-profile', 'Profile Mode پیشفرض', 'Auto / Fallback / Load-Balance.'),
  c('settings', 'st-speed', 'Speed Preset پیشفرض', 'Stable / Balanced / Turbo / GOD (پیشفرض GOD با interval/tolerance ۵۰ و retry ۴).'),
  c('settings', 'st-tls-ports', 'پورتهای TLS', 'فهرست پورتهای مجاز خروجی.'),
  c('settings', 'st-probe-results', 'نتایج Probe در تنضیمات', 'نمایش نتایج و آخرین زمان پرحب در تنظیمات/اسکنر.'),
  // -------------------------------------------------------------- deploy
  c('deploy', 'd-deploy-link', 'لینک Deploy به Cloudflare', 'لینک رسمی Deploy در README و صفحهٔ نصب.'),
  c('deploy', 'd-do-auto', 'Provision خودکار Durable Object', 'بدون هیچ D1/KV دستی؛ با migration خودکار ساخته میشود.'),
  c('deploy', 'd-cron', 'Cron پیکربندیشده', 'اجرای auto-probe هر ۳۰ دقیقه با Crons.'),
  c('deploy', 'd-observability', 'Observability', 'فعالسازی در wrangler.jsonc.'),
  c('deploy', 'd-dev-vars', 'نمونهٔ .dev.vars', 'قالب در مخزن با ADMIN_PASSWORD و SESSION_SECRET.'),
  c('deploy', 'd-bindings-docs', 'مستندات Bindings در package.json', 'شرح Bindingها در توضیحات package.'),
  c('deploy', 'd-ci', 'CI در GitHub Actions', 'تست، نوعچک و اسکن UI در CI.'),
  c('deploy', 'd-deploy-action', 'Deploy خودکار', 'Workflow deploy بعد از ورود به main (با wrangler-action).'),
  c('deploy', 'd-no-api-token', 'عدم دریافت API Token کلودفلر', 'هیچجای پنل Token کلودفلر دریافت/ذخیره نمیشود.'),
  c('deploy', 'd-healthz', 'Health عمومی', '/healthz برای مانیتورینگ بیرونی.'),
  // --------------------------------------------------------- edge panel extras
  c('config', 'cfg-edge-brand', 'برند AMINCK GOD Edition', 'همهٔ کانفیگها و سابها با برند EDGE PANEL نامگذاری میشوند.'),
  c('config', 'cfg-anti-padding', 'Path Padding', 'پدینگ تصادفی query روی path برای پراکندگی اثر انگشت DPI.'),
  c('config', 'cfg-anti-jitter', 'Path Jitter', 'طول slug مسیر بین ۶ تا ۱۲ کاراکتر متغیر است.'),
  c('config', 'cfg-anti-fragment', 'TLS Fragment', 'راهنمای fragment در VLESS/Clash/sing-box برای عبور از فیلتر.'),
  c('config', 'cfg-fake-domains', 'دامنههای جعلی نت ملی', 'چرخش Host روی snaap.ir و دامنههای محبوب داخلی.'),
  c('config', 'cfg-multiport', 'انتخاب پورت Zooz/BPB', 'گسترش خروجی روی پورتهای TLS کلودفلر (443/2053/2083/2087/2096/8443).'),
  c('config', 'cfg-god-speed', 'پروفایل سرعت GOD', 'interval ۵۰، tolerance ۵۰، retry ۴، earlyData ۴۰۹۶ و tcp-concurrent.'),
  c('config', 'cfg-iron-local', 'کانفیگ آهنین لوکال', 'پروفایل GOD با endpointهای سالم محلی و anti-detect حداکثری برای کار در نت ملی.'),
  c('config', 'cfg-hot-update', 'آپدیت یککلیکی', 'POST /api/hot-update مسیرها را بدون قطعی دامنه بازسازی میکند.'),
  c('ui', 'ui-api-only', 'حذف پنل ادمین کامل', 'مدیریت فقط از JSON API؛ لندینگ توضیحی جایگزین UI سنگین شده است.'),
  c('security', 'sec-api-only-surface', 'سطح حمله کوچکتر UI', 'بدون فرمهای سنگین ادمین در مرورگر؛ Same-Origin روی همهٔ mutating APIها.'),
];

export function totalCapabilities(): number {
  return CAPABILITIES.length;
}

/** Count of capabilities covering owner/administrator management. */
export function ownerCapabilitiesCount(): number {
  return CAPABILITIES.filter((x) => x.category === 'owner').length;
}

export function capabilitiesByCategory(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const cap of CAPABILITIES) out[cap.category] = (out[cap.category] ?? 0) + 1;
  return out;
}