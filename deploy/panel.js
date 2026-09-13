// AMINCK Nova — shared panel UI + helpers (used by both the standalone
// Worker and the container-backed Worker). No dependencies.

export const CHAT_MODEL = "@cf/meta/llama-3.1-8b-instruct";
export const IMAGE_MODEL = "@cf/black-forest-labs/flux-1-schnell";

export const GAMEMODES = [
  { id: "lobby", name: "لابی", desc: "هاب اصلی شبکه", en: "Lobby" },
  { id: "survival", name: "سروایول", desc: "بقای کلاسیک", en: "Survival" },
  { id: "creative", name: "کریتیو", desc: "ساخت‌وساز بی‌نهایت", en: "Creative" },
  { id: "skywars", name: "اسکای‌وارز", desc: "جزیره‌های شناور", en: "SkyWars" },
  { id: "bedwars", name: "بدوارز", desc: "نابود کردن تخت حریف", en: "BedWars" },
  { id: "sumo", name: "سومو", desc: "هل دادن از سکو", en: "Sumo" },
  { id: "parkour", name: "پارکور", desc: "پرش و مهارت", en: "Parkour" },
  { id: "practice", name: "پرکتیس", desc: "تمرین PvP", en: "Practice" },
  { id: "kitpvp", name: "کیت‌پی‌وی‌پی", desc: "مبارزه با کیت", en: "KitPvP" },
  { id: "spleef", name: "اسپلیف", desc: "شکستن برف زیر پا", en: "Spleef" },
  { id: "tntrun", name: "تی‌ان‌تی‌ران", desc: "فرار از بلوک‌های سقوط‌کننده", en: "TNTRun" },
  { id: "mlg", name: "ام‌ال‌جی", desc: "فرود با سطل آب", en: "MLG" },
  { id: "duels", name: "دوئل", desc: "مبارزه یک‌به‌یک", en: "Duels" },
  { id: "zombies", name: "زامبی", desc: "موج‌های زامبی", en: "Zombies" },
  { id: "bridge", name: "بریج", desc: "مسابقه‌ی پل", en: "Bridge" },
  { id: "hungergames", name: "هانگرگیمز", desc: "بقا تا آخرین نفر", en: "Hunger Games" },
  { id: "hideseek", name: "قایم‌موشک", desc: "قایم شدن و پیدا کردن", en: "Hide & Seek" },
  { id: "buildbattle", name: "بیلدبتل", desc: "مسابقه‌ی ساخت‌وساز", en: "Build Battle" },
];

export function escapeHtml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Shop catalog — mirrors server/economy.py CATALOG so the site can list the
// same items even when the game container isn't reachable yet.
export const SHOP_CATALOG = [
  { id: "coins_1000", type: "coins", amount: 1000, name: "۱۰۰۰ سکه", price_toman: 20000 },
  { id: "coins_5000", type: "coins", amount: 5000, name: "۵۰۰۰ سکه", price_toman: 80000 },
  { id: "rank_vip", type: "rank", rank: "vip", name: "رنک VIP", price_toman: 50000 },
  { id: "rank_mvp", type: "rank", rank: "mvp", name: "رنک MVP", price_toman: 120000 },
  { id: "rank_legend", type: "rank", rank: "legend", name: "رنک Legend", price_toman: 300000 },
  { id: "rank_god", type: "rank", rank: "god", name: "رنک God", price_toman: 700000 },
  { id: "kit_builder", type: "kit", kit: "builder", name: "کیت Builder", price_toman: 25000 },
];

export function buildIconPrompt(name) {
  return (
    `Epic Minecraft server logo icon, cubic voxel style, the word '${name}' ` +
    `as a bold 3D blocky golden title on a dark navy background, glowing ` +
    `blue and gold accents, floating cubes, dramatic lighting, high detail, ` +
    `game art, square 1:1`
  );
}

export const CSS = `
:root{color-scheme:dark}
*{box-sizing:border-box}
body{margin:0;font-family:system-ui,-apple-system,"Segoe UI",Roboto,"Vazirmatn",sans-serif;
  background:radial-gradient(1200px 800px at 50% -10%,#1b2a4a 0%,#0b1120 55%,#070a14 100%);
  color:#e8ecf4;min-height:100vh}
.wrap{max-width:980px;margin:0 auto;padding:32px 20px 80px}
header{display:flex;gap:20px;align-items:center;flex-wrap:wrap}
.icon{width:88px;height:88px;border-radius:18px;background:rgba(255,255,255,.06);
  border:1px solid rgba(255,255,255,.12);object-fit:cover;image-rendering:auto}
h1{margin:0;font-size:1.9rem;background:linear-gradient(90deg,#ffd76a,#ff8a5c);
  -webkit-background-clip:text;background-clip:text;color:transparent}
.sub{color:#93a2bd;margin-top:6px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:14px;margin-top:26px}
.card{background:rgba(255,255,255,.045);border:1px solid rgba(255,255,255,.1);
  border-radius:16px;padding:16px 18px}
.card .k{color:#7f8fb0;font-size:.78rem;text-transform:uppercase;letter-spacing:.06em}
.card .v{font-size:1.35rem;font-weight:650;margin-top:6px}
.badge{display:inline-block;padding:3px 10px;border-radius:999px;font-size:.75rem;
  background:#123b2a;color:#5ee6a8;border:1px solid #1f5f41}
.badge.off{background:#3a1220;color:#ff9bb0;border-color:#5f2030}
code{background:rgba(255,255,255,.08);padding:2px 7px;border-radius:6px}
table{width:100%;border-collapse:collapse;margin-top:10px}
td,th{padding:8px 10px;border-bottom:1px solid rgba(255,255,255,.08);text-align:right}
th{color:#7f8fb0;font-size:.78rem;text-transform:uppercase}
a{color:#8ec9ff}
.note{background:rgba(255,170,60,.08);border:1px solid rgba(255,170,60,.25);
  border-radius:14px;padding:14px 18px;margin-top:20px;color:#ffd9a0;line-height:1.7}
form{background:rgba(255,255,255,.045);border:1px solid rgba(255,255,255,.1);
  border-radius:16px;padding:22px;margin-top:26px;max-width:560px}
label{display:block;margin:14px 0 6px;color:#93a2bd;font-size:.85rem}
input{width:100%;padding:11px 13px;border-radius:10px;border:1px solid rgba(255,255,255,.15);
  background:rgba(0,0,0,.3);color:#fff;font-size:1rem}
button{margin-top:20px;padding:12px 22px;border:none;border-radius:11px;cursor:pointer;
  background:linear-gradient(90deg,#ffd76a,#ff8a5c);color:#201300;font-weight:700;font-size:1rem}
.dir{direction:rtl;text-align:right}
.ltr{direction:ltr;text-align:left}
.footer{margin-top:40px;color:#5f6f8c;font-size:.8rem}
`;

export function setupPage(name) {
  return `<!doctype html><html lang="fa"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>راه‌اندازی ${escapeHtml(name || "AMINCK Nova")}</title>
<style>${CSS}</style></head><body><div class="wrap dir">
<header><img class="icon" src="/favicon.png" alt="icon"><div>
<h1>راه‌اندازی سرور 🚀</h1>
<div class="sub">Cloudflare Workers + Workers AI — بدون نیاز به توکن</div>
</div></header>
<form method="POST" action="/__setup">
<label>نام سرور (برای لوگو و MOTD)</label>
<input name="name" value="${escapeHtml(name || "AMINCK Nova")}" placeholder="مثلاً AMINCK Nova">
<label>دامنه یا آدرس دلخواه (اختیاری — برای اتصال از ایران بهتر است)</label>
<input name="domain" dir="ltr" placeholder="play.example.com">
<label>توضیح کوتاه / MOTD</label>
<input name="motd" value="Minecraft God Server — Java 1.8 → 26.x">
<button type="submit">ساخت لوگو با Workers AI و ادامه ⚡</button>
</form>
<p class="sub">بعد از تأیید، لوگوی سرور با مدل تصویر Workers AI (Flux) ساخته و ذخیره می‌شود.</p>
<div class="footer">AMINCK Nova • {ts}</div>
</div></body></html>`.replace("{ts}", new Date().toISOString());
}

export function panelPage(state) {
  const rows = GAMEMODES.filter((m) => m.id !== "lobby")
    .map((m) => `<tr><td><code>/join ${m.id}</code></td><td>${m.name}</td><td>${m.desc}</td></tr>`)
    .join("");
  const addr = state.java || (state.domain ? `${state.domain}:25565` : "—");
  const bedrock = state.domain ? `${state.domain}:19132` : "—";
  const aiBadge = state.ai === "on" ? '<span class="badge">Workers AI ✓</span>' : '<span class="badge off">OFF</span>';
  return `<!doctype html><html lang="fa"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(state.name)} — پنل</title>
<style>${CSS}</style></head><body><div class="wrap dir">
<header><img class="icon" src="/favicon.png" alt="icon"><div>
<h1>${escapeHtml(state.name)}</h1>
<div class="sub">${escapeHtml(state.motd || "")}</div>
<div class="sub">Java 1.8 → 26.x &nbsp;•&nbsp; ۱۸ گیم‌مود &nbsp;•&nbsp; هوش مصنوعی</div>
</div></header>
<div class="grid">
<div class="card"><div class="k">وضعیت</div><div class="v">● آنلاین</div></div>
<div class="card"><div class="k">بازیکنان</div><div class="v">${state.online} / 100</div></div>
<div class="card"><div class="k">گیم‌مودها</div><div class="v">${GAMEMODES.length - 1}</div></div>
<div class="card"><div class="k">ربات‌های AI</div><div class="v">${state.bots ?? 0}</div></div>
<div class="card"><div class="k">هوش مصنوعی</div><div class="v">${aiBadge}</div></div>
<div class="card"><div class="k">آپتایم</div><div class="v">${state.uptime ?? "—"}</div></div>
</div>
<h2>آدرس اتصال</h2>
<p class="ltr" style="text-align:right">Java: <code>${escapeHtml(addr)}</code><br>Bedrock (ping): <code>${escapeHtml(bedrock)}</code></p>
<h2>گیم‌مودها (۱۸ عدد)</h2>
<table><thead><tr><th>دستور</th><th>مود</th><th>توضیح</th></tr></thead><tbody>${rows}</tbody></table>
<h2>چطور بازی کنم؟</h2>
<p class="sub" style="line-height:1.9">
<code>/menu</code> — لیست گیم‌مودها &nbsp;•&nbsp; <code>/join &lt;mode&gt;</code> — ورود<br>
<code>/companion</code> — رفیق هوشمند &nbsp;•&nbsp; <code>/enemy 3</code> — دشمن PvP<br>
<code>/lobby</code> — بازگشت به هاب &nbsp;•&nbsp; <code>/ai</code> — روشن/خاموش چت ربات
</p>
${state.backendNote || ""}
<div class="note">🇮🇷 <b>نکته برای ایران:</b> دامنهٔ <code>workers.dev</code> معمولاً در ایران مسدود است. برای اتصال از داخل ایران، یک دامنهٔ شخصی روی Cloudflare اضافه کنید (روت + رکورد DNS) و از مسیر Spectrum/Tunnel استفاده کنید. جزئیات کامل در README پروژه آمده است.</div>
<div class="footer">AMINCK Nova • روی Cloudflare • ${new Date().toISOString()}</div>
</div></body></html>`;
}

export async function generateIconPng(env, name) {
  // Workers AI image model -> PNG bytes (no token: uses the [ai] binding)
  const input = { prompt: buildIconPrompt(name) };
  const res = await env.AI.run(IMAGE_MODEL, input);
  // res is a base64 image string for this model
  const b64 = (typeof res === "string") ? res : (res && (res.image || res.result || "").toString?.());
  if (typeof b64 === "string" && b64.length) {
    const clean = b64.replace(/^data:image\/\w+;base64,/, "");
    const bin = Uint8Array.from(atob(clean), (c) => c.charCodeAt(0));
    return bin;
  }
  throw new Error("no image returned");
}

export async function aiChat(env, messages, model = CHAT_MODEL, max_tokens = 160) {
  const res = await env.AI.run(model, { messages, max_tokens });
  const text = (res && (res.response ?? res.result?.response)) || "";
  return String(text).trim();
}

export function shopPage(state) {
  const items = (state.catalog || SHOP_CATALOG).map((c) => {
    const price = c.price_toman ? `${Number(c.price_toman).toLocaleString("fa-IR")} تومان` : "فقط با سکه (در بازی)";
    const btn = c.price_toman
      ? `<button onclick="buy('${escapeHtml(c.id)}')">خرید</button>`
      : "";
    return `<div class="card"><div class="k">${escapeHtml(c.id)}</div><div class="v">${escapeHtml(c.name)}</div><div class="p">${price}</div>${btn}</div>`;
  }).join("");
  const pay = state.payment || {};
  return `<!doctype html><html lang="fa"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(state.name)} — فروشگاه</title>
<style>${CSS}
.p{color:#cfe3ff;font-size:.95rem;margin-bottom:10px}
#msg{margin-top:14px;white-space:pre-wrap}
</style></head><body><div class="wrap dir">
<h1>🛒 فروشگاه ${escapeHtml(state.name)}</h1>
<div class="sub">${escapeHtml(state.motd || "")}</div>
<div class="grid">${items}</div>
<div class="note">
<b>روش پرداخت:</b><br>
شماره کارت: <code class="ltr">${escapeHtml(pay.card || "—")}</code> &nbsp; به نام <code>${escapeHtml(pay.card_holder || "—")}</code><br>
${escapeHtml(pay.note || "پس از واریز، کد سفارش را به ادمین اطلاع دهید تا تأیید شود.")}<br>
<b>نحوه فعال‌سازی:</b> بعد از تأیید پرداخت، کد فعال‌سازی دریافت می‌کنید. داخل بازی دستور <code>/redeem &lt;کد&gt;</code> را بزنید.
</div>
<div id="msg"></div>
<div class="footer">AMINCK Nova • اتصال: <code class="ltr">${escapeHtml(state.site || "")}</code></div>
</div>
<script>
async function buy(item){
  const msg = document.getElementById('msg');
  msg.textContent = 'در حال ثبت سفارش…';
  const buyer = prompt('نام شما در بازی (IGN):') || 'guest';
  const contact = prompt('راه ارتباطی (اختیاری):') || '';
  try {
    const r = await fetch('/site/order',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({item,buyer,contact})});
    const j = await r.json();
    if(!j.ok){ msg.textContent = 'خطا: ' + (j.error||'نامشخص'); return; }
    msg.textContent = '✅ سفارش ثبت شد!\\nکد سفارش: ' + j.order_id + '\\nمبلغ: ' + (j.price_toman||0) + ' تومان\\n' + (j.how||'');
  } catch (e) {
    msg.textContent = 'خطا در ارتباط با سرور: ' + e;
  }
}
</script>
</div></body></html>`;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Admin panel UI (front Worker). Password comes from ADMIN_PASSWORD at
//  deploy time; the session token is an HMAC signed with that same password,
//  so both the Worker and the Python container accept identical credentials.
// ─────────────────────────────────────────────────────────────────────────────

export function adminLoginPage(msg = "") {
  return `<!doctype html><html lang="fa"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>ورود ادمین — AMINCK Nova</title>
<style>${CSS}</style></head><body><div class="wrap dir">
<h1>🔐 پنل ادمین</h1>
<div class="sub">رمز ادمین را در زمان دیپلوی تعیین کرده‌اید (ADMIN_PASSWORD).</div>
${msg ? `<div class="note">${escapeHtml(msg)}</div>` : ""}
<form method="POST" action="/admin/login">
<label>رمز ادمین</label>
<input name="password" type="password" autocomplete="current-password" autofocus required>
<button type="submit">ورود</button>
</form>
<div class="footer"><a href="/">بازگشت به پنل</a> • <a href="/site">فروشگاه</a></div>
</div></body></html>`;
}

export function adminNoPasswordPage() {
  return `<!doctype html><html lang="fa"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>پنل ادمین — نیاز به رمز</title>
<style>${CSS}</style></head><body><div class="wrap dir">
<h1>🔐 پنل ادمین غیرفعال است</h1>
<div class="note">
متغیر <code>ADMIN_PASSWORD</code> خالی است. برای فعال‌سازی پنل ادمین:<br>
۱) در داشبورد Cloudflare → Worker شما → <b>Settings → Variables and Secrets</b> مقدار
<code>ADMIN_PASSWORD</code> را به‌صورت <b>Secret</b> تنظیم کنید،<br>
۲) یا دوباره با <code>npx wrangler deploy</code> و مقداردهی <code>ADMIN_PASSWORD</code> دیپلوی کنید،<br>
۳) یا از ویزارد <code>node deploy/index.js</code> استفاده کنید که رمز را از شما می‌پرسد.
</div>
<div class="footer"><a href="/">بازگشت به پنل</a></div>
</div></body></html>`;
}

export function adminPage(state) {
  const s = state || {};
  const backend = s.backend || null;
  const backendBadge = backend
    ? '<span class="badge">سرور بازی متصل ✓</span>'
    : '<span class="badge off">سرور بازی متصل نیست</span>';
  const orderRows = (s.orders || []).map((o) => `
    <tr>
      <td><code class="ltr">${escapeHtml(o.id)}</code></td>
      <td>${escapeHtml(o.item)}</td>
      <td>${escapeHtml(o.buyer)}</td>
      <td>${escapeHtml(String(o.price_toman ?? ""))}</td>
      <td>${o.status === "paid" ? "✅ پرداخت‌شده" : "⏳ در انتظار"}</td>
      <td>${o.status === "paid"
        ? `<code class="ltr">${escapeHtml(o.code || "")}</code>`
        : `<button class="mini" onclick="run('order_resolve',{order_id:'${escapeHtml(o.id)}',gateway_ref:'manual'})">تأیید</button>`}</td>
    </tr>`).join("") || `<tr><td colspan="6" class="sub">سفارشی ثبت نشده است.</td></tr>`;

  return `<!doctype html><html lang="fa"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>پنل ادمین — ${escapeHtml(s.name || "AMINCK Nova")}</title>
<style>${CSS}
button.mini{margin:0;padding:6px 12px;font-size:.85rem}
h2{margin-top:34px;border-bottom:1px solid rgba(255,255,255,.1);padding-bottom:8px}
.row{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:12px;align-items:end}
.row label{margin:0}
.sec{background:rgba(255,255,255,.045);border:1px solid rgba(255,255,255,.1);
  border-radius:16px;padding:20px;margin-top:14px;max-width:none}
#log{margin-top:18px;white-space:pre-wrap;background:rgba(0,0,0,.35);
  border:1px solid rgba(255,255,255,.12);border-radius:12px;padding:14px;
  font-family:ui-monospace,monospace;font-size:.85rem;min-height:52px}
select,textarea{width:100%;padding:11px 13px;border-radius:10px;
  border:1px solid rgba(255,255,255,.15);background:rgba(0,0,0,.3);color:#fff;font-size:1rem}
</style></head><body><div class="wrap dir">
<header><img class="icon" src="/favicon.png" alt="icon"><div>
<h1>🛠️ پنل ادمین</h1>
<div class="sub">${escapeHtml(s.name || "AMINCK Nova")} &nbsp;•&nbsp; ${backendBadge}</div>
</div></header>

<div class="grid">
<div class="card"><div class="k">بازیکنان آنلاین</div><div class="v">${backend?.online ?? 0}</div></div>
<div class="card"><div class="k">ربات‌های AI</div><div class="v">${backend?.bots ?? 0}</div></div>
<div class="card"><div class="k">TPS</div><div class="v">${backend?.tps ?? "—"}</div></div>
<div class="card"><div class="k">آپتایم</div><div class="v">${backend?.uptime ?? "—"}</div></div>
<div class="card"><div class="k">سفارش‌های باز</div><div class="v">${(s.orders || []).filter((o) => o.status !== "paid").length}</div></div>
<div class="card"><div class="k">دامنه</div><div class="v" style="font-size:1rem">${escapeHtml(s.domain || "—")}</div></div>
</div>

<h2>📣 برادکست و پیام</h2>
<div class="sec"><div class="row">
<div><label>متن پیام (به همهٔ بازیکنان)</label><input id="bc_text" placeholder="مثلاً: ایونت امشب ساعت ۲۲"></div>
<div><button onclick="run('broadcast',{text:val('bc_text')})">ارسال برادکست</button></div>
</div></div>

<h2>👤 مدیریت بازیکن</h2>
<div class="sec"><div class="row">
<div><label>نام بازیکن</label><input id="pl_name" placeholder="Notch"></div>
<div><label>مقدار</label><input id="pl_amount" placeholder="۱۰۰۰"></div>
<div><label>رنک</label><select id="pl_rank">
<option value="player">Player</option><option value="vip">VIP</option>
<option value="mvp">MVP</option><option value="legend">Legend</option>
<option value="god">God</option></select></div>
</div>
<div class="row" style="margin-top:14px">
<div><button onclick="run('coins_add',{player:val('pl_name'),amount:Number(val('pl_amount')||0)})">+ سکه</button></div>
<div><button onclick="run('coins_set',{player:val('pl_name'),amount:Number(val('pl_amount')||0)})">تنظیم سکه</button></div>
<div><button onclick="run('rank_set',{player:val('pl_name'),rank:val('pl_rank')})">تنظیم رنک</button></div>
<div><button onclick="run('xp_add',{player:val('pl_name'),amount:Number(val('pl_amount')||0)})">+ XP</button></div>
</div>
<div class="row" style="margin-top:14px">
<div><button onclick="run('kick',{player:val('pl_name')})">کیک</button></div>
<div><button onclick="run('mute',{player:val('pl_name'),minutes:Number(val('pl_amount')||10)})">میوت</button></div>
<div><button onclick="run('ban',{player:val('pl_name'),reason:'ban by admin'})">بن</button></div>
<div><button onclick="run('unban',{player:val('pl_name')})">آن‌بن</button></div>
<div><button onclick="run('unmute',{player:val('pl_name')})">آن‌میوت</button></div>
<div><button onclick="run('heal',{player:val('pl_name')})">هیل</button></div>
<div><button onclick="run('fly',{player:val('pl_name')})">تغییر پرواز</button></div>
</div>
<div class="row" style="margin-top:14px">
<div><label>بررسی کامل بازیکن (سکه، رنک، اینونتوری، خانه‌ها، بن/میوت)</label>
<button onclick="run('player_info',{player:val('pl_name')})">نمایش پروندهٔ بازیکن</button></div>
</div>
<div class="row" style="margin-top:14px">
<div><label>آیتم (برای /give)</label><input id="pl_item" placeholder="diamond_sword"></div>
<div><label>تعداد</label><input id="pl_itemn" value="1"></div>
<div><button onclick="run('give',{player:val('pl_name'),item:val('pl_item'),count:Number(val('pl_itemn')||1)})">دادن آیتم</button></div>
</div></div>

<h2>🌍 دنیا و زمان</h2>
<div class="sec"><div class="row">
<div><label>چرخهٔ زمان</label><select id="w_time">
<option value="day">روز</option><option value="night">شب</option>
<option value="noon">ظهر</option><option value="midnight">نیمه‌شب</option></select></div>
<div><label>آب‌وهوا</label><select id="w_weather">
<option value="clear">صاف</option><option value="rain">باران</option>
<option value="thunder">رعدوبرق</option></select></div>
<div><button onclick="run('world',{time:val('w_time'),weather:val('w_weather')})">اعمال</button></div>
</div></div>

<h2>🤖 ربات‌های AI</h2>
<div class="sec"><div class="row">
<div><label>تعداد</label><input id="b_n" value="2"></div>
<div><label>سختی</label><select id="b_diff">
<option value="easy">easy</option><option value="normal" selected>normal</option>
<option value="hard">hard</option></select></div>
<div><label>نوع</label><select id="b_kind">
<option value="enemy">دشمن (PvP)</option><option value="companion">رفیق</option></select></div>
<div><button onclick="run('bots_spawn',{count:Number(val('b_n')||1),difficulty:val('b_diff'),kind:val('b_kind')})">اسپاون</button></div>
<div><button onclick="run('bots_clear',{})">حذف همه</button></div>
</div></div>

<h2>⚙️ تنظیمات سرور</h2>
<div class="sec"><div class="row">
<div><label>نام سرور</label><input id="c_name" value="${escapeHtml(s.name || "")}"></div>
<div><label>دامنه</label><input id="c_domain" class="ltr" value="${escapeHtml(s.domain || "")}"></div>
<div><label>MOTD</label><input id="c_motd" value="${escapeHtml(s.motd || "")}"></div>
</div>
<div class="row" style="margin-top:14px">
<div><button onclick="run('config_set',{name:val('c_name'),domain:val('c_domain'),motd:val('c_motd')})">ذخیره</button></div>
<div><button onclick="run('icon_regenerate',{name:val('c_name')})">ساخت دوبارهٔ لوگو با AI</button></div>
<div><button onclick="run('restart',{})">ری‌استارت سرور بازی</button></div>
</div></div>

<h2>🛒 سفارش‌ها و کدها</h2>
<div class="sec">
<table><thead><tr><th>شناسه</th><th>آیتم</th><th>خریدار</th><th>مبلغ</th><th>وضعیت</th><th>کد / عملیات</th></tr></thead>
<tbody>${orderRows}</tbody></table>
<div class="row" style="margin-top:16px">
<div><label>کد دلخواه</label><input id="k_code" class="ltr" placeholder="NOVA-2026"></div>
<div><label>نوع</label><select id="k_type">
<option value="coins">سکه</option><option value="rank">رنک</option>
<option value="kit">کیت</option></select></div>
<div><label>مقدار / رنک / کیت</label><input id="k_value" placeholder="5000 یا god یا builder"></div>
<div><button onclick="run('code_create',{code:val('k_code'),type:val('k_type'),value:val('k_value')})">ساخت کد</button></div>
</div>
<div class="row" style="margin-top:14px">
<div><label>آیتم فروشگاه</label><input id="k_item" placeholder="rank_vip"></div>
<div><label>قیمت (تومان)</label><input id="k_price" placeholder="50000"></div>
<div><button onclick="run('catalog_add',{id:val('k_item'),name:val('k_item'),price_toman:Number(val('k_price')||0)})">افزودن آیتم</button></div>
<div><button onclick="run('catalog_remove',{id:val('k_item')})">حذف آیتم</button></div>
</div>
<div class="row" style="margin-top:14px">
<div><label>شماره کارت فروشگاه</label><input id="p_card" class="ltr" value="${escapeHtml(s.payment?.card || "")}"></div>
<div><label>به نام</label><input id="p_holder" value="${escapeHtml(s.payment?.card_holder || "")}"></div>
<div><label>توضیح پرداخت</label><input id="p_note" value="${escapeHtml(s.payment?.note || "")}"></div>
<div><button onclick="run('payment_set',{card:val('p_card'),card_holder:val('p_holder'),note:val('p_note')})">ذخیره</button></div>
</div></div>

<h2>🖥️ اجرای دستور خام</h2>
<div class="sec"><div class="row">
<div><label>دستور کنسول (بدون /)</label><input id="raw_cmd" class="ltr" placeholder="say hello"></div>
<div><button onclick="run('console',{command:val('raw_cmd')})">اجرا</button></div>
</div></div>

<div id="log">آماده…</div>
<p><a href="/admin/logout">خروج از پنل ادمین</a> &nbsp;•&nbsp; <a href="/">پنل عمومی</a> &nbsp;•&nbsp; <a href="/site">فروشگاه</a></p>
<div class="footer">AMINCK Nova • ${new Date().toISOString()}</div>
</div>
<script>
function val(id){const e=document.getElementById(id);return e?e.value:''}
async function run(action,payload){
  const log=document.getElementById('log');
  log.textContent='در حال اجرای '+action+' …';
  try{
    const r=await fetch('/admin/api/action',{method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify(Object.assign({action:action},payload||{}))});
    const j=await r.json();
    log.textContent=(r.ok&&j.ok!==false)
      ? '✅ '+action+' → '+JSON.stringify(j.result!==undefined?j.result:j,null,1)
      : '❌ '+action+' → '+(j.error||('HTTP '+r.status));
    if(['order_resolve','code_create','catalog_add','catalog_remove','config_set','payment_set'].indexOf(action)>=0){
      setTimeout(()=>location.reload(),900);
    }
  }catch(e){log.textContent='❌ خطای ارتباط: '+e}
}
</script>
</div></body></html>`;
}
