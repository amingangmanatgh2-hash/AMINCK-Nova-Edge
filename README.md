# ✦ نُوا گارد — NOVA GUARD — اپ جدا خیلی خفن 🔥 بات جدا، سلف جدا، یه ورکر

**بات جدا، اپ جدا، سلف جدا ولی با یه ورکر خیلی خفن ران میشه 🔥**

- **اپ به ربات وصله:** از پیوی ربات `demgram` / `دانلود` / `اپ` بزن → لینک دانلود APK + وب PWA خیلی خفن
- **سلف به ربات وصله:** از پیوی ربات `سلف` بزن → کد ۳۲ کاراکتری → داخل `self/self_client.py` وارد کن

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https%3A%2F%2Fgithub.com%2Famingangmanatgh2-hash%2FAMINCK-Nova-Edge%2Ftree%2Farena%2F01a07081-aminck-nova-edge)

## معماری خیلی خفن — سه چیز جدا ولی یه ورکر 🔥

```
[بات جدا] ─┐
            ├─► Worker (یه ورکر خیلی خفن) ─► /telegram (بات 140 دستور)
[اپ جدا] ──┤         ├─► /demgram/ (PWA خیلی خفن) + /demgram/DemGram.apk
            │         ├─► /api/download (دانلودر خفن 4K + MP3 + پلی‌لیست)
[سلف جدا] ─┘         ├─► /api/config/generate (کانفیگ ساز Reality + Clash + Sing-box + QR)
                     ├─► /api/proxy/list (پروکسی MTProto با پینگ + تست سرعت)
                     └─► /api/self/* (سلف جدا 80+ دستور)
```

- **بات جدا:** مدیریت گروه تلگرام — 140 دستور، پنل اینلاین، قفل همه ۲۴ فیلتر، دوئل تاس واقعی، ضداسپم، خوشامد، دانلودر خفن، کانفیگ ساز خیلی خفن — روی ورکر
- **سلف جدا خیلی خفن:** حساب شخصی خودت — 80+ دستور، مخاطبین هوشمند .contacts .filter .add .addall YES 3s سقف 50، دانلودر خفن یوتیوب 4K + MP3 + پلی‌لیست، کانفیگ ساز خیلی خفن VLESS Reality + Clash + Sing-box + QR، پروکسی با پینگ — فقط از بات فعال میشه، نشست فقط روی دستگاه خودت
- **اپ DemGram جدا خیلی خفن:** کلاینت تلگرام + دانلودر خفن یوتیوب 4K/MP3/پلی‌لیست + اینستا HD + تیک‌تاک بدون واترمارک + کانفیگ ساز خیلی خفن Reality + Clash + Sing-box + QR + پروکسی MTProto با تست سرعت + فونت 15 استایل — از بات دانلود میشه، با یه ورکر ران میشه (PWA + APK بومی)

## نصب روی کلودفلر — یه ورکر برای هر سه — خیلی خفن 🔥

1. دکمه **Deploy to Cloudflare** بالا → فقط `PANEL_PASSWORD` (حداقل ۱۶ کاراکتر) بده
2. Deploy تمام → آدرس ورکر خودت رو باز کن، با رمز وارد شو
3. توکن ربات رو از BotFather بگیر، داخل پنل ثبت کن → اتصال خودکار، وبهوک، منوی دستورها
4. بات رو به گروه اضافه کن، ادمین کن، `پنل` بفرست

**لینک دیپلوی مستقیم خیلی خفن:**
```
https://deploy.workers.cloudflare.com/?url=https://github.com/amingangmanatgh2-hash/AMINCK-Nova-Edge/tree/arena/01a07081-aminck-nova-edge
```

## بات — 140 دستور خیلی خفن 🔥

- مدیریت: پنل اینلاین، قفل لینک/استیکر/..., قفل همه ۲۴ فیلتر، ضداسپم، کپچا، ضدهجوم، حالت شب
- اقتصاد: سکه، الماس کمیاب، روزانه، لیدربرد، دوئل تاس واقعی 🎲 (غیرقابل تقلب سمت سرور)
- **دانلودر خیلی خفن:** `download https://youtube.com/... --mp3 --720p --4k --nowm --playlist` یا `dl` — یوتیوب 4K + MP3 + پلی‌لیست، اینستا HD + استوری + ریلز، تیک‌تاک بدون واترمارک HD + MP3، توییتر HD، ساندکلاد FLAC، فیسبوک HD، تلگرام 2GB
- **کانفیگ ساز خیلی خفن:** `کانفیگ example.com 5` → VLESS Reality با کلید واقعی xtls-rprx-vision + VMess TLS+SNI + SS 3 متد + Trojan Reality + Clash YAML + Sing-box JSON + ساب لینک base64 + QR، `پروکسی 10` → لیست MTProto با پینگ + کشور + تست سرعت + سریع‌ترین، `ساب example.com 4` → ساب لینک ساز خیلی خفن V2Ray + Clash + Sing-box
- فونت ساز 15 استایل، ابزار خفن

## سلف جدا — 80+ دستور خیلی خفن — فقط از بات فعال میشه 🔥

```bash
pip install -r self/requirements.txt

# اکانت اول
python self/self_client.py

# اکانت دوم نامحدود خیلی خفن
python self/self_client.py --session my2

# فقط توکن عوض شود
python self/self_client.py --pair
```

**قابلیت‌های خیلی خفن:**
- **مخاطبین هوشمند خیلی خفن:** `.contacts [فیلتر]` ۵۰ تایی + آنلاین/آفلاین، `.filter نام`، `.find @username`، `.add @username` تکی امن، `.addall confirm` → `.addall YES` با تاخیر ۳ثانیه ضداسپم سقف ۵۰، `.addselect`، `.exportcontacts` JSON
- **گروه خیلی خفن:** `.stats .admins .invite .pin .kick .ban .mute .tagall 50 نفر`
- **دانلودر خیلی خفن:** `.dl لینک --mp3 --720p --4k --nowm --playlist` یوتیوب 4K + MP3 + پلی‌لیست + اینستا HD + تیک‌تاک بدون واترمارک + ساندکلاد FLAC
- **کانفیگ ساز خیلی خفن:** `.config example.com 5` ۵ ست = ۲۰ کانفیگ Reality + Clash + Sing-box، `.vless example.com 3`، `.vmess`، `.ss` ۳ متد، `.trojan`، `.proxy 15` با پینگ + کشور + سریع‌ترین، `.sub example.com 4` ساب لینک خیلی خفن، `.clash`، `.singbox`، `.qr کانفیگ` QR کد
- **متن خیلی خفن:** `.font متن` ۱۵ استایل 🔥💎⚡🌟🎀، `.ai سوال` محلی/ابری
- **اتصال:** پیوی ربات `سلف` → کد ۳۲ کاراکتری → داخل سلف وارد کن — نشست فقط روی دستگاه خودت

## اپ DemGram جدا خیلی خفن — دانلودر + کانفیگ ساز خیلی خفن 🔥

**اپ کاملا جدا از سلف و بات، ولی با یه ورکر خیلی خفن ران میشه و از بات دانلود میشه.**

### قابلیت‌های خیلی خفن:

**📥 دانلودر خیلی خفن:**
- یوتیوب: 144p تا 4K + MP3 128k/320k + M4A + WAV + پلی‌لیست کامل + استخراج صدا + بدون واترمارک
- اینستاگرام: پست/استوری/ریلز/IGTV HD + آلبوم
- تیک‌تاک: بدون واترمارک HD + SD + MP3
- توییتر/X: HD + گیف
- ساندکلاد: MP3/FLAC/WAV/OPUS
- فیسبوک: HD/SD
- تلگرام: فایل بزرگ تا 2GB
- کیفیت انتخابی، پیشرفت دانلود، تاریخچه

**🔐 کانفیگ ساز خیلی خفن:**
- VLESS Reality xtls-rprx-vision با کلید واقعی private/public/shortId + SNI + FP chrome
- VMess TLS+SNI + alpn
- Shadowsocks 3 متد: aes-256-gcm/chacha20-ietf-poly1305/aes-128-gcm
- Trojan Reality + TLS + SNI
- ساب لینک ساز base64 V2Ray
- Clash YAML — Clash / Mihomo / ClashMeta
- Sing-box JSON — NekoBox / SFA / SFM
- QR کد برای هر کانفیگ + دانلود QR + اشتراک
- تعداد 1-20 کانفیگ در هر درخواست
- Reality Keys generator
- وارد کردن کانفیگ + تبدیل فرمت

**🌐 پروکسی خیلی خفن — بخش مخصوص:**
- MTProto با پینگ واقعی 15-350ms
- تست سرعت خفن + مرتب‌سازی بر اساس پینگ
- سریع‌ترین پروکسی + کشور DE/NL/US/TR/FI/SE/IR/GB
- ایموجی 🟢🟡🔴 بر اساس سرعت
- وارد کردن + تبدیل به SOCKS5 + بررسی
- 15 پروکسی در هر درخواست

**👥 مخاطبین هوشمند خیلی خفن:**
- .contacts 50 هوشمند + آنلاین/آفلاین فیلتر
- .filter/.find
- .add تکی امن + YES + تاخیر 3s سقف 50
- انتخاب همه + خروجی JSON + تگ 50 نفر

**🔤 فونت ساز 15 استایل خیلی خفن:**
- Bold, Italic, Mono, ✦, ꧁, •—, ★彡, ✨, 🔥, 💎, ⚡, 🌟, 🎀

**🛠 ابزار خیلی خفن:**
- QR ساز، ترجمه 100+ زبان، حساب پیشرفته، آب‌وهوا، استیکر ساز، AI

### نصب اپ خیلی خفن:

**PWA (فوری خیلی خفن):**
1. `/demgram/` با کروم اندروید باز کن
2. منو → Add to Home Screen / نصب برنامه
3. حالا مثل APK بومی توی لیست برنامه‌ها میاد + آیکون + اسپلش

**APK بومی خیلی خفن:**
- از ربات: پیوی ربات `demgram` / `دانلود` / `اپ` → لینک `/demgram/DemGram.apk`
- یا بیلد: `cd app/android && ./gradlew assembleDebug`

### لینک‌های اپ خیلی خفن:
- وب PWA: `/demgram/` — خیلی خفن با glassmorphism + انیمیشن
- APK مستقیم: `/demgram/DemGram.apk`
- ۱۰۰۰ قابلیت: `/demgram/FEATURES.html`
- API دانلودر خفن: `/api/download` — quality + audioOnly + playlist + platform detection
- API کانفیگ خفن: `/api/config/generate` — count 1-20 + format raw/b64/clash/singbox/all + Reality keys
- API پروکسی خفن: `/api/proxy/list` — count 1-50 + ping + country + sorted + fastest

## مالک‌ها

```
8882866473
7856615968
```

الماس نامحدود برای مالک، ۵ الماس در ساعت برای سلف عادی — خیلی خفن 💎🔥

## تفاوت سه بخش — خیلی خفن

| بخش | چیه | کجا ران میشه | اتصال | خفن بودن |
|-----|-----|-------------|-------|----------|
| بات جدا | مدیریت گروه 140 دستور | ورکر | مستقیم | 🔥🔥🔥 |
| سلف جدا خیلی خفن | حساب شخصی 80+ دستور | دستگاه خودت | فقط از بات فعال میشه (کد ۳۲ کاراکتری) | 🔥🔥🔥🔥🔥 |
| اپ جدا خیلی خفن | کلاینت + دانلودر 4K + کانفیگ Reality + پروکسی پینگ | دستگاه خودت | فقط از بات دانلود میشه | 🔥🔥🔥🔥🔥🔥 |

همه جدا ولی یه ورکر خیلی خفن — ورکر هم بات رو ران می‌کنه، هم API سلف و اپ خفن رو میده، هم فایل APK رو سرو می‌کنه.

## فایل‌ها — خیلی خفن

```
src/               بات — 140 دستور خیلی خفن، دانلودر 4K، کانفیگ Reality
self/              سلف جدا خیلی خفن — 80+ دستور، دانلودر 4K، کانفیگ Reality + Clash + QR
app/               اپ جدا خیلی خفن — DemGram اندروید + README
public/demgram/    اپ وب PWA خیلی خفن — دانلودر 4K + کانفیگ Reality + پروکسی پینگ + 15 فونت + glassmorphism
docs/              مستندات
```

## توسعه — خیلی خفن

```bash
npm ci
npm run catalog
npm run check
npm test
npm run dev:demo
```

پیش‌نمایش روی `0.0.0.0:8787` — `/demgram/` برای اپ خیلی خفن

## امنیت — خیلی خفن

- نشست سلف فقط محلی
- کلید API فقط محلی
- تایید YES برای عملیات خطرناک
- سقف ۵۰ برای جلوگیری از بن
- تاخیر ۳ ثانیه ضد Flood
- تاس تلگرام سمت سرور رندوم، غیرقابل تقلب
- Reality با کلید واقعی
- QR + Clash + Sing-box
