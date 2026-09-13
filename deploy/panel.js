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
