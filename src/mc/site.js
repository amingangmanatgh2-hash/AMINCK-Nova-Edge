// ═══════════════════════════════════════════════════════════════════
//  Nova Edge — سایت عمومی (خانه، گیم‌مودها، لیدربرد، فروشگاه، کانفیگ‌ها)
//  ⚠️ فروشگاه و محصولات فقط بعد از احراز هویت (OTP) نمایش داده می‌شوند.
// ═══════════════════════════════════════════════════════════════════
import { html, esc } from '../util.js';
import { page, navHtml, footerHtml, modeCard, rankChip, usd, money } from './theme.js';
import { mcGet, mcBool, mcNum, serverConfig, playerByName, pushAlert } from './db.js';
import { publicStatus } from './bridge.js';
import { buildCatalog, itemDto, activeSeason, usdRate } from './catalog.js';
import { configsPublic, subscriptionText, parseConfigUri } from './freeconfigs.js';
import { listModes, getMode, listRanks, getRank, listCosmetics, economySpec, SPECS } from '../../shared/engine/spec.js';
import { rankProgress, levelForXp } from '../../shared/engine/elo.js';
import { sessionFromRequest } from './auth.js';
import { makeBrandQR } from '../qr.js';

const RANK_ORDER = ['free', 'noob', 'normal', 'pro', 'god', 'ultragod'];
/** رنک مؤثر بازیکن = بیشترینِ (رنک فعلی، رنک خریداری‌شده) */
export function rankOf(p, ranks = listRanks()) {
  const idx = Math.max(getRank(p?.rank_id)?.index ?? 0, getRank(p?.rank_bought)?.index ?? 0);
  const id = RANK_ORDER[Math.min(idx, RANK_ORDER.length - 1)] || 'free';
  return (ranks || []).find((r) => r.index === idx) || getRank(id) || (ranks || [])[0];
}
const now = () => Math.floor(Date.now() / 1000);

async function chrome(env, db, { title, body, active = '/', ctx = null, palette = {} }) {
  const cfg = await serverConfig(db);
  const st = await publicStatus(db);
  return page({
    title: `${title} — ${cfg.name}`,
    palette,
    body,
    nav: navHtml({ name: cfg.name, active, verified: !!ctx?.verified, phone: ctx?.auth?.phone_masked || '', address: cfg.address, online: st.online_now }),
    footerHtml: footerHtml({ name: cfg.name, address: cfg.address }),
  });
}

// ───────────────────────── صفحهٔ اصلی ─────────────────────────
export async function homePage(env, db, request) {
  const cfg = await serverConfig(db);
  const st = await publicStatus(db);
  const ranks = listRanks();
  const modes = listModes();
  const season = await activeSeason(db);
  const palette = await brandPalette(db);

  const played24 = await db.prepare('SELECT mode, COUNT(*) c FROM mc_matches WHERE ended_at>? GROUP BY mode').bind(now() - 86400).all();
  const playedMap = Object.fromEntries((played24.results || []).map((r) => [r.mode, r.c]));
  const top = await db.prepare("SELECT username, rating, rp, wins, kills, games, rank_id, rank_bought, level FROM mc_players WHERE banned=0 ORDER BY rating DESC LIMIT 8").all();

  const connectCard = `
  <div class="glass card" style="border-color:${palette.primary}44">
    <h3 style="margin-top:0">🔌 اتصال به سرور</h3>
    <div class="between" style="gap:14px">
      <div>
        <div class="small mut">آدرس سرور (Java و Bedrock)</div>
        <div class="mono" style="font-size:19px;font-weight:800">${esc(cfg.address || '— تنظیم نشده —')}</div>
        <div class="row small mut">
          <span class="badge">☕ Java: ${cfg.portJava}</span>
          <span class="badge">📱 Bedrock: ${cfg.portBedrock}</span>
          <span class="badge ${cfg.crossplay ? 'ok' : ''}">🔀 کراس‌پلی ${cfg.crossplay ? 'فعال (Geyser)' : 'غیرفعال'}</span>
        </div>
      </div>
      <div class="row">
        ${cfg.address ? `<button class="btn pri" data-copy="${esc(cfg.address)}" data-copy-msg="آدرس سرور کپی شد ✅">کپی آدرس</button>` : ''}
        <a class="btn ghost" href="/mc/iran">نت ضعیف/فیلتر؟</a>
      </div>
    </div>
    ${cfg.address ? `<div class="row" style="margin-top:14px"><img src="/mc/qr/address" width="96" height="96" alt="QR" class="pixelated" style="border-radius:10px;border:1px solid var(--line)">
      <div class="small mut">اسکن با موبایل → کپی آدرس / ورود به صفحهٔ اتصال</div></div>` : ''}
  </div>`;

  const body = `
  <section class="hero">
    <div class="hero-art">
      <img src="/mc/brand/banner.png" alt="${esc(cfg.name)}" onerror="this.src='/mc/img/hero.jpg'">
      <div class="cap wrap" style="padding-inline:0">
        <h1>${esc(cfg.name)}</h1>
        <div class="mut" style="max-width:640px">${esc(cfg.tagline)}</div>
      </div>
    </div>
    <div class="kpi">
      <div class="k"><b>${st.online_now}</b><span class="small mut">آنلاین الان</span></div>
      <div class="k"><b>${st.registered_players}</b><span class="small mut">بازیکن ثبت‌شده</span></div>
      <div class="k"><b>${modes.length}</b><span class="small mut">گیم‌مود</span></div>
      <div class="k"><b>${st.matches_24h}</b><span class="small mut">مچ ۲۴ ساعت</span></div>
      <div class="k"><b>${st.bots_24h}</b><span class="small mut">بات AI ۲۴ ساعت</span></div>
      <div class="k"><b>${st.servers.filter((s) => s.online).length}/${st.servers.length || 0}</b><span class="small mut">سرور آنلاین</span></div>
    </div>
  </section>

  <section class="sec">${connectCard}</section>

  ${season ? `<section class="sec glass card" style="border-color:${palette.secondary}55;background:linear-gradient(120deg,${palette.primary}14,${palette.secondary}14)">
    <div class="between"><div><h2 style="margin:0">🎉 ${esc(season.name)}</h2>
      <div class="small mut">تخفیف فصلی تا ${season.promo_pct}٪ روی آیتم‌های انتخابی${season.ends_at ? ` • پایان: ${new Date(season.ends_at * 1000).toLocaleDateString('fa-IR')}` : ''}</div></div>
      <a class="btn gold" href="/mc/shop">دیدن فروشگاه</a></div>
  </section>` : ''}

  <section class="sec">
    <div class="between"><h2>🎮 گیم‌مودها</h2><a class="btn ghost sm" href="/mc/modes">همهٔ ${modes.length} مود →</a></div>
    <div class="grid g4">${modes.map((m) => modeCard(m, { stats: { played: playedMap[m.id] } })).join('')}</div>
  </section>

  <section class="sec">
    <h2>🤖 بات‌های هوشمند تطبیقی</h2>
    <div class="grid g3">
      <div class="glass card"><h3>📈 سطح هوش از روی ELO شما</h3><div class="small mut">وقتی رنک/لول/ELO بازیکنان واقعیِ داخل مچ بالا می‌رود، بات‌ها هم ترفیع می‌گیرند: از مدل سبک (llama-3.2-3b) تا مدل پرو (llama-3.3-70b) برای تاکتیک تیمی و بیلد بهتر.</div>
        <div class="row" style="margin-top:10px">${SPECS.tiers.tiers.map((t) => `<span class="badge">${t.id} — ${esc(t.name_fa)}</span>`).join('')}</div></div>
      <div class="glass card"><h3>🎭 رفتار انسانی</h3><div class="small mut">تأخیر واکنش، خطای نشانه، اشتباه عمدی و خستگی تدریجی — هیچ باتی aim-lock ندارد. هر بات jitter اختصاصی دارد تا دو بات هم‌سطح یکسان رفتار نکنند.</div></div>
      <div class="glass card"><h3>🇮🇷 ضدقطعی</h3><div class="small mut">اگر Workers AI از دسترس خارج شود، بات‌ها روی «درخت رفتار محلی» ادامه می‌دهند؛ بازی هرگز نمی‌خوابد. سقف فراخوانی AI هم برای کنترل هزینه وجود دارد.</div></div>
    </div>
  </section>

  <section class="sec">
    <div class="between"><h2>🏆 برترین‌ها</h2><a class="btn ghost sm" href="/mc/leaderboard">لیدربرد کامل →</a></div>
    <div class="glass card scroll">
      ${top.results?.length ? `<table><thead><tr><th>#</th><th>بازیکن</th><th>رنک</th><th>ELO</th><th>لول</th><th>برد</th><th>Kill</th><th>مچ</th></tr></thead><tbody>
        ${top.results.map((p, i) => { const r = rankOf(p, ranks);
          return `<tr><td>${i + 1}</td><td><a href="/mc/player/${encodeURIComponent(p.username)}">${esc(p.username)}</a></td><td>${rankChip(r)}</td><td><b>${p.rating}</b></td><td>${p.level}</td><td>${p.wins}</td><td>${p.kills}</td><td>${p.games}</td></tr>`; }).join('')}
      </tbody></table>` : `<div class="mut">هنوز مچی ثبت نشده. بعد از اولین بازی‌ها، این جدول پر می‌شود.</div>`}
    </div>
  </section>

  <section class="sec">
    <h2>🎖 نردبان رنک</h2>
    <div class="grid g6">${ranks.map((r) => `<div class="glass card" style="text-align:center;border-color:${r.color}44">
      <img src="/mc/img/rank-${r.id}.png" width="62" height="62" alt="" class="pixelated" style="border-radius:12px" onerror="this.style.display='none'">
      <div style="color:${r.color};font-weight:900">${esc(r.name_fa)}</div>
      <div class="small mut">${r.tag || 'بدون تگ'}</div>
      <div class="small">RP: ${money(r.rp_required)}</div>
      <div class="small">${r.price_usd ? usd(r.price_usd) : 'رایگان'}</div>
      <div class="small mut">بات‌ها ≥ ${r.bot_min_tier}</div>
    </div>`).join('')}</div>
    <div class="small mut" style="margin-top:10px">رنک‌ها با امتیاز داخل بازی به‌صورت خودکار ارتقا پیدا می‌کنند و قابل خرید هم هستند. رنک بالاتر = سطح هوش بالاتر بات‌های رقیب.</div>
  </section>

  <section class="sec" id="configs-teaser"></section>
  <script>fetch('/api/mc/configs').then(r=>r.json()).then(async d=>{const el=document.getElementById('configs-teaser');if(!el||!d.ok)return;
   el.innerHTML='<h2>🛰 کانفیگ رایگان و نامحدود</h2><div class="glass card"><div class="between"><div><div class="small mut">برای جاهایی که آنتن نمی‌ده یا نت ملی است</div><div class="row" style="margin-top:8px"><span class="badge">'+d.count+' کانفیگ</span><span class="badge ok">'+d.healthy_count+' سالم</span><span class="badge">'+d.unlimited_count+' نامحدود</span></div>'+(d.notice?'<div class="small warn" style="margin-top:10px;color:#fcd34d">'+d.notice+'</div>':'')+'</div><a class="btn pri" href="/mc/configs">دریافت کانفیگ</a></div></div>';}).catch(()=>{});</script>

  <section class="sec glass card">
    <h2 style="margin-top:0">💎 فروشگاه</h2>
    <div class="small mut">رنک، کازمتیک (بال، کلاه، کیپ، افکت کشتن، افکت پرتال، رنگ نیک‌نیم، تگ چت)، باندل و جم. همهٔ قیمت‌ها به دلار و مقرون‌به‌صرفه — با تخفیف هوشمند تا سقف ۳۰٪ بر اساس دادهٔ واقعی خرید.</div>
    <div class="row" style="margin-top:12px"><a class="btn pri" href="/mc/shop">ورود به فروشگاه</a><a class="btn ghost" href="/mc/auth">احراز هویت با موبایل</a></div>
    <div class="small mut" style="margin-top:8px">🔒 برای جلوگیری از اسپم و حساب جعلی، نمایش محصولات فقط بعد از تأیید شمارهٔ موبایل انجام می‌شود.</div>
  </section>`;

  return html(await chrome(env, db, { title: 'سرور خدای ماینکرفت', body, palette }));
}

async function brandPalette(db) {
  const theme = await mcGet(db, 'brand_theme', '');
  try {
    const p = JSON.parse(theme)?.palette;
    if (Array.isArray(p) && p.length >= 2) return { primary: p[0], secondary: p[1] || p[0], accent: p[2] || '#fbbf24' };
  } catch {}
  return { primary: '#22d3ee', secondary: '#a855f7', accent: '#fbbf24' };
}

// ───────────────────────── گیم‌مودها ─────────────────────────
export async function modesPage(env, db, request) {
  const modes = listModes();
  const rows = await db.prepare('SELECT mode, COUNT(*) c, SUM(humans) h, SUM(bots) b FROM mc_matches GROUP BY mode').all();
  const stats = Object.fromEntries((rows.results || []).map((r) => [r.mode, r]));
  const cats = [...new Set(modes.map((m) => m.category))];
  const body = `<h1>🎮 گیم‌مودها</h1>
  <div class="mut">۱۴ گیم‌مود کامل با سیستم امتیازدهی، رنک و اقتصاد داخلی. در همهٔ مودها بات‌های تطبیقی جای خالی را پر می‌کنند.</div>
  ${cats.map((c) => `<section class="sec"><h2>${catName(c)}</h2><div class="grid g4">${modes.filter((m) => m.category === c).map((m) => modeCard(m, { stats: { played: stats[m.id]?.c } })).join('')}</div></section>`).join('')}`;
  return html(await chrome(env, db, { title: 'گیم‌مودها', body, active: '/mc/modes', palette: await brandPalette(db) }));
}

const catName = (c) => ({ team: '🛡 تیمی', ffa: '⚔ هرکس برای خودش', social: '🎭 اجتماعی/استنتاجی', race: '🏁 مسابقه‌ای', creative: '🎨 خلاقانه', coop: '🤝 همکاری', duel: '🥊 دوئل', persistent: '🌍 دنیای پایدار' }[c] || c);

export async function modeDetailPage(env, db, modeId) {
  const m = getMode(modeId);
  if (!m) return html('<div class="wrap"><h2>مود پیدا نشد</h2><a class="btn" href="/mc/modes">بازگشت</a></div>', 404);
  const rows = await db.prepare('SELECT COUNT(*) c, AVG(duration_sec) d, SUM(humans) h, SUM(bots) b, AVG(ai_calls) ai FROM mc_matches WHERE mode=?').bind(m.id).first();
  const top = await db.prepare("SELECT mp.player_id, p.username, SUM(mp.points) pts, SUM(mp.kills) k, COUNT(*) games FROM mc_match_players mp JOIN mc_players p ON p.id=mp.player_id WHERE mp.is_bot=0 AND mp.match_id IN (SELECT id FROM mc_matches WHERE mode=?) GROUP BY mp.player_id ORDER BY pts DESC LIMIT 10").bind(m.id).all();
  const palette = await brandPalette(db);
  const body = `
  <div class="hero-art" style="margin-top:18px"><img src="/mc/img/${m.id}-banner.jpg" alt="${esc(m.name_fa)}">
    <div class="cap wrap" style="padding-inline:0"><h1 style="margin:0">${esc(m.name_fa)} <span class="badge">${esc(m.name_en)}</span></h1>
    <div class="mut">${esc(m.tagline_fa)}</div></div></div>
  <div class="grid g2 sec">
    <div class="glass card"><h3>⚙️ قوانین مچ</h3>
      <div class="row small">
        <span class="badge">👥 ${m.teams.min_players} تا ${m.teams.max_players} بازیکن</span>
        ${m.teams.count > 1 ? `<span class="badge">🛡 ${m.teams.count} تیم ${m.teams.size} نفره</span>` : '<span class="badge">🧍 FFA</span>'}
        ${m.match.duration_sec ? `<span class="badge">⏱ ${Math.round(m.match.duration_sec / 60)} دقیقه</span>` : '<span class="badge">♾ بدون زمان</span>'}
        <span class="badge">📈 K-factor: ${m.match.elo_k}</span>
        ${m.teams.bot_fill ? '<span class="badge ok">🤖 پرشدن با بات</span>' : ''}
        ${m.match.sudden_death ? `<span class="badge warn">💥 مرگ ناگهانی: ${esc(String(m.match.sudden_death))}</span>` : ''}
      </div>
      <div class="divider"></div>
      <h3>🧮 جدول امتیاز</h3>
      <div class="scroll"><table><thead><tr><th>رویداد</th><th>امتیاز</th><th>سکه</th></tr></thead><tbody>
        ${Object.entries(m.scoring).map(([k, v]) => `<tr><td>${esc(scoreLabel(k))}</td><td>${v > 0 ? '+' : ''}${v}</td><td>${m.economy?.[k] != null ? (m.economy[k] > 0 ? '+' : '') + m.economy[k] : '—'}</td></tr>`).join('')}
      </tbody></table></div>
    </div>
    <div>
      ${(m.kits?.length ? `<div class="glass card"><h3>🎒 کیت‌ها</h3>${m.kits.map((k) => `<div class="between" style="padding:7px 0;border-bottom:1px solid var(--line)"><span>${esc(k.id)}</span><span class="badge">${k.price_coins ? money(k.price_coins) + ' سکه' : 'رایگان'}</span></div>`).join('')}</div>` : '')}
      ${(m.shop?.length ? `<div class="glass card" style="margin-top:16px"><h3>🛒 فروشگاه داخل بازی</h3><div class="row">${m.shop.map((s) => `<span class="chip">${esc(s.id)} • ${Object.entries(s.cost).map(([k, v]) => `${v} ${k}`).join(' + ')}</span>`).join('')}</div></div>` : '')}
      ${(m.team_upgrades?.length ? `<div class="glass card" style="margin-top:16px"><h3>⬆️ ارتقاهای تیمی</h3><div class="row">${m.team_upgrades.map((u) => `<span class="chip">${esc(u.id)} (${u.levels})</span>`).join('')}</div></div>` : '')}
      <div class="glass card" style="margin-top:16px"><h3>🗺 نقشه‌ها</h3><div class="row">${(m.maps || []).map((x) => `<span class="chip">${esc(x.name_fa)}</span>`).join('')}</div></div>
      <div class="glass card" style="margin-top:16px"><h3>🤖 رفتار بات‌ها در این مود</h3>
        <div class="row">${Object.entries(m.bot?.weights || {}).map(([k, v]) => `<span class="chip">${esc(k)}: ${Math.round(v * 100)}٪</span>`).join('')}</div>
        <div class="small mut" style="margin-top:8px">نقش‌ها: ${(m.bot?.roles || []).map((r) => esc(r)).join('، ')}</div>
        <div class="small mut">فاصلهٔ مشورت با مدل AI: ${Object.entries(m.bot?.llm_interval_sec || {}).map(([k, v]) => `${k}=${v || '—'}s`).join(' • ')}</div>
        ${m.bot?.note ? `<div class="small" style="margin-top:8px;color:#a5f3fc">${esc(m.bot.note)}</div>` : ''}
      </div>
    </div>
  </div>
  <section class="sec glass card">
    <h3 style="margin-top:0">📊 آمار زندهٔ این مود</h3>
    <div class="kpi" style="justify-content:flex-start">
      <div class="k"><b>${Number(rows?.c) || 0}</b><span class="small mut">مچ ثبت‌شده</span></div>
      <div class="k"><b>${rows?.h || 0}</b><span class="small mut">بازیکن واقعی</span></div>
      <div class="k"><b>${rows?.b || 0}</b><span class="small mut">بات AI</span></div>
      <div class="k"><b>${Math.round(Number(rows?.d) || 0)}</b><span class="small mut">میانگین ثانیه</span></div>
      <div class="k"><b>${Math.round(Number(rows?.ai) || 0)}</b><span class="small mut">فراخوانی AI/مچ</span></div>
    </div>
    ${top.results?.length ? `<div class="divider"></div><table><thead><tr><th>#</th><th>بازیکن</th><th>امتیاز</th><th>کیل</th><th>مچ</th></tr></thead><tbody>
      ${top.results.map((r, i) => `<tr><td>${i + 1}</td><td><a href="/mc/player/${encodeURIComponent(r.username)}">${esc(r.username)}</a></td><td>${money(r.pts)}</td><td>${r.k}</td><td>${r.games}</td></tr>`).join('')}
    </tbody></table>` : ''}
  </section>`;
  return html(await chrome(env, db, { title: m.name_fa, body, active: '/mc/modes', palette }));
}

const scoreLabel = (k) =>
  ({ win: 'برد', lose: 'باخت', kill: 'کشتن', death: 'مرگ', final_kill: 'کشتن نهایی', final_death: 'مرگ نهایی', bed_break: 'شکستن تخت', bed_defend: 'دفاع از تخت', resource_collected: 'جمع‌آوری منبع', purchase: 'خرید', team_upgrade: 'ارتقای تیم', assist: 'کمک در کشتن', mvp_bonus: 'جایزهٔ MVP', survive_min: 'بقا (هر دقیقه)', chest_looted: 'غارت صندوق', goal: 'گل', player_eliminated: 'حذف حریف', blocks_broken: 'بلوک شکسته', blocks_placed: 'بلوک گذاشته', checkpoint: 'چک‌پوینت', fall: 'سقوط', finish: 'پایان مسیر', speed_bonus_max: 'جایزهٔ سرعت', vote_received: 'رای دریافتی', theme_match_bonus: 'هماهنگی با تم', gold_collected: 'طلای جمع‌شده', innocent_survive: 'بقای بی‌گناه', murderer_win: 'برد قاتل', detective_kill_murderer: 'کشتن قاتل توسط کارآگاه', wave_cleared: 'پاک‌سازی موج', revive: 'احیای یار', door_built: 'ساخت در', diamond_mined: 'الماس استخراج‌شده', gold_mined: 'طلای استخراج‌شده', apple_eaten: 'خوردن سیب', chunk_claimed: 'ادعای چانک', raid_success: 'غارت موفق', raid_defend: 'دفاع از ادعا', power_gained: 'کسب قدرت', killstreak_5: 'استریک ۵', killstreak_10: 'استریک ۱۰', streak_bonus: 'پاداش استریک', perfect_win_bonus: 'برد بی‌نقص' }[k] || k);

// ───────────────────────── لیدربرد ─────────────────────────
export async function leaderboardPage(env, db, request, url) {
  const board = url.searchParams.get('b') || 'rating';
  const modeId = url.searchParams.get('mode') || '';
  const enabled = await mcBool(db, 'leaderboard_enabled', true);
  if (!enabled) return html(await chrome(env, db, { title: 'لیدربرد', body: '<h1>لیدربرد</h1><div class="glass card mut">لیدربرد توسط ادمین غیرفعال شده است.</div>', active: '/mc/leaderboard' }));

  let rows = [];
  let cols = [];
  if (modeId && getMode(modeId)) {
    rows = (await db.prepare("SELECT p.username, p.rating, p.level, p.rank_id, p.rank_bought, SUM(mp.points) pts, SUM(mp.kills) kills, SUM(mp.mvp) mvps, COUNT(*) games, SUM(mp.won) wins FROM mc_match_players mp JOIN mc_players p ON p.id=mp.player_id JOIN mc_matches m ON m.id=mp.match_id WHERE m.mode=? AND mp.is_bot=0 GROUP BY mp.player_id ORDER BY pts DESC LIMIT 50").bind(modeId).all()).results || [];
    cols = [['pts', 'امتیاز'], ['wins', 'برد'], ['kills', 'کیل'], ['mvps', 'MVP'], ['games', 'مچ']];
  } else if (board === 'wins') {
    rows = (await db.prepare('SELECT username, rating, level, rank_id, rank_bought, wins, kills, deaths, games, rp FROM mc_players WHERE banned=0 ORDER BY wins DESC, rating DESC LIMIT 50').all()).results || [];
    cols = [['wins', 'برد'], ['games', 'مچ'], ['kills', 'کیل'], ['rating', 'ELO']];
  } else if (board === 'kills') {
    rows = (await db.prepare('SELECT username, rating, level, rank_id, rank_bought, wins, kills, deaths, games, rp FROM mc_players WHERE banned=0 ORDER BY kills DESC LIMIT 50').all()).results || [];
    cols = [['kills', 'کیل'], ['deaths', 'مرگ'], ['wins', 'برد'], ['games', 'مچ']];
  } else if (board === 'rp') {
    rows = (await db.prepare('SELECT username, rating, level, rank_id, rank_bought, wins, kills, deaths, games, rp FROM mc_players WHERE banned=0 ORDER BY rp DESC LIMIT 50').all()).results || [];
    cols = [['rp', 'RP'], ['rating', 'ELO'], ['wins', 'برد'], ['games', 'مچ']];
  } else {
    rows = (await db.prepare('SELECT username, rating, level, rank_id, rank_bought, wins, kills, deaths, games, rp FROM mc_players WHERE banned=0 ORDER BY rating DESC LIMIT 50').all()).results || [];
    cols = [['rating', 'ELO'], ['level', 'لول'], ['wins', 'برد'], ['kills', 'کیل'], ['games', 'مچ']];
  }
  const ranks = listRanks();
  const tabs = [
    ['rating', '🏅 ELO'], ['wins', '🏆 برد'], ['kills', '⚔ کیل'], ['rp', '🎖 Rank Points'],
  ];
  const modeTabs = listModes().map((m) => [`/mc/leaderboard?mode=${m.id}`, m.name_fa]);
  const body = `<h1>🏆 لیدربرد آنلاین</h1>
  <div class="tabs">${tabs.map(([b, l]) => `<a class="tab ${!modeId && board === b ? 'on' : ''}" href="/mc/leaderboard?b=${b}">${l}</a>`).join('')}</div>
  <div class="tabs small">${modeTabs.map(([h, l]) => `<a class="tab ${modeId === h.split('mode=')[1] ? 'on' : ''}" href="${h}">${esc(l)}</a>`).join('')}</div>
  <div class="glass card scroll">
    ${rows.length ? `<table><thead><tr><th>#</th><th>بازیکن</th><th>رنک</th>${cols.map((c) => `<th>${c[1]}</th>`).join('')}</tr></thead><tbody>
      ${rows.map((r, i) => { const idx = Math.max(getRank(r.rank_id)?.index || 0, getRank(r.rank_bought)?.index || 0); const rk = ranks.find((x) => x.index === idx) || ranks[0];
        return `<tr><td>${i < 3 ? ['🥇', '🥈', '🥉'][i] : i + 1}</td>
        <td><a href="/mc/player/${encodeURIComponent(r.username)}">${esc(r.username)}</a></td>
        <td>${rankChip(rk)}</td>${cols.map((c) => `<td>${money(r[c[0]] ?? 0)}</td>`).join('')}</tr>`; }).join('')}
    </tbody></table>` : '<div class="mut">داده‌ای نیست — بعد از اولین مچ‌ها پر می‌شود.</div>'}
  </div>
  <div class="small mut" style="margin-top:10px">به‌روزرسانی زنده از گزارش مچ پلاگین‌ها (Java و Bedrock). بازیکنان بن‌شده از جدول حذف می‌شوند.</div>`;
  return html(await chrome(env, db, { title: 'لیدربرد', body, active: '/mc/leaderboard', palette: await brandPalette(db) }));
}

// ───────────────────────── پروفایل بازیکن ─────────────────────────
export async function playerPage(env, db, username) {
  const p = await playerByName(db, username);
  if (!p) return html(await chrome(env, db, { title: 'بازیکن', body: `<h1>بازیکن پیدا نشد</h1><div class="glass card mut">«${esc(username)}» در پایگاه داده ثبت نشده. ابتدا یک بار به سرور وصل شوید.</div>` }));
  const ranks = listRanks();
  const idx = Math.max(getRank(p.rank_id)?.index || 0, getRank(p.rank_bought)?.index || 0);
  const rank = ranks.find((r) => r.index === idx) || ranks[0];
  const prog = rankProgress(ranks, p.rp);
  const recent = (await db.prepare('SELECT m.mode, m.ended_at, mp.points, mp.elo_delta, mp.won, mp.mvp, mp.placement, mp.kills, mp.deaths FROM mc_match_players mp JOIN mc_matches m ON m.id=mp.match_id WHERE mp.player_id=? ORDER BY m.ended_at DESC LIMIT 15').bind(p.id).all()).results || [];
  const perMode = Object.entries(safeJson(p.rating_modes)).map(([k, v]) => ({ mode: getMode(k), rating: v })).filter((x) => x.mode);
  const cosmetics = safeJson(p.cosmetics).map((id) => listCosmetics().find((c) => c.id === id)).filter(Boolean);
  const body = `
  <section class="sec">
    <div class="glass card" style="border-color:${rank.color}55">
      <div class="between">
        <div><h1 style="margin:0">${esc(p.username)} ${rankChip(rank)}</h1>
          <div class="row small mut"><span class="badge">${p.platform === 'bedrock' ? '📱 Bedrock' : '☕ Java'}</span>
          <span class="badge">لول ${p.level}</span><span class="badge">ELO ${p.rating}</span><span class="badge">RP ${money(p.rp)}</span>
          <span class="badge">🪙 ${money(p.coins)}</span><span class="badge">💎 ${money(p.gems)}</span>
          ${p.banned ? `<span class="badge bad">🚫 بن: ${esc(p.ban_reason || '')}</span>` : ''}</div>
          ${prog.next ? `<div style="max-width:420px;margin-top:12px"><div class="small mut">تا رنک ${esc(getRank(prog.next)?.name_fa || prog.next)}: ${money(prog.remaining_rp)} RP</div><div class="bar" style="margin-top:6px"><i style="width:${prog.pct}%"></i></div></div>` : '<div class="small ok" style="margin-top:10px">👑 بالاترین رنک ممکن</div>'}
        </div>
        <img src="/mc/img/rank-${rank.id}.png" width="96" height="96" class="pixelated" alt="" style="border-radius:16px" onerror="this.style.display='none'">
      </div>
      <div class="divider"></div>
      <div class="kpi" style="justify-content:flex-start">
        <div class="k"><b>${p.games}</b><span class="small mut">مچ</span></div>
        <div class="k"><b>${p.wins}</b><span class="small mut">برد</span></div>
        <div class="k"><b>${p.games ? Math.round((p.wins / p.games) * 100) : 0}٪</b><span class="small mut">نرخ برد</span></div>
        <div class="k"><b>${p.kills}</b><span class="small mut">کیل</span></div>
        <div class="k"><b>${p.deaths}</b><span class="small mut">مرگ</span></div>
        <div class="k"><b>${p.deaths ? (p.kills / p.deaths).toFixed(2) : p.kills}</b><span class="small mut">K/D</span></div>
        <div class="k"><b>${money(p.score_total)}</b><span class="small mut">امتیاز کل</span></div>
      </div>
    </div>
  </section>
  <div class="grid g2">
    <div class="glass card"><h3>🎯 ELO به تفکیک مود</h3>
      ${perMode.length ? `<table><thead><tr><th>مود</th><th>ELO</th></tr></thead><tbody>${perMode.sort((a, b) => b.rating - a.rating).map((x) => `<tr><td><a href="/mc/modes/${x.mode.id}">${esc(x.mode.name_fa)}</a></td><td><b>${Math.round(x.rating)}</b></td></tr>`).join('')}</tbody></table>` : '<div class="mut">هنوز مچی در این حساب ثبت نشده.</div>'}
    </div>
    <div class="glass card"><h3>🕘 آخرین مچ‌ها</h3>
      ${recent.length ? `<table><thead><tr><th>مود</th><th>نتیجه</th><th>امتیاز</th><th>ELO</th><th>K/D</th></tr></thead><tbody>
        ${recent.map((r) => `<tr><td>${esc(getMode(r.mode)?.name_fa || r.mode)}</td><td>${r.mvp ? '🌟 MVP ' : ''}${r.won ? '<span class="badge ok">برد</span>' : `<span class="badge bad">باخت${r.placement ? ' #' + r.placement : ''}</span>`}</td><td>${money(r.points)}</td><td style="color:${r.elo_delta >= 0 ? '#86efac' : '#fca5a5'}">${r.elo_delta >= 0 ? '+' : ''}${r.elo_delta}</td><td>${r.kills}/${r.deaths}</td></tr>`).join('')}
      </tbody></table>` : '<div class="mut">مچی ثبت نشده.</div>'}
    </div>
  </div>
  ${cosmetics.length ? `<section class="sec glass card"><h3>✨ کازمتیک‌های داشته</h3><div class="row">${cosmetics.map((c) => `<span class="chip">${esc(c.name_fa)}</span>`).join('')}</div></section>` : ''}`;
  return html(await chrome(env, db, { title: p.username, body, palette: await brandPalette(db) }));
}

const safeJson = (v, fb = {}) => {
  try {
    return JSON.parse(v || '') ?? fb;
  } catch {
    return fb;
  }
};

// ───────────────────────── احراز هویت ─────────────────────────
export async function authPage(env, db, request, ctx) {
  if (ctx?.verified) {
    return html(await chrome(env, db, {
      title: 'حساب من',
      active: '/mc/auth',
      body: `<h1>👤 حساب من</h1><div class="glass card"><div class="row"><span class="badge ok">✅ شمارهٔ ${esc(ctx.auth?.phone_masked || '')} تأیید شده</span></div>
      <div class="divider"></div><div class="row"><a class="btn pri" href="/mc/shop">ورود به فروشگاه</a>
      <button class="btn ghost" id="linkBtn">اتصال به نام کاربری ماینکرفت</button>
      <button class="btn ghost" id="logoutBtn">خروج از نشست</button></div>
      <div id="linkBox" style="display:none;margin-top:16px"><label>نام کاربری ماینکرفت (Java یا Bedrock)</label>
        <div class="row"><input id="mcName" placeholder="مثلاً Notch" maxlength="32"><button class="btn pri" id="doLink">اتصال</button></div>
        <div class="small mut" style="margin-top:8px">با اتصال، خریدها (رنک/کازمتیک/جم) به‌صورت خودکار روی همان نام در سرور فعال می‌شوند.</div></div>
      <div class="divider"></div><div id="profile"></div></div>
      <script>
      document.getElementById('linkBtn').onclick=()=>{const b=document.getElementById('linkBox');b.style.display=b.style.display==='none'?'block':'none'};
      document.getElementById('doLink').onclick=async()=>{const n=document.getElementById('mcName').value.trim();if(!n)return toast('نام را وارد کنید');
        const r=await api('/api/mc/account/link',{method:'POST',body:JSON.stringify({username:n})});toast(r.data.message||r.data.error||(r.ok?'اتصال انجام شد':'خطا'));if(r.ok)loadProfile()};
      document.getElementById('logoutBtn').onclick=async()=>{await api('/api/mc/auth/logout',{method:'POST'});location.href='/'};
      async function loadProfile(){const r=await api('/api/mc/account/profile');const el=document.getElementById('profile');if(!r.data.player){el.innerHTML='<div class="mut">هنوز نام ماینکرفتی متصل نشده.</div>';return}
        const p=r.data.player;el.innerHTML='<h3>پروفایل سرور</h3><div class="row"><span class="badge">'+p.username+'</span><span class="badge">رنک: '+p.rank.name_fa+'</span><span class="badge">ELO '+p.rating+'</span><span class="badge">لول '+p.level+'</span><span class="badge">🪙 '+p.coins+'</span><span class="badge">💎 '+p.gems+'</span></div><div class="small mut">کد دعوت شما: <b class="mono">'+(p.referral_code||'—')+'</b></div>'}
      loadProfile();
      </script>`,
      palette: await brandPalette(db),
    }));
  }
  const body = `<h1>🔐 احراز هویت</h1>
  <div class="grid g2 sec">
    <div class="glass card">
      <h3 style="margin-top:0">ورود با شمارهٔ موبایل</h3>
      <div class="small mut">برای دیدن فروشگاه (رنک، کازمتیک، کانفیگ‌ها) باید شمارهٔ موبایل خود را تأیید کنید. این کار جلوی اسپم و حساب‌های جعلی را می‌گیرد.</div>
      <div id="step1">
        <label>شمارهٔ موبایل</label>
        <input id="phone" inputmode="numeric" placeholder="09123456789" maxlength="14">
        <div class="row" style="margin-top:12px"><button class="btn pri" id="sendBtn">📨 ارسال کد تأیید</button></div>
        <div class="small mut" id="notice" style="margin-top:10px"></div>
      </div>
      <div id="step2" style="display:none">
        <label>کد ۶ رقمی ارسال‌شده به <b id="masked"></b></label>
        <input id="code" inputmode="numeric" placeholder="123456" maxlength="6" style="letter-spacing:8px;text-align:center;font-size:22px">
        <div class="row" style="margin-top:12px">
          <button class="btn pri" id="verifyBtn">✅ تأیید کد</button>
          <button class="btn ghost" id="backBtn">ویرایش شماره</button>
        </div>
        <div class="small mut" id="resend" style="margin-top:10px"></div>
      </div>
    </div>
    <div>
      <div class="glass card"><h3 style="margin-top:0">چرا احراز هویت؟</h3>
        <ul class="small mut" style="padding-inline-start:18px">
          <li>هر شماره = یک هویت؛ جلوی ساخت حساب‌های فیک گرفته می‌شود</li>
          <li>اگر از یک IP چند حساب ساخته شود، به ادمین هشدار می‌رود</li>
          <li>پرداخت‌ها (درگاه/کارت‌به‌کارت) به همین هویت گره می‌خورد</li>
          <li>خرید شما روی نام کاربری ماینکرفت‌تان فعال می‌شود</li>
        </ul>
      </div>
      <div class="glass card" style="margin-top:16px"><h3 style="margin-top:0">📲 روش دریافت کد</h3>
        <div class="small mut" id="providerInfo">در حال بارگذاری…</div>
      </div>
    </div>
  </div>
  <script>
  const $=id=>document.getElementById(id);
  let devCode='';
  async function providerInfo(){const r=await api('/api/mc/auth/provider');$('providerInfo').innerHTML=r.data.html||'';}
  providerInfo();
  $('sendBtn').onclick=async()=>{
    const phone=$('phone').value.trim();
    $('sendBtn').disabled=true;$('sendBtn').textContent='در حال ارسال…';
    const r=await api('/api/mc/auth/send',{method:'POST',body:JSON.stringify({phone})});
    $('sendBtn').disabled=false;$('sendBtn').textContent='📨 ارسال کد تأیید';
    if(!r.ok){toast(r.data.error||'خطا');$('notice').innerHTML='<span style="color:#fca5a5">'+(r.data.error||'')+'</span>'+(r.data.resend_in?' (تا '+r.data.resend_in+' ثانیهٔ دیگر می‌توانید دوباره درخواست دهید)':'');return}
    $('masked').textContent=r.data.masked||'';
    $('step1').style.display='none';$('step2').style.display='block';
    if(r.data.dev_code){devCode=r.data.dev_code;$('notice').innerHTML='';$('resend').innerHTML='<span class="badge warn">حالت تست: کد شما '+r.data.dev_code+'</span>';$('code').value=r.data.dev_code}
    let left=90;const t=setInterval(()=>{left--;if(left<=0){clearInterval(t);if(!devCode)$('resend').innerHTML='<a href="#" id="re">ارسال مجدد کد</a>';return}if(!devCode)$('resend').textContent='ارسال مجدد کد تا '+left+' ثانیهٔ دیگر'},1000);
  };
  $('backBtn').onclick=()=>$('step1').style.display='block',$('step2').style.display='none';
  $('verifyBtn').onclick=async()=>{
    const r=await api('/api/mc/auth/verify',{method:'POST',body:JSON.stringify({phone:$('phone').value.trim(),code:$('code').value.trim()})});
    if(!r.ok){toast(r.data.error||'کد نامعتبر');return}
    toast('تأیید شد ✅ در حال انتقال به فروشگاه…');
    setTimeout(()=>location.href=r.data.redirect||'/mc/shop',700);
  };
  </script>`;
  return html(await chrome(env, db, { title: 'احراز هویت', body, active: '/mc/auth', palette: await brandPalette(db) }));
}

// ───────────────────────── فروشگاه (قفل‌شده تا احراز هویت) ─────────────────────────
export async function shopPage(env, db, request, ctx, url) {
  const palette = await brandPalette(db);
  if (!(await mcBool(db, 'shop_enabled', true))) {
    return html(await chrome(env, db, { title: 'فروشگاه', body: '<h1>🛍 فروشگاه</h1><div class="glass card mut">فروشگاه موقتاً غیرفعال است.</div>', active: '/mc/shop', palette }));
  }
  if (!ctx?.verified) {
    // ⛔ محصولات نشان داده نمی‌شوند — فقط دیوار احراز هویت
    const preview = rawPreviewItems();
    return html(await chrome(env, db, {
      title: 'فروشگاه',
      active: '/mc/shop',
      palette,
      body: `<h1>🛍 فروشگاه</h1>
      <div class="glass card" style="border-color:#f59e0b55"><div class="between">
        <div><h3 style="margin:0">🔒 برای دیدن محصولات، احراز هویت لازم است</h3>
        <div class="small mut">شمارهٔ موبایل خود را تأیید کنید تا رنک‌ها، کازمتیک‌ها، باندل‌ها و کانفیگ‌های ویژه نمایش داده شوند.<br>هدف: جلوگیری از اسپم، حساب فیک و خرید رباتیک.</div></div>
        <a class="btn pri" href="/mc/auth?next=/mc/shop">🔐 احراز هویت با موبایل</a>
      </div></div>
      <div class="wall" style="margin-top:22px">
        <div class="grid g4 lock" style="padding:16px" aria-hidden="true">${preview.map((p) => `<div class="glass card"><div class="row between"><b>${esc(p.t)}</b><span class="badge">${esc(p.c)}</span></div><div class="price">—</div><div class="small mut">${esc(p.d)}</div></div>`).join('')}</div>
        <div class="cover"><div><div style="font-size:38px">🔒</div><h2>محصولات قفل هستند</h2>
        <div class="mut small">پس از تأیید شمارهٔ موبایل، قیمت‌ها و تخفیف‌های هوشمند نمایش داده می‌شوند.</div>
        <a class="btn pri" href="/mc/auth?next=/mc/shop" style="margin-top:14px">ورود / ثبت شماره</a></div></div>
      </div>`,
    }));
  }

  const cat = await buildCatalog({ env, db, userKey: ctx.phone_key, totalSpentUsd: ctx.total_spent_usd || 0 });
  const groups = {
    rank: { title: '🎖 رنک‌ها', items: [] },
    cosmetic: { title: '✨ کاستومایز (بال، کلاه، کیپ، افکت، رنگ نیک، تگ چت)', items: [] },
    bundle: { title: '📦 باندل‌های تخفیفی', items: [] },
    gems: { title: '💎 جم', items: [] },
    season: { title: '🎉 ایونت فصلی', items: [] },
    config: { title: '🛰 کانفیگ اتصال', items: [] },
  };
  for (const i of cat.items) (groups[i.type] || groups.cosmetic).items.push(i);
  const tab = url.searchParams.get('tab') || 'rank';
  const rate = cat.rate;

  const cardHtml = (i) => {
    const d = itemDto(i);
    const disc = i.pct || 0;
    const canBuy = rate.rate > 0;
    return `<div class="glass card" data-item="${esc(d.id)}">
      <div class="between">
        <div><b>${esc(d.title_fa)}</b><div class="small mut">${esc(d.title_en)}</div></div>
        ${d.color ? `<span class="badge" style="color:${d.color};border-color:${d.color}66">${esc(d.tag || '')}</span>` : ''}
        ${d.slot ? `<span class="badge">${esc(slotName(d.slot))}</span>` : ''}
        ${d.rank_min && d.rank_min !== 'free' ? `<span class="badge">حداقل رنک ${esc(getRank(d.rank_min)?.name_fa || d.rank_min)}</span>` : ''}
      </div>
      ${d.art ? `<img src="${d.art}" width="100%" height="110" style="object-fit:cover;border-radius:11px;margin:10px 0" loading="lazy" onerror="this.style.display='none'">` : ''}
      ${d.perks_fa?.length ? `<div class="small mut">${d.perks_fa.map((p) => '• ' + esc(p)).join('<br>')}</div>` : ''}
      ${d.items?.length ? `<div class="row small">${d.items.map((x) => `<span class="chip">${esc(x)}</span>`).join('')}</div>` : ''}
      <div class="divider" style="margin:12px 0"></div>
      <div class="between">
        <div>
          ${disc > 0 ? `<div class="row"><span class="off">${disc}٪ تخفیف</span><span class="strike">${usd(d.list_usd)}</span></div>` : ''}
          <div class="price">${usd(d.price_usd)}</div>
          <div class="small mut">${rate.rate ? `≈ ${money(i.price_toman)} تومان` : '<span style="color:#fcd34d">نرخ دلار در دسترس نیست — خرید درگاه موقتاً بسته</span>'}</div>
          ${d.price_coins ? `<div class="small mut">یا ${money(d.price_coins)} سکهٔ داخل بازی</div>` : ''}
        </div>
        <button class="btn ${d.featured ? 'gold' : 'pri'}" onclick="buyItem('${esc(d.id)}')" ${canBuy ? '' : 'disabled'}>🛒 خرید</button>
      </div>
      ${i.price_reasons?.length ? `<details class="small mut" style="margin-top:8px"><summary>چرا این قیمت؟ (قیمت‌گذاری هوشمند)</summary>${i.price_reasons.map((r) => '• ' + esc(r)).join('<br>')}</details>` : ''}
    </div>`;
  };

  const body = `<h1>🛍 فروشگاه</h1>
  <div class="row small mut">
    <span class="badge ok">✅ تأییدشده: ${esc(ctx.auth?.phone_masked || '')}</span>
    <span class="badge">💵 نرخ دلار: ${rate.rate ? money(rate.rate) + ' تومان (' + rate.source + ')' : 'در دسترس نیست'}</span>
    <span class="badge">🧠 قیمت‌گذاری هوشمند ${cat.ai ? '(با پیشنهاد AI)' : ''} — سقف تخفیف ${cat.max_discount}٪</span>
    ${cat.season ? `<span class="badge warn">🎉 ${esc(cat.season.name)}</span>` : ''}
  </div>
  <div class="tabs">${Object.entries(groups).map(([k, g]) => `<a class="tab ${tab === k ? 'on' : ''}" href="/mc/shop?tab=${k}">${g.title.split('(')[0]} <span class="badge">${g.items.length}</span></a>`).join('')}</div>
  <div class="grid g3 sec" id="grid">${(groups[tab] || groups.rank).items.map(cardHtml).join('') || '<div class="mut">آیتمی در این بخش نیست.</div>'}</div>
  <div class="glass card sec" id="checkout" style="display:none"></div>
  <script>
  async function buyItem(id){
    const box=document.getElementById('checkout');box.style.display='block';box.innerHTML='<div class="mut">در حال ساخت سفارش…</div>';
    const r=await api('/api/mc/shop/order',{method:'POST',body:JSON.stringify({item_id:id})});
    if(!r.ok){box.innerHTML='<div style="color:#fca5a5">'+(r.data.error||'خطا در ساخت سفارش')+'</div>';return}
    const o=r.data;
    box.innerHTML='<h3 style="margin-top:0">🧾 سفارش '+o.order.ref+'</h3>'+
      '<div class="row"><span class="badge">'+o.item.title_fa+'</span><span class="badge">'+o.discount.pct+'٪ تخفیف</span><b>'+o.amount_usd+'$</b><span class="mut">≈ '+Number(o.amount_toman).toLocaleString('en-US')+' تومان</span></div>'+
      '<div class="divider"></div><div class="row">'+
      (o.methods.includes('gateway')?'<button class="btn pri" onclick="payGateway(\\''+o.order.ref+'\\')">💳 پرداخت آنلاین (درگاه)</button>':'')+
      (o.methods.includes('card')?'<button class="btn ghost" onclick="showCard(\\''+o.order.ref+'\\', '+o.amount_toman+')">🏧 کارت‌به‌کارت + ارسال فیش</button>':'')+
      '<button class="btn ghost" onclick="document.getElementById(\\'checkout\\').style.display=\\'none\\'">انصراف</button></div>'+
      '<div id="cardBox"></div><div id="payMsg" class="small mut" style="margin-top:10px"></div>';
    box.scrollIntoView({behavior:'smooth'});
    api('/api/mc/shop/view',{method:'POST',body:JSON.stringify({item_id:id,event:'cart'})});
  }
  async function payGateway(ref){const r=await api('/api/mc/pay/gateway',{method:'POST',body:JSON.stringify({ref})});
    if(r.ok&&r.data.url){location.href=r.data.url}else{document.getElementById('payMsg').innerHTML='<span style="color:#fca5a5">'+(r.data.error||'درگاه در دسترس نیست')+'</span>'}}
  async function showCard(ref,toman){
    const r=await api('/api/mc/pay/card-info',{method:'POST',body:JSON.stringify({ref})});
    const b=document.getElementById('cardBox');
    if(!r.ok){b.innerHTML='<div style="color:#fca5a5">'+(r.data.error||'')+'</div>';return}
    b.innerHTML='<div class="glass card" style="margin-top:14px"><h3 style="margin-top:0">🏧 کارت‌به‌کارت</h3>'+
      '<div class="row"><span class="badge">شمارهٔ کارت</span><b class="mono" style="font-size:19px">'+r.data.card.number+'</b><button class="btn sm ghost" data-copy="'+r.data.card.number+'">کپی</button></div>'+
      '<div class="small mut">به نام: '+esc2(r.data.card.holder||'—')+(r.data.card.bank?' • بانک '+esc2(r.data.card.bank):'')+'</div>'+
      '<div class="small mut">مبلغ قابل واریز: <b>'+Number(toman).toLocaleString('en-US')+' تومان</b></div>'+
      '<label>تصویر فیش واریزی (JPG/PNG)</label><input type="file" id="receiptFile" accept="image/*">'+
      '<label>کد پیگیری (اختیاری)</label><input id="tracking" placeholder="مثلاً ۱۲۳۴۵۶۷۸۹">'+
      '<div class="row" style="margin-top:12px"><button class="btn pri" onclick="sendReceipt(\\''+ref+'\\')">📤 ارسال فیش برای بررسی</button></div>'+
      '<div class="small mut" style="margin-top:8px">🤖 فیش با هوش مصنوعی بررسی می‌شود (مبلغ، تاریخ، کد پیگیری، اثر دستکاری). موارد مشکوک خودکار رد و به ادمین گزارش می‌شوند.</div></div>';
  }
  const esc2=s=>String(s||'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  async function sendReceipt(ref){
    const f=document.getElementById('receiptFile').files[0];
    if(!f)return toast('تصویر فیش را انتخاب کنید');
    const b64=await new Promise(res=>{const fr=new FileReader();fr.onload=()=>res(String(fr.result).split(',')[1]);fr.readAsDataURL(f)});
    const r=await api('/api/mc/pay/receipt',{method:'POST',body:JSON.stringify({ref,image_b64:b64,tracking:document.getElementById('tracking').value.trim()})});
    const m=document.getElementById('payMsg');
    m.innerHTML=r.ok?'<span style="color:#86efac">'+(r.data.message||'ثبت شد')+'</span>':'<span style="color:#fca5a5">'+(r.data.message||r.data.error||'خطا')+'</span>'+(r.data.reasons?'<br>'+r.data.reasons.map(esc2).join('<br>'):'');
  }
  </script>`;
  return html(await chrome(env, db, { title: 'فروشگاه', body, active: '/mc/shop', ctx, palette }));
}

const slotName = (s) => ({ cape: 'کیپ', hat: 'کلاه', wings: 'بال', killeffect: 'افکت کشتن', portaleffect: 'افکت پرتال', nickcolor: 'رنگ نیک‌نیم', chattag: 'تگ چت', trail: 'دنباله', pet: 'پت', victorydance: 'رقص پیروزی', projectile: 'پرتابه' }[s] || s);

/** آیتم‌های محو پشت دیوار احراز هویت (بدون قیمت) */
function rawPreviewItems() {
  return [
    { t: 'رنک پرو', c: '🎖', d: 'تگ بنفش، +۳۰٪ سکه، بال و کلاه' },
    { t: 'رنک گاد', c: '👑', d: 'چت رنگین‌کمانی، کیپ، آرنای خصوصی' },
    { t: 'بال اژدها', c: '🪽', d: 'کازمتیک اسلات بال' },
    { t: 'افکت سیاه‌چاله', c: '💥', d: 'افکت کشتن' },
    { t: 'باندل خدایی', c: '📦', d: '۴ آیتم با تخفیف' },
    { t: '۴۰۰۰ جم', c: '💎', d: 'پک جم' },
    { t: 'بتل‌پس فصلی', c: '🎉', d: 'جوایز فصل' },
    { t: 'کانفیگ ویژه', c: '🛰', d: 'اتصال نامحدود پرسرعت' },
  ];
}

// ───────────────────────── کانفیگ‌های رایگان ─────────────────────────
export async function configsPage(env, db, request, ctx) {
  const pub = await configsPublic(db);
  const cfg = await serverConfig(db);
  const palette = await brandPalette(db);
  const body = `<h1>🛰 کانفیگ رایگان و نامحدود</h1>
  <div class="mut">مخصوص جاهایی که آنتن نمی‌ده، نت ملی است یا پینگ بالاست. این کانفیگ‌ها را در v2rayNG / v2rayN / Streisand / Husky اضافه کنید و بعد به سرور وصل شوید.</div>
  <div class="grid g3 sec">
    <div class="glass card"><b>${pub.count}</b><div class="small mut">کانفیگ ثبت‌شده</div></div>
    <div class="glass card"><b>${pub.healthy_count}</b><div class="small mut">سالم (طبق آخرین بررسی + بازخورد کاربران)</div></div>
    <div class="glass card"><b>${pub.unlimited_count}</b><div class="small mut">نامحدود (بدون سقف حجم/زمان)</div></div>
  </div>
  ${pub.notice ? `<div class="glass card sec" style="border-color:#f59e0b55"><b style="color:#fcd34d">⚠️ وضعیت فعلی</b><div class="small">${esc(pub.notice)}</div>
    <div class="small mut" style="margin-top:8px">این پروژه «زیرساخت توزیع» را ساخته است (ثبت/سلامت‌سنجی/بازخورد/ساب/QR)، اما ساخت کانفیگ رایگان نامحدود نیازمند سرور و پهنای باند واقعی است که باید توسط مالک سرور تأمین و در پنل ادمین ثبت شود. ما کانفیگ جعلی یا از قبل سوخته نشان نمی‌دهیم.</div></div>` : ''}
  <div class="row sec">
    <button class="btn pri" data-copy="${pub.sub_url}" data-copy-msg="آدرس اشتراک کپی شد">🔗 کپی آدرس اشتراک (ساب)</button>
    <a class="btn ghost" href="${pub.sub_url}">دانلود sub.txt</a>
    <a class="btn ghost" href="/mc/configs/sub.b64">نسخهٔ base64</a>
    <button class="btn ghost" id="qrBtn">📱 QR اشتراک</button>
  </div>
  <div id="qrBox"></div>
  <div class="glass card sec scroll">
    ${pub.items.length ? `<table><thead><tr><th>نام</th><th>پروتکل</th><th>کشور</th><th>نامحدود</th><th>سلامت</th><th>بازخورد</th><th></th></tr></thead><tbody>
      ${pub.items.map((c) => `<tr>
        <td>${esc(c.name)}</td>
        <td><span class="badge">${esc(c.protocol)}${c.security ? ' / ' + esc(c.security) : ''}</span></td>
        <td>${esc(c.country || '—')}</td>
        <td>${c.unlimited ? '<span class="badge ok">♾ نامحدود</span>' : '<span class="badge">محدود</span>'}</td>
        <td>${c.healthy ? '<span class="badge ok">🟢 سالم</span>' : '<span class="badge bad">🔴 نیازمند بررسی</span>'}</td>
        <td class="small">${c.feedback.score === null ? '—' : c.feedback.score + '٪ (' + c.feedback.up + '/' + (c.feedback.up + c.feedback.down) + ')'}</td>
        <td><button class="btn sm" data-copy-uri="${c.id}">کپی</button>
          <button class="btn sm ghost" onclick="fb(${c.id},1)">✔</button><button class="btn sm ghost" onclick="fb(${c.id},0)">✖</button></td>
      </tr>`).join('')}
    </tbody></table>` : '<div class="mut">کانفیگی برای نمایش نیست.</div>'}
  </div>
  <div class="glass card sec">
    <h3 style="margin-top:0">📖 راهنمای اتصال سریع</h3>
    <ol class="small mut" style="padding-inline-start:20px">
      <li>v2rayNG (اندروید) یا v2rayN (ویندوز) یا Streisand (iOS) را نصب کنید.</li>
      <li>گزینهٔ «افزودن از اشتراک/Subscription» را بزنید و آدرس ساب بالا را وارد کنید (یا تک‌تک URIها را کپی و Import کنید).</li>
      <li>یک سرور سالم را انتخاب و وصل کنید؛ سپس در ماینکرفت آدرس <b class="mono">${esc(cfg.address || '—')}</b> را وارد کنید.</li>
      <li>اگر وصل نشد، روی همان کانفیگ ✖ بزنید تا خودکار از لیست سالم‌ها خارج شود.</li>
    </ol>
  </div>
  <script>
  let uris={};
  fetch('/api/mc/configs/uris').then(r=>r.json()).then(d=>{uris=d.uris||{}}).catch(()=>{});
  document.addEventListener('click',e=>{const b=e.target.closest('[data-copy-uri]');if(!b)return;const id=b.getAttribute('data-copy-uri');const u=uris[id];if(!u){toast('برای کپی URI ابتدا احراز هویت کنید');setTimeout(()=>location.href='/mc/auth?next=/mc/configs',1200);return}copyText(u,'کانفیگ کپی شد ✅')});
  async function fb(id,ok){const r=await api('/api/mc/configs/feedback',{method:'POST',body:JSON.stringify({id,ok:!!ok})});toast(r.ok?'بازخورد ثبت شد، ممنون 🙏':(r.data.error||'خطا'))}
  document.getElementById('qrBtn').onclick=async()=>{const b=document.getElementById('qrBox');b.innerHTML='<img src="/mc/configs/qr.png" style="border-radius:14px;border:1px solid var(--line);margin-top:12px" width="240" height="240">'};
  </script>`;
  return html(await chrome(env, db, { title: 'کانفیگ رایگان', body, active: '/mc/configs', ctx, palette }));
}

// ───────────────────────── راهنمای نت ایران ─────────────────────────
export async function iranPage(env, db) {
  const cfg = await serverConfig(db);
  const body = `<h1>🇮🇷 سازگاری با اینترنت ایران</h1>
  <div class="mut">فیلترینگ، پینگ بالا و قطعی‌های مکرر واقعیت است. این صفحه کارهایی را جمع کرده که واقعاً تفاوت ایجاد می‌کنند.</div>
  <div class="grid g2 sec">
    <div class="glass card"><h3 style="margin-top:0">🛰 لایهٔ اتصال</h3>
      <ul class="small mut" style="padding-inline-start:18px">
        <li>از بخش <a href="/mc/configs">کانفیگ رایگان</a> یک مسیر سالم بگیرید (ساب یا تک‌تک).</li>
        <li>اگر دامنهٔ <span class="mono">*.workers.dev</span> از دسترس خارج شد، سایت روی دامنهٔ اختصاصی هم سرو می‌شود (از پنل ادمین ست کنید).</li>
        <li>DNS را روی یک DoH سالم بگذارید (مثلاً <span class="mono">https://free.shecan.ir/dns-query</span> یا <span class="mono">https://dns.403.online/dns-query</span>).</li>
      </ul>
    </div>
    <div class="glass card"><h3 style="margin-top:0">🎮 داخل بازی</h3>
      <ul class="small mut" style="padding-inline-start:18px">
        <li>پلاگین طوری ساخته شده که اگر ورکر (بخش ابری/AI) در دسترس نبود، بات‌ها با مغز محلی ادامه دهند و ELO/سکه در صف بماند تا اتصال برگشت.</li>
        <li>آنتی‌چیت جبران پینگ دارد (reach و speed با پینگ تصحیح می‌شوند) تا بازیکن با پینگ ۲۰۰ms اشتباهی بن نشود.</li>
        <li>هر ۳۰ ثانیه یک‌بار وضعیت سرور گزارش می‌شود؛ در سایت «آخرین دیده‌شدن» نشان داده می‌شود، نه «آفلاین» گمراه‌کننده.</li>
      </ul>
    </div>
    <div class="glass card"><h3 style="margin-top:0">⚙️ تنظیمات کلاینت</h3>
      <ul class="small mut" style="padding-inline-start:18px">
        <li>Render Distance را روی ۶–۸ بگذارید و Simulation Distance را ۵.</li>
        <li>در Bedrock، «Split Controls» و «Auto Jump» را خاموش کنید؛ پینگ کمتر حساس می‌شود.</li>
        <li>MTU پایین‌تر (۱۴۰۰) روی بعضی مسیرهای VPN کمک می‌کند.</li>
      </ul>
    </div>
    <div class="glass card"><h3 style="margin-top:0">📡 وضعیت لحظه‌ای</h3>
      <div id="live" class="small mut">در حال بارگذاری…</div>
      <div class="row" style="margin-top:10px"><a class="btn ghost sm" href="/mc/status">صفحهٔ وضعیت</a><a class="btn ghost sm" href="/api/mc/status">JSON</a></div>
    </div>
  </div>
  <div class="glass card sec"><h3 style="margin-top:0">🔌 آدرس سرور</h3>
    <div class="mono" style="font-size:20px">${esc(cfg.address || '—')}</div>
    <div class="row"><button class="btn pri sm" data-copy="${esc(cfg.address || '')}">کپی</button>
    <span class="badge">Java ${cfg.portJava}</span><span class="badge">Bedrock ${cfg.portBedrock}</span></div></div>
  <script>fetch('/api/mc/status').then(r=>r.json()).then(d=>{const el=document.getElementById('live');if(!d.ok)return;
    el.innerHTML=d.servers.map(s=>'<div class="between" style="padding:6px 0;border-bottom:1px solid var(--line)"><span>'+(s.online?'🟢':'🔴')+' '+s.name+'</span><span class="badge">'+s.players+' آنلاین • TPS '+s.tps+(s.online?'':' • آخرین دیده‌شدن '+Math.round(s.stale_sec/60)+' دقیقه پیش')+'</span></div>').join('')||'سروری ثبت نشده است.'}).catch(()=>{});</script>`;
  return html(await chrome(env, db, { title: 'راهنمای نت ایران', body, active: '/mc/iran', palette: await brandPalette(db) }));
}

// ───────────────────────── وضعیت سرور ─────────────────────────
export async function statusPage(env, db) {
  const st = await publicStatus(db);
  const palette = await brandPalette(db);
  const body = `<h1>📡 وضعیت سرور</h1>
  <div class="kpi sec" style="justify-content:flex-start">
    <div class="k"><b>${st.online_now}</b><span class="small mut">آنلاین</span></div>
    <div class="k"><b>${st.active_players_10m}</b><span class="small mut">فعال (۱۰ دقیقه)</span></div>
    <div class="k"><b>${st.matches_24h}</b><span class="small mut">مچ ۲۴ ساعت</span></div>
    <div class="k"><b>${st.humans_24h}</b><span class="small mut">بازیکن واقعی</span></div>
    <div class="k"><b>${st.bots_24h}</b><span class="small mut">بات AI</span></div>
    <div class="k"><b>${st.maintenance ? '🛠' : '✅'}</b><span class="small mut">${st.maintenance ? 'در حال نگهداری' : 'عملیاتی'}</span></div>
  </div>
  <div class="glass card scroll">
    <table><thead><tr><th>سرور</th><th>نرم‌افزار</th><th>وضعیت</th><th>بازیکن</th><th>Java/Bedrock</th><th>TPS</th><th>MSPT</th><th>بات‌ها</th><th>مودها</th></tr></thead><tbody>
    ${st.servers.length ? st.servers.map((s) => `<tr>
      <td><b>${esc(s.name || s.id)}</b><div class="small mut mono">${esc(s.address || '—')}:${s.port_java} / ${s.port_bedrock}</div></td>
      <td>${esc(s.software)} <span class="badge">${esc(s.version || '')}</span></td>
      <td>${s.online ? '<span class="badge ok">🟢 آنلاین</span>' : `<span class="badge bad">🔴 آخرین دیده‌شدن ${Math.round(s.stale_sec / 60)} دقیقه پیش</span>`}</td>
      <td>${s.players}/${s.max}</td><td>${s.java_now}/${s.bedrock_now}</td>
      <td>${s.tps}</td><td>${s.mspt}</td>
      <td>${s.bots_active} ${s.bot_tier ? `<span class="badge">${s.bot_tier}</span>` : ''}</td>
      <td class="small">${(s.modes || []).slice(0, 6).map((m) => `<span class="chip">${esc(typeof m === 'string' ? m : m.id)}</span>`).join('')}</td>
    </tr>`).join('') : '<tr><td colspan="9" class="mut">هنوز هیچ سروری هارت‌بیت نفرستاده است. بعد از اجرای پلاگین و تنظیم کلید پل، این جدول پر می‌شود.</td></tr>'}
    </tbody></table>
  </div>
  <div class="small mut sec">منبع داده: <span class="mono">/api/mc/status</span> — هر ۳۰ ثانیه توسط پلاگین به‌روز می‌شود. اگر سروری بیش از ۲ دقیقه هارت‌بیت نفرستد «آفلاین» نشان داده می‌شود.</div>`;
  return html(await chrome(env, db, { title: 'وضعیت سرور', body, active: '/mc/status', palette }));
}

// ───────────────────────── رفرال ─────────────────────────
export async function referralPage(env, db, request, ctx) {
  const enabled = await mcBool(db, 'referral_enabled', true);
  const base = new URL(request.url).origin;
  const eco = economySpec();
  const body = `<h1>👥 دعوت دوستان</h1>
  ${!enabled ? '<div class="glass card mut">سیستم رفرال غیرفعال است.</div>' : `
  <div class="grid g2 sec">
    <div class="glass card"><h3 style="margin-top:0">لینک دعوت شما</h3>
      ${ctx?.verified && ctx.player ? `<div class="mono" style="font-size:15px;word-break:break-all">${base}/mc/r/${esc(ctx.player.referral_code || '')}</div>
      <div class="row" style="margin-top:10px"><button class="btn pri sm" data-copy="${base}/mc/r/${esc(ctx.player.referral_code || '')}">کپی لینک</button>
      <span class="badge">${ctx.player.referrals || 0} دعوت موفق</span></div>` : `<div class="mut">برای گرفتن لینک اختصاصی، ابتدا <a href="/mc/auth">احراز هویت</a> کنید و نام کاربری ماینکرفت را متصل کنید.</div>`}
    </div>
    <div class="glass card"><h3 style="margin-top:0">جوایز</h3>
      <ul class="small mut" style="padding-inline-start:18px">
        <li>${eco.coins.referral_reward} سکه به ازای هر دعوت موفق</li>
        <li>۱۰٪ از اولین خرید زیرمجموعه به‌صورت جم به شما</li>
        <li>زیرمجموعه هم ${Math.round(eco.coins.referral_reward / 2)} سکهٔ خوش‌آمد می‌گیرد</li>
        <li>رفرالهای مشکوک (یوزرنیم یکسان/خوشهٔ هم‌IP) پاداش نمی‌گیرند و به ادمین گزارش می‌شوند</li>
      </ul>
    </div>
  </div>`}`;
  return html(await chrome(env, db, { title: 'دعوت دوستان', body, active: '/mc/referral', ctx, palette: await brandPalette(db) }));
}

// ───────────────────────── گزارش تخلف ─────────────────────────
export async function reportPage(env, db, request, ctx) {
  const enabled = await mcBool(db, 'reports_enabled', true);
  const body = `<h1>🚩 گزارش تخلف</h1>
  ${!enabled ? '<div class="glass card mut">گزارش تخلف غیرفعال است.</div>' : `
  <div class="grid g2 sec">
    <div class="glass card">
      <label>نام بازیکن متخلف</label><input id="target" maxlength="32" placeholder="مثلاً Steve">
      <label>نوع تخلف</label>
      <select id="reason">
        <option value="killaura">Kill Aura / چیت جنگی</option>
        <option value="reach">Reach</option>
        <option value="fly">Fly / NoFall</option>
        <option value="speed">Speed / Timer</option>
        <option value="xray">X-Ray</option>
        <option value="scaffold">Scaffold سریع</option>
        <option value="griefing">گریفینگ / تخریب</option>
        <option value="spam">اسپم / تبلیغ</option>
        <option value="toxic">رفتار نامناسب / فحاشی</option>
        <option value="scam">کلاهبرداری / معاملهٔ تقلبی</option>
        <option value="alt">حساب جایگزین برای فرار از بن</option>
        <option value="other">سایر</option>
      </select>
      <label>مود</label><input id="mode" placeholder="مثلاً bedwars">
      <label>توضیح / مدرک</label><textarea id="evidence" rows="4" placeholder="چه شد؟ لینک ویدیو یا اسکرین‌شات (اختیاری)"></textarea>
      <div class="row" style="margin-top:12px"><button class="btn pri" id="send">📤 ثبت گزارش</button></div>
      <div class="small mut" id="msg" style="margin-top:10px"></div>
    </div>
    <div>
      <div class="glass card"><h3 style="margin-top:0">چطور بررسی می‌شود؟</h3>
        <ol class="small mut" style="padding-inline-start:18px">
          <li>آنتی‌چیت سرور همان لحظه لاگ دارد (reach/cps/fly/speed) — گزارش شما با آن لاگ مقایسه می‌شود.</li>
          <li>اگر بازیکن ۵ گزارش یا بیشتر داشته باشد، به ادمین هشدار می‌رود.</li>
          <li>گزارش معتبر = ${economySpec().coins.report_valid_reward} سکه پاداش برای شما.</li>
          <li>گزارش دروغ/اذیت‌کننده → خودِ گزارش‌دهنده جریمه می‌شود.</li>
        </ol>
      </div>
      <div class="glass card" style="margin-top:16px"><h3 style="margin-top:0">🛡 آنتی‌چیت چه چیزی را می‌گیرد؟</h3>
        <div class="row">${['reach', 'killaura', 'autoclicker', 'fly', 'speed', 'nofall', 'timer', 'scaffold', 'xray', 'fastbow', 'blink', 'impossible'].map((c) => `<span class="chip">${c}</span>`).join('')}</div>
        <div class="small mut" style="margin-top:8px">امتیاز تخطی با افول زمانی؛ آستانه‌ها: هشدار → کیک → بن موقت → بن دائم. جبران پینگ فعال است.</div>
      </div>
    </div>
  </div>
  <script>document.getElementById('send').onclick=async()=>{
    const r=await api('/api/mc/report',{method:'POST',body:JSON.stringify({target:document.getElementById('target').value.trim(),reason:document.getElementById('reason').value,mode:document.getElementById('mode').value.trim(),evidence:document.getElementById('evidence').value.trim(),reporter:${JSON.stringify(ctx?.player?.username || '')}})});
    document.getElementById('msg').innerHTML=r.ok?'<span style="color:#86efac">'+(r.data.message||'ثبت شد ✅')+'</span>':'<span style="color:#fca5a5">'+(r.data.error||'خطا')+'</span>'};</script>`}`;
  return html(await chrome(env, db, { title: 'گزارش تخلف', body, active: '/mc/report', ctx, palette: await brandPalette(db) }));
}

// ───────────────────────── قوانین ─────────────────────────
export async function termsPage(env, db) {
  const cfg = await serverConfig(db);
  const body = `<h1>📜 قوانین و مقررات</h1>
  <div class="glass card sec">
    <ol class="small mut" style="padding-inline-start:20px;line-height:2">
      <li>هرگونه چیت، مود غیرمجاز، کلاینت هک‌شده یا سوءاستفاده از باگ → بن (موقت تا دائم). آنتی‌چیت لاگ دارد و گزارش بازیکن هم بررسی می‌شود.</li>
      <li>فحاشی، توهین، نژادپرستی، تبلیغ سرور دیگر یا اسپم در چت → مجازات پلکانی (سکوت → کیک → بن).</li>
      <li>گریفینگ در مودهای غیرمجاز، دزدی از بیس در فکشنز بدون رعایت قوانین رید، و فروش آیتم با پول واقعی ممنوع است.</li>
      <li>خرید رنک/کازمتیک دائمی است اما در صورت بن دائم به دلیل تقلب، بازپرداخت انجام نمی‌شود.</li>
      <li>قیمت‌ها به دلار اعلام و به تومان دریافت می‌شود؛ نرخ تبدیل در لحظهٔ خرید نمایش داده می‌شود.</li>
      <li>پرداخت کارت‌به‌کارت فقط با فیش واقعی و قابل استعلام؛ فیش دستکاری‌شده یا تکراری → رد + گزارش.</li>
      <li>احراز هویت با شمارهٔ موبایل برای مشاهدهٔ فروشگاه الزامی است؛ شمارهٔ شما به هیچ‌کس فروخته یا نمایش داده نمی‌شود (فقط هش آن ذخیره می‌شود).</li>
      <li>بات‌های AI بخشی از طراحی بازی‌اند و با برچسب مشخص نمایش داده می‌شوند؛ امتیاز/ELO بات‌ها در لیدربرد بازیکنان واقعی نمی‌آید.</li>
      <li>تصمیم نهایی دربارهٔ مجازات‌ها با تیم مدیریت ${esc(cfg.name)} است.</li>
    </ol>
  </div>`;
  return html(await chrome(env, db, { title: 'قوانین', body, active: '/mc/terms', palette: await brandPalette(db) }));
}
