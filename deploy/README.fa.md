# 🚀 AMINCK Nova — سرور ماینکرفت «خدا» روی Cloudflare

سرور شبکهای ماینکرفت به زبان **پایتون** با **۱۸ گیم‌مود**، **هوش مصنوعی داخل بازی**
(رفیق + دشمن)، پشتیبانی از **همهٔ نسخه‌های Java (۱.۸ → 26.x)** و پینگ **Bedrock** —
به‌همراه دیپلوی یک‌کلیکی روی Cloudflare با **Workers AI** (بدون توکن).

---

## 🔗 لینک دیپلوی (بدون توکن)

**[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/amingangmanatgh2-hash/AMINCK-Nova-Edge/tree/main/deploy)**

یا مستقیم:

```
https://deploy.workers.cloudflare.com/?url=https://github.com/amingangmanatgh2-hash/AMINCK-Nova-Edge/tree/main/deploy
```

روی دکمه بزنید، با اکانت GitHub/Cloudflare وارد شوید — **هیچ توکنی لازم نیست**.
بعد از دیپلوی، اولین بار که پنل را باز کنید از شما **«نام سرور» و «دامنه»** می‌پرسد
و سپس **لوگوی سرور را با Workers AI (مدل Flux) می‌سازد و ذخیره می‌کند** — دقیقاً از روی
نامی که انتخاب کرده‌اید. هوش مصنوعی پنل و لوگو از طریق `[ai] binding` کار می‌کند که
رایگان است و نیاز به توکن ندارد.

> این لینک **ورکر جلو** (پنل + هوش مصنوعی + ساخت لوگو) را دیپلوی می‌کند.
> برای اجرای خودِ سرور بازی روی Cloudflare، بخش «دیپلوی کامل (Container)» را ببینید.

---

## 🎮 گیم‌مودها (۱۸ عدد)

`lobby` لابی • `survival` سروایول • `creative` کریتیو • `skywars` اسکای‌وارز •
`bedwars` بدوارز • `sumo` سومو • `parkour` پارکور • `practice` پرکتیس •
`kitpvp` کیت‌پی‌وی‌پی • `spleef` اسپلیف • `tntrun` تی‌ان‌تی‌ران • `mlg` ام‌ال‌جی •
`duels` دوئل • `zombies` زامبی • `bridge` بریج • `hungergames` هانگرگیمز •
`hideseek` قایم‌موشک • `buildbattle` بیلدبتل

دستورهای داخل بازی: `/menu` ، `/join <mode>` ، `/companion` ، `/enemy 3` ،
`/lobby` ، `/gamemode` ، `/killbots` ، `/stats` ، `/list` ، `/fly` ، `/heal` ، `/ai` ، `/tp`

---

## 🤖 هوش مصنوعی داخل بازی (بدون توکن، با فالبک)

سرور بازی برای چت ربات‌ها به ترتیب اولویت از این مسیرها استفاده می‌کند
(`server/ai_client.py`):

1. **Workers AI از طریق AI Gateway** — `CF_AI_GATEWAY_URL`
2. **توکن API کلادفلر** — `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID`
3. **Workers AI از طریق ورکر همراه** — `AI_FALLBACK_URL` (اندپوینت `/ai/chat` ورکر)

یعنی اگر توکن را بدهید و **کار ندهد** (یا اصلاً ندهید)، خودش سراغ **Workers AI**
می‌رود. اگر هیچ مسیری در دسترس نباشد، ربات‌ها جواب‌های از پیش نوشته‌شده (فارسی/انگلیسی)
می‌دهند تا همیشه زنده باشند. تمام تماس‌های شبکه‌ای در `asyncio.to_thread` اجرا می‌شوند
تا تیک ۲۰ هرتزی بازی هرگز قفل نشود.

لوگو هم همین‌طور است: اول Workers AI، و اگر در دسترس نبود یک لوگوی رویه‌ای ۶۴×۶۴
(PNG خالص، بدون وابستگی) ساخته می‌شود — بنابراین سرور همیشه آیکون معتبر دارد.

---

## 📦 دیپلوی کامل (Worker + کانتینر بازی)

برای اجرای خودِ سرور بازی روی زیرساخت Cloudflare (Cloudflare Containers — بتای عمومی):

```bash
git clone https://github.com/amingangmanatgh2-hash/AMINCK-Nova-Edge.git
cd AMINCK-Nova-Edge
npx wrangler login        # فقط یک‌بار
node deploy/index.js --full
```

این اسکریپت از شما **نام سرور و دامنه** را می‌پرسد، فایل کانفیگ را می‌سازد،
`wrangler deploy` را اجرا می‌کند (Dockerfile کانتینر ساخته و پوش می‌شود) و
`AI_FALLBACK_URL` را خودکار برای هوش مصنوعی داخل بازی ثبت می‌کند.

- تصویر کانتینر: `server/Dockerfile` (Python 3.11، بدون وابستگی خارجی)
- پورت کانتینر: `8080` پنل HTTP • `25565` جاوا • `19132` پینگ Bedrock
- کانفیگ: `deploy/wrangler.containers.toml`

> کانتینرها در بتای عمومی هستند و صورتحساب دارند؛ «ورکر جلو» (لینک یک‌کلیکی بالا)
> رایگان است و بدون توکن دیپلوی می‌شود.

---

## 🇮🇷 دسترسی از ایران

کلادفلر معمولاً در شبکهٔ ایران مسدود/کند است. برای اینکه سرور «روی نت ایران جواب بدهد»:

1. **از دامنهٔ شخصی استفاده کنید، نه `workers.dev`.** دامنهٔ `*.workers.dev`
   معمولاً در ایران فیلتر است؛ یک دامنهٔ شخصی را به Cloudflare وصل کنید و برای ورکر
   یک Custom Domain (روت) بگذارید. بسیاری از آی‌پی‌های لبهٔ کلادفلر با دامنهٔ شخصی
   در ایران پاسخ می‌دهند.
2. **برای پورت بازی (TCP 25565) یک اپ Spectrum از نوع Worker بسازید** روی همان دامنه.
   Spectrum مسیر `connect(socket)` ورکر را فعال می‌کند (در `deploy/container_worker.js`
   پیاده‌سازی شده است).
3. **اگر باز هم در ایران قطع بود:** یک VPS/هاست با آی‌پی باز در ایران تهیه کنید و با
   `cloudflared tunnel` (یا یک رلهٔ TCP ساده) ترافیک را به کانتینر Cloudflare برسانید —
   یا سرور را مستقیم روی آن هاست اجرا کنید (`python3 -m server`).

⚠️ **صادقانه:** هیچ CDN‌ای نمی‌تواند دسترسی از داخل شبکهٔ ملی ایران را «تضمین» کند؛
مسیرهای ۱ و ۲ بهترین شانس را دارند و مسیر ۳ قطعی‌ترین راه است.

---

## 🧰 ساختار فایل‌ها

| مسیر | توضیح |
|------|-------|
| `server/` | بستهٔ پایتون سرور بازی (پروتکل، چانک، دنیا، AI، پنل) |
| `server/data/protocols/` | دادهٔ پروتکل ۴۹ نسخهٔ Java (۱.۸ → 26.x) |
| `server/Dockerfile` / `docker_entry.sh` | تصویر کانتینر Cloudflare |
| `deploy/worker.js` | ورکر جلو (پنل + Workers AI + ساخت لوگو) — دیپلوی یک‌کلیکی |
| `deploy/container_worker.js` | ورکر متصل به کانتینر بازی (دیپلوی کامل) |
| `deploy/wrangler.toml` | کانفیگ ورکر جلو |
| `deploy/wrangler.containers.toml` | کانفیگ کامل (Container) |
| `deploy/index.js` | ویزارد دیپلوی تعاملی (نام + دامنه → دیپلوی) |
