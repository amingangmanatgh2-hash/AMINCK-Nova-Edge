// ═══════════════════════════════════════════════════════════════════
//  Nova Edge — سیستم طراحی سایت (RTL فارسی، تم تاریک، موتیف ووکسلی)
//  همهٔ صفحه‌ها از همین CSS استفاده می‌کنند تا ظاهر یکپارچه بماند.
//  بدون فونت/CDN خارجی (برای نت ایران): فونت سیستمی + fallback.
// ═══════════════════════════════════════════════════════════════════
import { esc } from '../util.js';

export const FONTS = `'Vazirmatn','Segoe UI',Tahoma,'Noto Sans Arabic',system-ui,-apple-system,sans-serif`;

export function css(palette = {}) {
  const p = { primary: '#22d3ee', secondary: '#a855f7', accent: '#fbbf24', ...palette };
  return `
:root{--bg:#05070f;--bg2:#0b1020;--card:rgba(255,255,255,.045);--line:rgba(255,255,255,.10);
--txt:#e8edf7;--mut:#96a2b8;--pri:${p.primary};--sec:${p.secondary};--acc:${p.accent};
--ok:#22c55e;--bad:#ef4444;--warn:#f59e0b;--r:14px;--shadow:0 18px 50px rgba(0,0,0,.45)}
*{box-sizing:border-box}
html,body{margin:0;padding:0}
body{background:var(--bg);color:var(--txt);font-family:${FONTS};direction:rtl;line-height:1.75;
 -webkit-font-smoothing:antialiased;overflow-x:hidden}
body::before{content:'';position:fixed;inset:0;pointer-events:none;z-index:0;
 background:
  radial-gradient(900px 500px at 85% -10%, color-mix(in srgb, var(--pri) 18%, transparent), transparent 70%),
  radial-gradient(700px 420px at 5% 5%, color-mix(in srgb, var(--sec) 16%, transparent), transparent 70%),
  repeating-linear-gradient(0deg, rgba(255,255,255,.022) 0 1px, transparent 1px 44px),
  repeating-linear-gradient(90deg, rgba(255,255,255,.022) 0 1px, transparent 1px 44px)}
a{color:var(--pri);text-decoration:none}
a:hover{filter:brightness(1.15)}
.wrap{max-width:1180px;margin:0 auto;padding:0 18px;position:relative;z-index:1}
.glass{background:var(--card);border:1px solid var(--line);border-radius:var(--r);backdrop-filter:blur(14px);box-shadow:var(--shadow)}
.card{padding:18px}
.grid{display:grid;gap:16px}
.g2{grid-template-columns:repeat(auto-fit,minmax(300px,1fr))}
.g3{grid-template-columns:repeat(auto-fit,minmax(250px,1fr))}
.g4{grid-template-columns:repeat(auto-fit,minmax(200px,1fr))}
.g6{grid-template-columns:repeat(auto-fit,minmax(150px,1fr))}
h1,h2,h3{line-height:1.35;margin:.2em 0 .5em}
h1{font-size:clamp(26px,4.4vw,46px)}
h2{font-size:clamp(20px,2.6vw,30px)}
h3{font-size:17px}
.mut{color:var(--mut)}
.small{font-size:12.5px}
.mono{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;direction:ltr;text-align:left}
.badge{display:inline-flex;align-items:center;gap:6px;padding:3px 10px;border-radius:999px;border:1px solid var(--line);
 background:rgba(255,255,255,.06);font-size:12px;color:var(--txt);white-space:nowrap}
.badge.ok{border-color:rgba(34,197,94,.45);color:#86efac;background:rgba(34,197,94,.12)}
.badge.bad{border-color:rgba(239,68,68,.45);color:#fca5a5;background:rgba(239,68,68,.12)}
.badge.warn{border-color:rgba(245,158,11,.45);color:#fcd34d;background:rgba(245,158,11,.12)}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:11px 18px;border-radius:12px;
 border:1px solid var(--line);background:linear-gradient(180deg,rgba(255,255,255,.10),rgba(255,255,255,.03));
 color:var(--txt);font-weight:700;cursor:pointer;font-family:inherit;font-size:14.5px;transition:.15s}
.btn:hover{transform:translateY(-1px);border-color:color-mix(in srgb,var(--pri) 55%,var(--line))}
.btn.pri{background:linear-gradient(135deg,var(--pri),var(--sec));border:none;color:#060912;text-shadow:0 1px 0 rgba(255,255,255,.25)}
.btn.gold{background:linear-gradient(135deg,#fbbf24,#f97316);border:none;color:#1a1000}
.btn.ghost{background:transparent}
.btn.sm{padding:7px 12px;font-size:13px;border-radius:10px}
.btn:disabled{opacity:.45;cursor:not-allowed;transform:none}
input,select,textarea{width:100%;padding:11px 13px;border-radius:11px;border:1px solid var(--line);
 background:rgba(0,0,0,.35);color:var(--txt);font-family:inherit;font-size:14.5px}
input:focus,select:focus,textarea:focus{outline:none;border-color:var(--pri)}
label{display:block;font-size:13px;color:var(--mut);margin:10px 0 5px}
table{width:100%;border-collapse:collapse;font-size:13.5px}
th,td{padding:9px 10px;border-bottom:1px solid var(--line);text-align:right}
th{color:var(--mut);font-weight:600;font-size:12.5px;white-space:nowrap}
tr:hover td{background:rgba(255,255,255,.03)}
.nav{position:sticky;top:0;z-index:30;background:rgba(5,7,15,.78);backdrop-filter:blur(16px);border-bottom:1px solid var(--line)}
.nav-in{display:flex;align-items:center;gap:14px;padding:11px 18px;max-width:1180px;margin:0 auto;flex-wrap:wrap}
.logo{display:flex;align-items:center;gap:10px;font-weight:900;font-size:17px;letter-spacing:.2px}
.logo img{width:36px;height:36px;border-radius:10px;image-rendering:pixelated;border:1px solid var(--line)}
.nav a.nl{color:var(--txt);opacity:.82;font-size:14px;padding:6px 9px;border-radius:9px}
.nav a.nl:hover,.nav a.nl.on{opacity:1;background:rgba(255,255,255,.07)}
.hero{position:relative;padding:56px 0 26px;text-align:center}
.hero-art{position:relative;border-radius:22px;overflow:hidden;border:1px solid var(--line);box-shadow:var(--shadow);margin-bottom:26px}
.hero-art img{width:100%;height:clamp(210px,36vw,420px);object-fit:cover;display:block}
.hero-art::after{content:'';position:absolute;inset:0;background:linear-gradient(180deg,rgba(5,7,15,.15),rgba(5,7,15,.88))}
.hero-art .cap{position:absolute;inset:auto 0 0 0;padding:22px;z-index:2;text-align:right}
.hero h1{background:linear-gradient(92deg,#fff,var(--pri) 45%,var(--sec));-webkit-background-clip:text;background-clip:text;color:transparent}
.kpi{display:flex;gap:10px;flex-wrap:wrap;justify-content:center}
.kpi .k{padding:10px 16px;border-radius:12px;border:1px solid var(--line);background:rgba(255,255,255,.05);min-width:120px}
.kpi .k b{display:block;font-size:21px}
.mode-card{overflow:hidden;position:relative;transition:.18s;display:flex;flex-direction:column}
.mode-card:hover{transform:translateY(-4px);border-color:color-mix(in srgb,var(--pri) 45%,var(--line))}
.mode-card .art{position:relative;height:132px;overflow:hidden}
.mode-card .art img{width:100%;height:100%;object-fit:cover;transition:.4s}
.mode-card:hover .art img{transform:scale(1.07)}
.mode-card .art::after{content:'';position:absolute;inset:0;background:linear-gradient(180deg,transparent,rgba(5,7,15,.92))}
.mode-card .ico{position:absolute;inset-inline-start:12px;bottom:-24px;width:52px;height:52px;border-radius:13px;
 border:2px solid rgba(255,255,255,.22);object-fit:cover;object-position:center;box-shadow:0 8px 22px rgba(0,0,0,.5);z-index:2;background:#0b1020}
.mode-card .body{padding:30px 14px 14px}
.mode-card .tags{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}
.price{font-size:22px;font-weight:900}
.strike{text-decoration:line-through;color:var(--mut);font-size:13px;font-weight:500}
.off{background:var(--ok);color:#04140a;font-weight:900;border-radius:8px;padding:2px 7px;font-size:12px}
.bar{height:8px;border-radius:99px;background:rgba(255,255,255,.09);overflow:hidden}
.bar>i{display:block;height:100%;background:linear-gradient(90deg,var(--pri),var(--sec))}
.tabs{display:flex;gap:8px;flex-wrap:wrap;margin:14px 0}
.tab{padding:8px 14px;border-radius:10px;border:1px solid var(--line);background:rgba(255,255,255,.04);cursor:pointer;font-size:13.5px}
.tab.on{background:linear-gradient(135deg,var(--pri),var(--sec));color:#060912;font-weight:800;border-color:transparent}
.sec{margin:34px 0}
.toast{position:fixed;bottom:22px;inset-inline-start:22px;z-index:99;display:flex;flex-direction:column;gap:8px}
.toast div{padding:11px 16px;border-radius:12px;background:#0d1424;border:1px solid var(--line);box-shadow:var(--shadow);font-size:13.5px;max-width:330px}
footer{border-top:1px solid var(--line);margin-top:46px;padding:26px 0;color:var(--mut);font-size:13px}
.pixelated{image-rendering:pixelated}
.lock{filter:blur(9px) grayscale(.5);opacity:.55;pointer-events:none;user-select:none}
.wall{position:relative;border-radius:18px;overflow:hidden;border:1px solid var(--line)}
.wall .cover{position:absolute;inset:0;display:grid;place-items:center;background:rgba(5,7,15,.72);backdrop-filter:blur(3px);padding:22px;text-align:center;z-index:2}
.divider{height:1px;background:var(--line);margin:22px 0}
.chip{display:inline-block;padding:4px 9px;border-radius:8px;background:rgba(255,255,255,.07);border:1px solid var(--line);font-size:12px;margin:2px}
.stars{color:var(--acc);letter-spacing:2px}
.row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.between{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap}
.scroll{overflow-x:auto}
@media(max-width:640px){.hero{padding:30px 0 14px}.nav-in{gap:8px}.kpi .k{min-width:96px}}
`;
}

export function page({ title, body, palette = {}, nav = '', footerHtml = '', head = '', scripts = '' }) {
  const p = { primary: '#22d3ee', secondary: '#a855f7', accent: '#fbbf24', ...palette };
  return `<!doctype html>
<html lang="fa" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="theme-color" content="#05070f">
<meta property="og:title" content="${esc(title)}">
<meta property="og:type" content="website">
<meta property="og:image" content="/mc/brand/banner.png">
<link rel="icon" href="/mc/brand/logo.png">
<style>${css(p)}</style>
${head}
</head>
<body>
${nav}
<main class="wrap">${body}</main>
${footerHtml}
<div class="toast" id="toast"></div>
<script>${baseScript}</script>
${scripts}
</body>
</html>`;
}

export const baseScript = `
function toast(msg,ms=2600){const t=document.getElementById('toast');if(!t)return;const d=document.createElement('div');d.textContent=msg;t.appendChild(d);setTimeout(()=>{d.style.opacity='0';d.style.transition='.4s';setTimeout(()=>d.remove(),420)},ms)}
async function copyText(v,msg){try{await navigator.clipboard.writeText(v);toast(msg||'کپی شد ✅')}catch(e){const ta=document.createElement('textarea');ta.value=v;document.body.appendChild(ta);ta.select();document.execCommand('copy');ta.remove();toast(msg||'کپی شد ✅')}}
async function api(path,opt={}){const r=await fetch(path,{headers:{'Content-Type':'application/json'},...opt});let j={};try{j=await r.json()}catch(e){}return{ok:r.ok&&j.ok!==false,status:r.status,data:j}}
document.addEventListener('click',e=>{const b=e.target.closest('[data-copy]');if(b){e.preventDefault();copyText(b.getAttribute('data-copy'),b.getAttribute('data-copy-msg'))}});
`;

/** هدر/ناوبری مشترک */
export function navHtml({ name = 'Nova Edge', active = '', verified = false, phone = '', address = '', online = 0 }) {
  const links = [
    ['/', 'خانه'],
    ['/mc/modes', 'گیم‌مودها'],
    ['/mc/leaderboard', 'لیدربرد'],
    ['/mc/shop', 'فروشگاه'],
    ['/mc/configs', 'کانفیگ رایگان'],
    ['/mc/iran', 'راهنمای نت ایران'],
    ['/mc/status', 'وضعیت سرور'],
  ];
  return `<div class="nav"><div class="nav-in">
  <a class="logo" href="/"><img src="/mc/brand/logo.png" alt="logo" onerror="this.style.display='none'"><span>${esc(name)}</span></a>
  <span class="badge ${online > 0 ? 'ok' : 'warn'}">${online > 0 ? `🟢 ${online} آنلاین` : '⚪ در انتظار اتصال سرور'}</span>
  <div style="flex:1"></div>
  ${links
    .map(([h, l]) => `<a class="nl ${active === h ? 'on' : ''}" href="${h}">${l}</a>`)
    .join('')}
  ${verified ? `<a class="btn sm ghost" href="/mc/account" title="${esc(phone || '')}">👤 حساب من</a>` : `<a class="btn sm pri" href="/mc/auth">ورود / احراز هویت</a>`}
  <a class="btn sm ghost" href="/mc/admin">پنل ادمین</a>
</div></div>`;
}

export function footerHtml({ name = 'Nova Edge', address = '' }) {
  return `<footer><div class="wrap between">
  <div>© ${new Date().getFullYear()} ${esc(name)} — ساخته‌شده با ❤️ برای گیمرهای ایرانی<br>
  <span class="small">Bedrock + Java (کراس‌پلی با Geyser) • ۱۴ گیم‌مود • بات‌های AI تطبیقی</span></div>
  <div class="row small">
    ${address ? `<span class="badge">🌐 ${esc(address)}</span>` : ''}
    <a href="/api/mc/status" class="badge">API وضعیت</a>
    <a href="/mc/report" class="badge">گزارش تخلف</a>
    <a href="/mc/referral" class="badge">دعوت دوستان</a>
    <a href="/mc/terms" class="badge">قوانین</a>
  </div>
</div></footer>`;
}

/** کارت مد با هنر یکپارچه */
export function modeCard(m, { stats = {} } = {}) {
  const art = `/mc/img/${m.id}-banner.jpg`;
  return `<a class="glass mode-card" href="/mc/modes/${m.id}">
  <div class="art"><img src="${art}" alt="${esc(m.name_fa)}" loading="lazy" onerror="this.parentElement.style.background='linear-gradient(135deg,#12203a,#1b1030)'">
    <img class="ico" src="${art}" alt="" loading="lazy" onerror="this.style.display='none'"></div>
  <div class="body">
    <div class="between"><h3 style="margin:0">${esc(m.name_fa)}</h3><span class="badge">${esc(m.name_en)}</span></div>
    <div class="small mut">${esc(m.tagline_fa || '')}</div>
    <div class="tags">
      <span class="badge">👥 ${m.teams?.min_players}–${m.teams?.max_players}</span>
      ${m.match?.duration_sec ? `<span class="badge">⏱ ${Math.round(m.match.duration_sec / 60)} دقیقه</span>` : ''}
      ${m.teams?.count > 1 && m.teams?.size > 1 ? `<span class="badge">🛡 ${m.teams.count}×${m.teams.size}</span>` : ''}
      ${m.teams?.bot_fill ? '<span class="badge">🤖 بات هوشمند</span>' : ''}
      ${stats.played ? `<span class="badge ok">🎮 ${stats.played} مچ ۲۴ ساعت</span>` : ''}
    </div>
  </div>
</a>`;
}

export const rankChip = (r) =>
  `<span class="badge" style="border-color:${r.color}66;color:${r.color};background:${r.color}18">${esc(r.tag || r.name_fa)}</span>`;

export function money(n) {
  return Number(n || 0).toLocaleString('en-US');
}
export function usd(n) {
  return `$${Number(n || 0).toFixed(2)}`;
}
