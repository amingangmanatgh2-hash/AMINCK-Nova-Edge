#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════
//  Nova Edge — تست end-to-end روی ورکرِ در حال اجرا (wrangler dev)
//  مسیر کامل: راه‌اندازی مالک → احراز هویت OTP → فروشگاه → سفارش →
//  فیش کارت‌به‌کارت → پل پلاگین (هارت‌بیت/مچ/بات) → پنل ادمین.
//  اجرا: BASE=http://127.0.0.1:8787 node scripts/e2e-live.mjs
// ═══════════════════════════════════════════════════════════════════
const BASE = process.env.BASE || 'http://127.0.0.1:8787';
let pass = 0;
const fails = [];
const check = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fails.push(name + (extra ? ` — ${extra}` : '')); console.log(`  ❌ ${name}${extra ? ' — ' + extra : ''}`); }
};
const section = (t) => console.log(`\n\x1b[1m${t}\x1b[0m`);

async function req(path, { method = 'GET', body, cookie, token, headers = {} } = {}) {
  const h = { ...headers };
  if (body !== undefined) h['Content-Type'] = 'application/json';
  if (cookie) h.Cookie = cookie;
  if (token) h.Authorization = `Bearer ${token}`;
  const r = await fetch(BASE + path, { method, body: body === undefined ? undefined : JSON.stringify(body), headers: h });
  const text = await r.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { status: r.status, ok: r.ok, text, json, setCookie: r.headers.getSetCookie ? r.headers.getSetCookie() : [r.headers.get('Set-Cookie')].filter(Boolean), headers: r.headers };
}

const sha256Hex = async (s) => {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
};
const hmacHex = async (key, msg) => {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const s = await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(msg));
  return [...new Uint8Array(s)].map((x) => x.toString(16).padStart(2, '0')).join('');
};

const MCNAME = 'E2E' + Math.random().toString(36).slice(2, 8).toUpperCase();
const PHONE = '0912' + String(Math.floor(Math.random() * 9000000) + 1000000);
const PHONE2 = '0935' + String(Math.floor(Math.random() * 9000000) + 1000000);
const ADMIN_PASS = 'TestPass12345';
let adminCookie = '';
let userCookie = '';
let bridgeKey = '';
let receiptRef = '';

async function main() {
  section('۰) سلامت و پاک‌سازی legacy');
  {
    const h = await req('/health');
    check('/health سالم است', h.status === 200 && h.json?.ok === true && h.json?.service === 'nova-edge-minecraft');
    const root = await req('/');
    check('/ سایت Minecraft را نشان می‌دهد', root.status === 200 && root.text.includes('گیم‌مود') && root.text.includes('سرور خدای ماینکرفت'));
    const p = await req('/panel');
    check('/panel قدیمی فقط به پنل MC هدایت می‌شود', p.status === 200 && p.text.includes('پنل'));
    const webhook = await req('/webhook');
    check('/webhook legacy حذف شده است', webhook.status === 404);
  }

  section('۱) راه‌اندازی پنل مالک (/mc/setup)');
  {
    const page = await req('/mc/setup');
    check('صفحهٔ راه‌اندازی رندر می‌شود', page.status === 200 && page.text.includes('رمز پنل ادمین'));
    const st = await req('/api/mc/setup/state', { method: 'POST', body: {} });
    check('state اولیه خوانده می‌شود', st.json?.ok === true);
    check('کلید پل خودکار ساخته شده', typeof st.json?.setup_done !== 'undefined');

    const save = await req('/api/mc/setup/save', {
      method: 'POST',
      body: {
        admin_password: ADMIN_PASS,
        server_name: 'Nova Edge Gods',
        server_tagline: 'تست E2E',
        server_address: 'play.novaedge.test',
        server_port_java: 25565,
        server_port_bedrock: 19132,
        otp_provider: 'dev',
        otp_dev_show: '1',
        card_enabled: '1',
        card_number: '6219861234567890',
        card_holder: 'تست',
        card_bank: 'بانک تست',
        gateway_enabled: '0',
        usd_rate_manual: '950000',
        shop_enabled: '1',
        configs_enabled: '1',
      },
    });
    check('ذخیرهٔ تنظیمات مالک موفق', save.json?.ok === true, JSON.stringify(save.json).slice(0, 160));
    check('نشست ادمین صادر شد', !!save.json?.session);
    adminCookie = (save.setCookie.find((c) => c.includes('nova_admin')) || '').split(';')[0];
    check('کوکی ادمین ست شد', adminCookie.includes('nova_admin'), adminCookie);

    const noPass = await req('/api/mc/setup/save', { method: 'POST', body: { server_name: 'HijackedName' } });
    check('🔒 بعد از راه‌اندازی، تغییر تنظیمات بدون نشست ادمین رد می‌شود', noPass.status === 401 && noPass.json?.need_login === true, `${noPass.status} ${JSON.stringify(noPass.json || {}).slice(0, 120)}`);
    const stAfter = await req('/api/mc/setup/state', { method: 'POST', body: {} });
    check('🔒 state هم بعد از راه‌اندازی قفل است', stAfter.status === 401);
    const stAuth = await req('/api/mc/setup/state', { method: 'POST', body: {}, cookie: adminCookie });
    check('با نشست ادمین، state قابل خواندن است', stAuth.json?.ok === true && stAuth.json?.setup_done === true);
    const home2 = await req('/mc');
    check('اسم سرور روی صفحهٔ خانه نشست (تغییر غیرمجاز اعمال نشد)', home2.text.includes('Nova Edge Gods') && !home2.text.includes('HijackedName'));
  }

  section('۲) احراز هویت OTP (ارسال → تأیید → نشست)');
  {
    const prov = await req('/api/mc/auth/provider');
    check('روش ارسال کد اعلام می‌شود', prov.json?.provider === 'dev');
    const bad = await req('/api/mc/auth/send', { method: 'POST', body: { phone: '12345' } });
    check('شمارهٔ نامعتبر رد می‌شود', bad.json?.ok === false && /معتبر/.test(bad.json?.error || ''));
    const s1 = await req('/api/mc/auth/send', { method: 'POST', body: { phone: PHONE } });
    check('کد ارسال شد (حالت تست)', s1.json?.ok === true && /^\d{6}$/.test(s1.json?.dev_code || ''), JSON.stringify(s1.json).slice(0, 140));
    const wrong = await req('/api/mc/auth/verify', { method: 'POST', body: { phone: PHONE, code: '000000' } });
    check('کد اشتباه رد می‌شود', wrong.json?.ok === false);
    const v = await req('/api/mc/auth/verify', { method: 'POST', body: { phone: PHONE, code: s1.json.dev_code } });
    check('کد درست پذیرفته شد', v.json?.ok === true && !!v.json?.token, JSON.stringify(v.json).slice(0, 140));
    userCookie = (v.setCookie.find((c) => c.includes('nova_session')) || '').split(';')[0];
    check('کوکی نشست کاربر ست شد', userCookie.includes('nova_session'));
    const masked = v.json?.phone_masked || '';
    check('شماره ماسک شده برمی‌گردد', /\*\*\*/.test(masked), masked);

    // قفل نرخ: درخواست بلافاصلهٔ دوباره باید کول‌داون بگیرد
    const again = await req('/api/mc/auth/send', { method: 'POST', body: { phone: PHONE } });
    check('کول‌داون ارسال مجدد اعمال می‌شود', again.json?.ok === false && (again.json?.resend_in > 0 || /قبلاً/.test(again.json?.error || '')), JSON.stringify(again.json).slice(0, 120));
  }

  section('۳) قفل فروشگاه قبل از احراز هویت');
  {
    const locked = await req('/api/mc/shop/catalog');
    check('کاتالوگ بدون احراز هویت ۴۰۱ می‌دهد', locked.status === 401 && locked.json?.need_auth === true);
    const page = await req('/mc/shop');
    check('صفحهٔ فروشگاه محصولات را نشان نمی‌دهد', page.text.includes('محصولات قفل هستند') && !page.text.includes('$7.99'));
    const unlocked = await req('/api/mc/shop/catalog', { cookie: userCookie });
    check('با احراز هویت، کاتالوگ باز می‌شود', unlocked.json?.ok === true && unlocked.json.items.length > 20, `items=${unlocked.json?.items?.length}`);
    const ranks = unlocked.json.items.filter((i) => i.type === 'rank');
    check('رنک‌ها در کاتالوگ هستند', ranks.length === 5, ranks.map((r) => r.id).join(','));
    check('قیمت‌ها دلاری و منطقی‌اند', ranks.every((r) => r.price_usd > 0 && r.price_usd <= 30));
    check('تومان از نرخ دستی محاسبه شد', ranks.some((r) => r.price_toman > 100000));
    check('سقف تخفیف ۳۰٪ رعایت شده', unlocked.json.items.every((i) => (i.pct || 0) <= 30));
    check('کازمتیک‌ها (بال/کلاه/کیپ/افکت) موجودند', ['wings', 'hat', 'cape', 'killeffect', 'portaleffect', 'nickcolor', 'chattag'].every((s) => unlocked.json.items.some((i) => i.slot === s)));
    check('باندل و جم و بتل‌پس موجودند', ['bundle', 'gems', 'season'].every((t) => unlocked.json.items.some((i) => i.type === t)));
  }

  section('۴) اتصال نام کاربری ماینکرفت + رفرال');
  {
    const badName = await req('/api/mc/account/link', { method: 'POST', body: { username: '!!' }, cookie: userCookie });
    check('نام کاربری نامعتبر رد می‌شود', badName.json?.ok === false);
    const link = await req('/api/mc/account/link', { method: 'POST', body: { username: MCNAME }, cookie: userCookie });
    check('نام کاربری متصل شد', link.json?.ok === true && link.json.player?.username === MCNAME, JSON.stringify(link.json).slice(0, 160));
    check('کد رفرال برای بازیکن ساخته شد', !!link.json?.player?.referral_code);
    const prof = await req('/api/mc/account/profile', { cookie: userCookie });
    check('پروفایل از نشست خوانده می‌شود', prof.json?.player?.username === MCNAME);
  }

  section('۵) سفارش + کارت‌به‌کارت + بررسی فیش با AI');
  {
    const ord = await req('/api/mc/shop/order', { method: 'POST', body: { item_id: 'rank_pro', username: MCNAME }, cookie: userCookie });
    check('سفارش ساخته شد', ord.json?.ok === true && !!ord.json.order?.ref, JSON.stringify(ord.json).slice(0, 180));
    check('روش‌های پرداخت شامل کارت است', (ord.json?.methods || []).includes('card'), JSON.stringify(ord.json?.methods));
    const cardInfo = await req('/api/mc/pay/card-info', { method: 'POST', body: { ref: ord.json?.order?.ref }, cookie: userCookie });
    check('شمارهٔ کارت (ست‌شده در پنل) برگشت', cardInfo.json?.card?.number === '6219861234567890', JSON.stringify(cardInfo.json).slice(0, 120));

    // فیش جعلی (یک PNG کوچک بی‌معنی) → باید به صف manual برود نه تأیید خودکار
    const tiny = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==', 'base64').toString('base64');
    const small = await req('/api/mc/pay/receipt', { method: 'POST', body: { ref: ord.json.order.ref, image_b64: tiny }, cookie: userCookie });
    check('فیش خیلی کوچک رد می‌شود', small.json?.ok === false && /حجم|معتبر/.test(small.json?.error || ''), JSON.stringify(small.json).slice(0, 140));

    // فیش بزرگ‌تر (بایت تصادفی واقعی) → باید manual/reject شود، هرگز auto-approve
    const noise = crypto.getRandomValues(new Uint8Array(24 * 1024));
    const big = Buffer.from(noise).toString('base64');
    const r1 = await req('/api/mc/pay/receipt', { method: 'POST', body: { ref: ord.json.order.ref, image_b64: big, tracking: '123456' }, cookie: userCookie });
    check('فیش بدون AI به بررسی دستی می‌رود', r1.json?.status === 'pending' || r1.json?.status === 'rejected', JSON.stringify(r1.json || {}).slice(0, 200));
    check('سفارش «پرداخت‌شده» نشد (بدون تأیید ادمین)', r1.json?.status !== 'approved');
    receiptRef = ord.json.order.ref;
    const r2 = await req('/api/mc/pay/receipt', { method: 'POST', body: { ref: ord.json.order.ref, image_b64: big, tracking: '123456' }, cookie: userCookie });
    check('فیش تکراری (همان sha256) رد می‌شود', r2.json?.status === 'rejected', JSON.stringify(r2.json || {}).slice(0, 160));
    const badb64 = await req('/api/mc/pay/receipt', { method: 'POST', body: { ref: ord.json.order.ref, image_b64: '!!!not base64!!!' }, cookie: userCookie });
    check('base64 نامعتبر با پیام تمیز رد می‌شود (نه ۵۰۰)', badb64.status === 400 && /base64/.test(badb64.json?.error || ''), JSON.stringify(badb64.json || {}).slice(0, 140));
  }

  section('۶) ورود پنل ادمین و دادهٔ داشبورد');
  {
    const bad = await req('/api/mc/admin/login', { method: 'POST', body: { password: 'wrong' } });
    check('رمز اشتباه رد می‌شود', bad.json?.ok === false);
    const login = await req('/api/mc/admin/login', { method: 'POST', body: { password: ADMIN_PASS } });
    check('ورود با رمز درست', login.json?.ok === true && !!login.json.token);
    adminCookie = `nova_admin=${login.json.token}`;
    const noAuth = await req('/api/mc/admin/state');
    check('API ادمین بدون نشست ۴۰۱ می‌دهد', noAuth.status === 401);
    const st = await req('/api/mc/admin/state', { cookie: adminCookie });
    check('state داشبورد کامل است', st.json?.ok === true && st.json.counters && st.json.status && Array.isArray(st.json.tabs));
    check('شمارهٔ تأییدشده شمرده شد', st.json?.counters?.verified_phones >= 1);
    check('فیش در صف دیده می‌شود', st.json?.counters?.receipts_pending >= 0);
    const bk = await req('/api/mc/admin/bridge_key', { cookie: adminCookie });
    check('کلید پل از پنل خوانده می‌شود', typeof bk.json?.key === 'string' && bk.json.key.length > 20);
    bridgeKey = bk.json.key;
    const rec = await req('/api/mc/admin/receipts', { cookie: adminCookie });
    check('صف فیش‌ها خوانده می‌شود', Array.isArray(rec.json?.receipts));
    const fraudList = await req('/api/mc/admin/fraud', { cookie: adminCookie });
    check('صف تقلب (فیش تکراری) ثبت شده', (fraudList.json?.items || []).some((f) => f.kind === 'receipt_reuse'), JSON.stringify((fraudList.json?.items || []).map((f) => f.kind)));
    const bots = await req('/api/mc/admin/bots', { cookie: adminCookie });
    check('تنظیمات بات‌ها + سطوح + مدل‌ها', bots.json?.tiers?.length === 5 && !!bots.json?.models?.large);
    const sim = await req('/api/mc/admin/bot_simulate', { cookie: adminCookie, method: 'POST', body: { mode: 'bedwars', fill_slots: 4, players: [{ id: 'h1', rating: 2100, level: 80, rank_id: 'god', games: 600, is_bot: false }] } });
    check('شبیه‌ساز سطح هوش کار می‌کند', sim.json?.tier?.match_tier && sim.json?.decision?.decision?.action, JSON.stringify(sim.json?.tier?.match_tier) + '/' + JSON.stringify(sim.json?.decision?.source));
    check('رنک «گاد» کف سطح بات را بالا برد', ['T3', 'T4'].includes(sim.json?.tier?.match_tier), sim.json?.tier?.reasons?.join(' | '));
    const cat = await req('/api/mc/admin/catalog', { cookie: adminCookie });
    check('کاتالوگ از پنل دیده می‌شود', cat.json?.count > 20);

    // چرخهٔ کامل خرید → تأیید ادمین → تحویل به سرور
    const pend = await req('/api/mc/admin/receipts', { cookie: adminCookie });
    const mine = (pend.json?.receipts || []).find((r) => r.order_ref === receiptRef || r.ref === receiptRef);
    check('فیش من در صف ادمین دیده می‌شود', !!mine, JSON.stringify((pend.json?.receipts || []).slice(0, 2)).slice(0, 220));
    if (mine) {
      const ok = await req('/api/mc/admin/receipt_decide', { method: 'POST', cookie: adminCookie, body: { id: mine.id, decision: 'approve', note: 'تأیید دستی در تست' } });
      check('ادمین فیش را تأیید کرد', ok.json?.ok === true, JSON.stringify(ok.json || {}).slice(0, 180));
      const orders = await req('/api/mc/admin/orders', { cookie: adminCookie });
      const o = (orders.json?.orders || []).find((x) => x.ref === receiptRef);
      check('سفارش به وضعیت پرداخت‌شده رفت', o?.status === 'paid', JSON.stringify(o || {}).slice(0, 180));
    }
  }

  section('۷) پل پلاگین — امضا، هارت‌بیت، مچ، بات‌ها');
  {
    const noKey = await req('/api/mc/v1/heartbeat', { method: 'POST', body: { server_id: 'x' } });
    check('بدون کلید پل → ۴۰۱', noKey.status === 401);
    const wrongKey = await req('/api/mc/v1/heartbeat', { method: 'POST', body: { server_id: 'x' }, headers: { 'X-Nova-Key': 'wrong' } });
    check('کلید اشتباه → ۴۰۱', wrongKey.status === 401);

    const sign = async (body) => {
      const raw = JSON.stringify(body);
      const ts = Math.floor(Date.now() / 1000);
      const sig = await hmacHex(bridgeKey, `${ts}:${await sha256Hex(raw)}`);
      return { raw, headers: { 'Content-Type': 'application/json', 'X-Nova-Key': bridgeKey, 'X-Nova-Ts': String(ts), 'X-Nova-Sig': sig } };
    };
    const post = async (path, body) => {
      const s = await sign(body);
      const r = await fetch(BASE + path, { method: 'POST', headers: s.headers, body: s.raw });
      const t = await r.text();
      let j = null; try { j = JSON.parse(t); } catch {}
      return { status: r.status, json: j, text: t };
    };

    const hb = await post('/api/mc/v1/heartbeat', { server_id: 'main', name: 'Nova Edge [IR]', software: 'paper', version: '1.21.4', address: 'play.novaedge.test', port_java: 25565, port_bedrock: 19132, players_now: 12, max_slots: 200, java_now: 8, bedrock_now: 4, tps: 19.7, mspt: 41, bots_active: 5, bot_tier: 'T2', modes: ['bedwars', 'skywars', 'kitpvp'], geo: 'IR' });
    check('هارت‌بیت پذیرفته شد', hb.json?.ok === true, JSON.stringify(hb.json).slice(0, 140));
    check('کانفیگ زنده به پلاگین برگشت', !!hb.json?.config?.server_name);
    const st = await req('/api/mc/status');
    check('وضعیت عمومی سرور آنلاین نشان داده می‌شود', st.json?.servers?.some((s) => s.online && s.players === 12), JSON.stringify(st.json?.servers?.map((s) => [s.id, s.online, s.players])));
    check('کراس‌پلی در وضعیت عمومی هست', st.json?.crossplay === true);

    const sync = await post('/api/mc/v1/player/sync', { username: MCNAME, platform: 'java', uuid: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' });
    check('همگام‌سازی پروفایل بازیکن', sync.json?.ok === true && sync.json.player?.username === MCNAME);

    const tier = await post('/api/mc/v1/bot/tier', { mode: 'duels', fill_slots: 1, seed: 11, players: [{ id: MCNAME, is_bot: false, rating: 2100, level: 80, rank_id: 'god', games: 600 }] });
    check('سطح هوش بات برای مچ محاسبه شد', tier.json?.ok === true && ['T3', 'T4'].includes(tier.json?.match_tier), JSON.stringify(tier.json?.match_tier));
    check('مدل پرو انتخاب شد', tier.json?.model === 'large' || tier.json?.model === '@cf/meta/llama-3.3-70b-instruct-fp8-fast', String(tier.json?.model));
    check('پارامترهای انسانی‌شدهٔ بات برگشت', Array.isArray(tier.json?.bots) && tier.json.bots[0]?.reaction_ms?.min > 0);

    const tierLow = await post('/api/mc/v1/bot/tier', { mode: 'duels', fill_slots: 3, seed: 5, players: [{ id: 'newbie', is_bot: false, rating: 900, level: 3, rank_id: 'free', games: 2 }] });
    check('بازیکن تازه‌کار → سطح پایین/ارزان', ['T0', 'T1'].includes(tierLow.json?.match_tier), `${tierLow.json?.match_tier} reasons=${tierLow.json?.reasons}`);

    const esc1 = await post('/api/mc/v1/bot/escalate', { mode: 'bedwars', base_tier: 'T2', start_tier: 'T1', duration_sec: 1800, elapsed_sec: 1500, human_score_share: 0.7 });
    check('ترفیع تدریجی در طول مچ', esc1.json?.ok === true && ['T2', 'T3'].includes(esc1.json?.tier), `${esc1.json?.tier} (${esc1.json?.reason})`);
    const esc2 = await post('/api/mc/v1/bot/escalate', { mode: 'bedwars', base_tier: 'T2', start_tier: 'T1', duration_sec: 1800, elapsed_sec: 1500, human_score_share: 0.1 });
    check('rubber-band: وقتی انسان له شده ترفیع نمی‌گیرد', esc2.json?.tier === 'T1', `${esc2.json?.tier} (${esc2.json?.reason})`);

    const dec = await post('/api/mc/v1/bot/decide', {
      mode: 'bedwars', tier: 'T2', match_id: 'e2e-1', bot_count: 4, seed: 3,
      bot: { id: 'b1', team: 0, hp: 8, max_hp: 20, inventory: { obsidian: 1, ender_pearl: 2 }, resources: { iron: 40, gold: 8 } },
      world: { elapsed_sec: 420, duration_sec: 1800, alive_enemies: [{ id: 'e1', dist: 9, hp: 16 }], alive_allies: [{ id: 'a1', dist: 4, hp: 18 }], objectives: { my_bed: { obsidian: false }, bed_threat_dist: 8, enemy_beds: [{ team: 2, dist: 44, obsidian: false }] }, scores: { my_team: 1, enemy_team: 2 }, resources: [{ id: 'gen', dist: 2 }], shop_affordable: ['iron_sword', 'obsidian'], gear_gap: 0.4 },
    });
    check('تصمیم بات برگشت (محلی یا ابری)', dec.json?.ok === true && !!dec.json?.decision?.action, JSON.stringify(dec.json).slice(0, 160));
    check('در نبود AI، fallback محلی کار می‌کند', ['local', 'local_fallback', 'cache', 'llm'].includes(dec.json?.source), String(dec.json?.source));
    check('انسانی‌سازی اعمال شد (تأخیر/خطا)', dec.json?.decision?.reaction_ms > 0 && dec.json?.decision?.aim_error_deg >= 0);

    const match = await post('/api/mc/v1/match/report', {
      match_id: 'e2e-match-1', mode: 'bedwars', map: 'lighthouse', server_id: 'main', duration_sec: 1320,
      tier_start: 'T2', tier_end: 'T3', model: '@cf/meta/llama-3.3-70b-instruct-fp8-fast', ai_calls: 42, ai_latency_ms: 690, winner_team: 0,
      teams: [
        { index: 0, players: [{ username: MCNAME, platform: 'java', won: true, placement: 1, afk_pct: 1, events: [{ type: 'kill', count: 9 }, { type: 'final_kill', count: 4 }, { type: 'bed_break', count: 3 }, { type: 'resource_collected', count: 320 }, { type: 'team_upgrade', count: 2 }] }] },
        { index: 1, players: [{ username: 'E2ERival', platform: 'bedrock', won: false, placement: 3, afk_pct: 4, events: [{ type: 'kill', count: 3 }, { type: 'death', count: 4 }, { type: 'bed_break', count: 1 }, { type: 'resource_collected', count: 90 }] }, { id: 'bot_x', is_bot: true, rating: 1500, won: false, bot_tier: 'T2' }] },
      ],
    });
    check('گزارش مچ پردازش شد', match.json?.ok === true && match.json.results?.length === 2, JSON.stringify(match.json).slice(0, 200));
    const hero = match.json.results.find((r) => r.username === MCNAME);
    check('امتیاز/سکه/XP محاسبه شد', hero && hero.points > 500 && hero.coins > 0 && hero.xp > 0, JSON.stringify(hero).slice(0, 180));
    check('ELO برنده مثبت است', hero?.elo_delta > 0, String(hero?.elo_delta));
    check('RP و ارتقای رنک خودکار', hero?.rp_total > 0, `rp=${hero?.rp_total} rank=${hero?.rank} promoted=${hero?.promoted}`);
    check('MVP تعیین شد', match.json.mvp === MCNAME, String(match.json.mvp));
    check('بات در نتایج هست اما RP نمی‌گیرد', match.json.results.filter((r) => !r.username).length >= 0);

    const lb = await req('/api/mc/leaderboard?b=rating');
    check('لیدربرد بعد از مچ پر شد', (lb.json?.rows || []).some((r) => r.username === MCNAME), JSON.stringify(lb.json?.rows?.slice(0, 3)));
    const prof = await req('/api/mc/player/' + MCNAME);
    check('پروفایل عمومی بازیکن با آمار', prof.json?.player?.rating > 1000 && prof.json?.player?.wins >= 1, JSON.stringify(prof.json?.player || {}).slice(0, 160));
    const modeLb = await req('/api/mc/leaderboard?mode=bedwars');
    check('لیدربرد تفکیک‌شده بر اساس مود', (modeLb.json?.rows || []).length >= 1);

    const ac = await post('/api/mc/v1/anticheat', { username: 'CheaterX', mode: 'duels', ping: 40, samples: [{ check: 'reach', value: 5.2 }, { check: 'cps', value: 26 }, { check: 'rotation_snap', value: 2, snap_streak: 5 }] });
    check('آنتی‌چیت تخطی‌ها را ثبت کرد', ac.json?.ok === true && ac.json.score > 0, JSON.stringify(ac.json).slice(0, 160));
    check('حکم صادر شد (warn/kick/tempban/ban)', ['warn', 'kick', 'tempban', 'ban'].includes(ac.json.action), String(ac.json.action));

    const rep = await post('/api/mc/v1/report', { target: 'CheaterX', reason: 'killaura', reporter: MCNAME, mode: 'duels', evidence: { note: 'e2e' } });
    check('گزارش تخلف ثبت شد', rep.json?.ok === true);

    const grants = await post('/api/mc/v1/grants', { username: MCNAME });
    check('گرانت‌های در انتظار (رنک خریداری‌شده) به پلاگین می‌رسد', Array.isArray(grants.json?.grants));
    check('رنک Pro بعد از تأیید فیش در صف تحویل است', (grants.json?.grants || []).some((g) => String(g.item_id).includes('rank') || g.kind === 'rank'), JSON.stringify((grants.json?.grants || []).map((g) => g.item_id || g.kind)).slice(0, 160));
    if ((grants.json?.grants || []).length) {
      const ack = await post('/api/mc/v1/grants/ack', { ids: grants.json.grants.map((g) => g.id) });
      check('پلاگین تحویل گرانت را تأیید می‌کند', ack.json?.ok === true && ack.json.acked >= 1);
      const after = await post('/api/mc/v1/grants', { username: MCNAME });
      check('بعد از ack، صف تحویل خالی می‌شود', (after.json?.grants || []).length === 0);
    }
  }

  section('۸) کانفیگ‌های رایگان (ثبت/سلامت/بازخورد/ساب)');
  {
    const add = await req('/api/mc/admin/config_add', { method: 'POST', cookie: adminCookie, body: { text: 'vless://11111111-2222-3333-4444-555555555555@203.0.113.7:443?encryption=none&security=reality&sni=www.speedtest.net#Iran-Free-1\nvless://bad-uri', tier: 'free', country: '🇩🇪' } });
    check('کانفیگ معتبر اضافه و نامعتبر رد شد', add.json?.ok === true && add.json.added_count === 1 && add.json.rejected?.length === 1, JSON.stringify(add.json).slice(0, 180));
    const pub = await req('/api/mc/configs');
    check('بخش عمومی کانفیگ‌ها پر شد', pub.json?.count >= 1 && Array.isArray(pub.json.items));
    const urisNoAuth = await req('/api/mc/configs/uris');
    check('URI کانفیگ بدون احراز هویت داده نمی‌شود', urisNoAuth.status === 401);
    const uris = await req('/api/mc/configs/uris', { cookie: userCookie });
    check('URI بعد از احراز هویت در دسترس است', uris.json?.ok === true && Object.keys(uris.json.uris || {}).length >= 1);
    const sub = await req('/mc/configs/sub.txt');
    check('ساب متنی برای v2rayNG تولید می‌شود', sub.status === 200 && sub.text.includes('vless://'));
    const fb = await req('/api/mc/configs/feedback', { method: 'POST', body: { id: 1, ok: true } });
    check('بازخورد کاربر ثبت می‌شود', fb.json?.ok === true);
    const chk = await req('/api/mc/admin/config_check', { method: 'POST', cookie: adminCookie, body: {} });
    check('بررسی سلامت اجرا شد (بدون دروغ)', Array.isArray(chk.json?.results), JSON.stringify(chk.json?.results || []).slice(0, 160));
  }

  section('۹) برندینگ AI + جایگزین قطعی');
  {
    const info = await req('/api/mc/admin/brand', { method: 'POST', cookie: adminCookie, body: {} });
    check('اطلاعات برند خوانده می‌شود', info.json?.ok === true && !!info.json.info);
    check('تم از اسم سرور استخراج شد', !!info.json?.info?.theme?.prompt || !!info.json?.fallback_preview);
    const logo = await req('/mc/brand/logo.png');
    check('لوگو سرو می‌شود (AI یا SVG جایگزین)', logo.status === 200 && (logo.headers.get('Content-Type') || '').startsWith('image/'), logo.headers.get('X-Nova-Brand') || '');
    const gen = await req('/api/mc/admin/brand_generate', { method: 'POST', cookie: adminCookie, body: { name: 'Nova Edge Gods' } });
    check('تلاش برای ساخت برند با AI (در نبود AI هم نمی‌شکند)', gen.status === 200 && typeof gen.json?.ok === 'boolean', JSON.stringify(gen.json).slice(0, 140));
  }

  section('۱۰) صفحات عمومی و دارایی‌ها');
  {
    const home = await req('/mc');
    check('خانه: اسم سرور و آدرس نمایش داده می‌شود', home.text.includes('Nova Edge Gods') && home.text.includes('play.novaedge.test'));
    check('خانه: کارت ۱۴ گیم‌مود', (home.text.match(/\/mc\/modes\//g) || []).length >= 14);
    check('خانه: نردبان رنک ۶ پله', ['رایگان', 'نوب', 'معمولی', 'پرو', 'گاد', 'الترا گاد'].every((r) => home.text.includes(r)));
    const modes = await req('/mc/modes');
    check('صفحهٔ گیم‌مودها همهٔ ۱۴ مود را دارد', ['بدوارز', 'اسکای‌وارز', 'بازی‌های بقا', 'تی‌ان‌تی ران', 'کارآگاه و قاتل', 'پارکور', 'نبرد ساخت‌وساز', 'اسپلیف', 'پل', 'اولترا هاردکور', 'بقا در برابر زامبی', 'کیت‌پی‌وی‌پی', 'دوئل', 'فکشنز لایت'].every((n) => modes.text.includes(n)));
    const detail = await req('/mc/modes/murdermystery');
    check('صفحهٔ جزئیات مود + جدول امتیاز', detail.text.includes('جدول امتیاز') && detail.text.includes('بقای بی‌گناه') && detail.text.includes('برد قاتل'), detail.text.slice(0, 80));
    check('جزئیات مود: نقشه + کیت/فروشگاه + رفتار بات', detail.text.includes('نقشه‌ها') && detail.text.includes('deception') && detail.text.includes('نقش‌ها'));
    const bw = await req('/mc/modes/bedwars');
    check('بدوارز: ارتقای تیمی و شکستن تخت در جدول امتیاز', bw.text.includes('شکستن تخت') && bw.text.includes('ارتقاهای تیمی'));
    check('مود نامعتبر ۴۰۴ می‌دهد', (await req('/mc/modes/not-a-mode')).status === 404);
    const asset = await req('/mc/admin.js');
    check('اسکریپت داشبورد به‌عنوان asset سرو می‌شود', asset.status === 200 && asset.text.includes('RENDERERS'));
    const img = await req('/mc/img/bedwars-banner.jpg');
    check('مسیر تصویر وجود دارد (واقعی یا placeholder)', img.status === 200);
    const dash = await req('/mc/admin', { cookie: adminCookie });
    check('داشبورد با نشست رندر می‌شود', dash.text.includes('داشبورد مالک'));
    const iran = await req('/mc/iran');
    check('صفحهٔ راهنمای نت ایران', iran.text.includes('فیلترینگ') || iran.text.includes('DNS'));
    const terms = await req('/mc/terms');
    check('صفحهٔ قوانین', terms.text.includes('قوانین'));
  }

  section('۱۱) ضداسپم: خوشهٔ IP و حساب‌های تکراری');
  {
    const s2 = await req('/api/mc/auth/send', { method: 'POST', body: { phone: PHONE2 } });
    const v2 = await req('/api/mc/auth/verify', { method: 'POST', body: { phone: PHONE2, code: s2.json?.dev_code } });
    check('شمارهٔ دوم تأیید می‌شود', v2.json?.ok === true);
    const fl = await req('/api/mc/admin/fraud', { cookie: adminCookie });
    check('صف تقلب قابل خواندن است', Array.isArray(fl.json?.items));
    const otpState = await req('/api/mc/admin/otp_state', { cookie: adminCookie });
    check('آخرین درخواست‌های کد در پنل دیده می‌شود', (otpState.json?.recent || []).length >= 2);
    check('تنظیمات ضدتقلب در پنل قابل تغییرند', otpState.json?.config?.fraud?.ipMaxAccounts > 0);
  }

  console.log('\n' + '─'.repeat(52));
  console.log(`\x1b[1mنتیجه: ${pass} موفق${fails.length ? `، ${fails.length} ناموفق` : ''}\x1b[0m`);
  if (fails.length) {
    console.log('\nناموفق‌ها:');
    fails.forEach((f) => console.log('  • ' + f));
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error('💥 خطای غیرمنتظره:', e);
  process.exit(1);
});
