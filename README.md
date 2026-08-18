# AMINCK Nova Edge — GOD Edition

پنل **API-only**، فارسی و RTL برای مدیریت اشتراک‌های **VLESS + WebSocket + TLS** روی **Cloudflare Workers**.
برند **AMINCK GOD Edition** روی همهٔ کانفیگ‌ها، ضد شناسایی کامل، دامنه‌های جعلی نت ملی، سرعت GOD، انتخاب پورت Zooz/BPB، و آپدیت یک‌کلیکی بدون قطعی دامنه.

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/amingangmanatgh2-hash/AMINCK-Nova-Edge)

---

## امکانات کلیدی این نسخه

| بخش | جزئیات |
|---|---|
| برند | **AMINCK GOD Edition** روی نام کانفیگ‌ها، ساب‌ها و Backup |
| ضد شناسایی | `pathPadding` · `pathJitter` (slug ۶–۱۲) · path رندوم · TLS/WS `fragment` · Host camouflage |
| دامنه‌های جعلی | `snaap.ir`، digikala، aparat، varzesh3، … (قابل تنظیم در `fakeDomains`) |
| سرعت GOD | `earlyData=4096` · `healthInterval=50` · `tolerance=50` · `tcpRetries=4` · `tcp-concurrent` |
| پورت | انتخاب پورت‌های TLS کلودفلر مثل Zooz/BPB: `443, 2053, 2083, 2087, 2096, 8443` + `antiDetect.multiPort` |
| آپدیت | `POST /api/hot-update` — بازسازی مسیر همهٔ مشترک‌ها بدون تغییر دامنه Worker |
| UI | **پنل ادمین مرورگری حذف شده** — فقط لندینگ توضیحی + JSON API |
| state | یک Durable Object خودکار (`AMINCK_STORE`) — بدون D1/KV |

> هیچ ادعایی دربارهٔ «سرعت تضمینی» وجود ندارد. اعداد Probe فقط تأخیر TCP+TLS از Edge کلودفلر هستند.

## نصب و Deploy

### گزینه ۱ — دکمهٔ رسمی

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/amingangmanatgh2-hash/AMINCK-Nova-Edge)

### گزینه ۲ — CLI

```bash
git clone https://github.com/amingangmanatgh2-hash/AMINCK-Nova-Edge.git
cd AMINCK-Nova-Edge
npm install
npx wrangler login
npm run deploy
```

### Secretها

```bash
wrangler secret put ADMIN_PASSWORD   # رمز مالک (حداقل ۱۰ کاراکتر)
wrangler secret put SESSION_SECRET  # openssl rand -hex 32
```

محلی: `.dev.vars.example` → `.dev.vars`

ورود مالک: username = `AMINCK` (یا خالی) + `ADMIN_PASSWORD`.

## API سریع

```bash
# ورود
curl -X POST https://YOUR_WORKER/api/login \
  -H 'content-type: application/json' \
  -d '{"username":"AMINCK","password":"YOUR_PASSWORD"}' -c cookies.txt

# ساخت مشترک
curl -X POST https://YOUR_WORKER/api/user-create -b cookies.txt \
  -H 'content-type: application/json' \
  -d '{"name":"user1","paths":5,"speedPreset":"god","limitBytes":0,"limitSeconds":0,"maxConnections":0}'

# تنظیم ضد شناسایی + دامنه‌های جعلی + پورت‌ها
curl -X POST https://YOUR_WORKER/api/settings -b cookies.txt \
  -H 'content-type: application/json' \
  -d '{
    "settings": {
      "brand": "AMINCK GOD Edition",
      "speedPreset": "god",
      "tlsPorts": [443, 2053, 2083, 2087, 2096, 8443],
      "fakeDomains": ["snaap.ir", "www.digikala.com", "www.aparat.com"],
      "antiDetect": {
        "pathPadding": true,
        "pathJitter": true,
        "fragment": true,
        "hostCamouflage": true,
        "multiPort": true,
        "fragmentLength": [100, 200],
        "fragmentInterval": [10, 20]
      }
    }
  }'

# آپدیت یک‌کلیکی بدون قطعی دامنه
curl -X POST https://YOUR_WORKER/api/hot-update -b cookies.txt \
  -H 'content-type: application/json' \
  -d '{"speedPreset":"god"}'

# ساب
curl https://YOUR_WORKER/sub/TOKEN
curl https://YOUR_WORKER/sub/TOKEN/clash
curl https://YOUR_WORKER/sub/TOKEN/singbox
```

### جدول API

| مسیر | مجوز | توضیح |
|---|---|---|
| `GET /healthz` | عمومی | Health |
| `POST /api/login` | — | ورود (کوکی HttpOnly) |
| `GET /api/me` | Session | نقش/قدرت/Permission |
| `GET/POST /api/users` | users:view | فهرست + جست‌وجو |
| `POST /api/user-create` | users:create | ساخت مشترک |
| `POST /api/user-update` | users:edit | ویرایش |
| `POST /api/user-delete` | users:delete | حذف |
| `POST /api/config-build` | configs:build | ساخت کانفیگ |
| `POST /api/auto-build` | configs:build + users:create | ساب اتومات |
| `POST /api/hot-update` | settings:manage | آپدیت بدون قطعی دامنه |
| `POST /api/probe` | endpoints:probe | Probe از Edge |
| `GET/POST /api/endpoints` | endpoints:probe | مدیریت Endpoint |
| `GET/POST /api/settings` | settings:manage | تنظیمات + antiDetect |
| `GET/POST /api/admins/*` | admins:manage | ادمین‌ها |
| `GET/POST /api/audit` | audit:view | Audit |
| `GET/POST /api/backup` | backup:export | Backup JSON |
| `GET /sub/{token}` | Token | ساب |
| `WS /e{slug}{userId}` | UUID | پروکسی VLESS |

## خروجی‌ها

- **V2Ray Base64** / **Raw VLESS** (با fragment و Host جعلی)
- **Clash Meta**: NOVA-AUTO / FALLBACK / BALANCE / SMART + unified-delay + tcp-concurrent (GOD)
- **sing-box**: TUN + Mixed + DoH + Direct خصوصی + `tls_fragment`

## نقش‌ها و قدرت

| نقش | قابلیت |
|---|---|
| owner | همهٔ ۱۰ Permission — username `AMINCK` |
| admin | کاربران (حذف)، کانفیگ، Probe، بکاپ، Audit |
| operator | کاربران بدون حذف، کانفیگ، Probe، بکاپ، Audit |
| support | view کاربران، کانفیگ، Audit |

| قدرت | سقف مسیر |
|---|---|
| Limited | ۵ |
| Normal | ۳۰ |
| Strong | ۸۰ |
| Ultra | ۲۰۰ |

## توسعه و تست

```bash
npm install
npm test            # واحد + یکپارچه (Miniflare)
npm run check       # tsc + node --check روی JS لندینگ
npm run build:public
```

## امنیت

- Session HMAC-SHA256 + کوکی `HttpOnly; Secure; SameSite=Strict`
- Same-Origin روی mutating requests
- CSP / X-Frame-Options / Referrer-Policy / Permissions-Policy
- Login delay + lockout
- PBKDF2-SHA256 برای ادمین‌ها
- بلاک IP خصوصی و SMTP؛ UDP فقط DNS/53
- بدون Secret در Git

جزئیات: [SECURITY.md](SECURITY.md)

## لایسنس

MIT — [LICENSE](LICENSE)
