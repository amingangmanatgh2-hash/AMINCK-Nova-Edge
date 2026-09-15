// ═══════════════════════════════════════════════════════════════════
//  Nova Edge — روتر بخش وب (سایت + فروشگاه + پنل + API + پل پلاگین)
//  همهٔ مسیرهای /mc/* و /api/mc/* اینجا مدیریت می‌شوند تا کد ربات
//  تلگرام موجود دست‌نخورده بماند.
// ═══════════════════════════════════════════════════════════════════
import { html, json, text, esc } from '../util.js';
import { initMcDb, mcGet, mcBool, sha256Hex, ipKey, serverConfig, playerByName, ensurePlayer, pushAlert, bridgeKey } from './db.js';
import { page, navHtml, footerHtml } from './theme.js';
import { homePage, modesPage, modeDetailPage, leaderboardPage, playerPage, shopPage, authPage, configsPage, iranPage, statusPage, referralPage, reportPage, termsPage } from './site.js';
import { sessionFromRequest, requestOtp, verifyOtp, logout, otpConfig, maskPhone } from './auth.js';
import { setupPage, handleSetupApi, adminPage, handleAdminApi, adminSession, adminCookie, clientIp } from './admin.js';
import { publicStatus, handleHeartbeat, handlePlayerSync, handleMatchReport, handleBotTier, handleBotEscalate, handleBotDecide, handleAnticheat, handleReport, runtimeConfig, authBridge, playerDto } from './bridge.js';
import { createOrder, startGatewayPayment, verifyGatewayCallback, submitReceipt, mcCardConfig } from './orders.js';
import { buildCatalog, itemDto, trackBehavior, activeSeason, usdRate } from './catalog.js';
import { configsPublic, listConfigs, configFeedback, subscriptionText, parseConfigUri } from './freeconfigs.js';
import { serveAsset, svgBrand, brandInfo } from './brand.js';
import { listModes, getMode, listRanks, listCosmetics, SPECS, modeSummary } from '../../shared/engine/spec.js';
import { makeBrandQR } from '../qr.js';

const now = () => Math.floor(Date.now() / 1000);

export async function handleMc(env, request, url) {
  await initMcDb(env.DB);
  const db = env.DB;
  const path = url.pathname;
  const method = request.method.toUpperCase();
  const ip = clientIp(request);
  const ctx = await sessionFromRequest(db, request);
  const cfg = await serverConfig(db);
  env.__serverName = cfg.name;

  // نگه‌داشتن مرجع رفرال
  const refCode = url.searchParams.get('ref') || '';

  try {
    // ───────────── صفحات عمومی ─────────────
    if (path === '/' || path === '/mc' || path === '/mc/' || path === '/mc/home') return await homePage(env, db, request);
    if (path === '/mc/modes' || path === '/mc/modes/') return await modesPage(env, db, request);
    if (path.startsWith('/mc/modes/')) return await modeDetailPage(env, db, decodeURIComponent(path.slice(10)));
    if (path === '/mc/leaderboard') return await leaderboardPage(env, db, request, url);
    if (path.startsWith('/mc/player/')) return await playerPage(env, db, decodeURIComponent(path.slice(11)));
    if (path === '/mc/status') return await statusPage(env, db);
    if (path === '/mc/iran') return await iranPage(env, db);
    if (path === '/mc/configs' || path === '/mc/configs/') return await configsPage(env, db, request, ctx);
    if (path === '/mc/referral') return await referralPage(env, db, request, ctx);
    if (path === '/mc/report') return await reportPage(env, db, request, ctx);
    if (path === '/mc/terms') return await termsPage(env, db);
    if (path.startsWith('/mc/r/')) {
      const code = path.slice(6).slice(0, 24);
      const resp = await homePage(env, db, request);
      const body = new Response(resp.body, resp);
      body.headers.append('Set-Cookie', `nova_ref=${encodeURIComponent(code)}; Path=/; Max-Age=${30 * 86400}; SameSite=Lax`);
      return body;
    }

    // ───────────── احراز هویت / حساب ─────────────
    if (path === '/mc/auth' || path === '/mc/auth/') return await authPage(env, db, request, ctx);
    if (path === '/mc/account') return await authPage(env, db, request, ctx);

    // ───────────── فروشگاه (قفل تا احراز هویت) ─────────────
    if (path === '/mc/shop' || path === '/mc/shop/') {
      if (ctx?.verified) await attachPlayer(db, ctx);
      return await shopPage(env, db, request, ctx, url);
    }

    // ───────────── برند و دارایی‌ها ─────────────
    if (path.startsWith('/mc/brand/')) {
      const key = path.slice(10).replace(/\.(png|jpg|jpeg|webp|svg)$/i, '');
      return await serveAsset(db, key, cfg.name);
    }
    if (path === '/mc/brand.json') return json({ ok: true, ...(await brandInfo(db)) });
    if (path === '/mc/qr/address') {
      const addr = cfg.address || 'https://example.com';
      const png = await makeBrandQR(`minecraft://connect?server=${addr}`, cfg.name);
      return new Response(png, { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=3600' } });
    }
    if (path.startsWith('/mc/img/')) return await staticImageOrPlaceholder(env, request, path);

    // ───────────── پنل ادمین ─────────────
    if (path === '/mc/setup' || path === '/mc/setup/') return await setupPage(env, db, request);
    if (path === '/mc/admin' || path === '/mc/admin/') {
      const s = await adminSession(db, request);
      return await adminPage(env, db, request, s);
    }

    // ───────────── API عمومی ─────────────
    if (path === '/api/mc/status') return json(await publicStatus(db));
    if (path === '/api/mc/spec') return json({ ok: true, version: SPECS.gamemodes.version, gamemodes: SPECS.gamemodes, ranks: SPECS.ranks, tiers: SPECS.tiers, cosmetics: SPECS.cosmetics, economy: SPECS.economy });
    if (path === '/api/mc/modes') return json({ ok: true, modes: listModes().map((m) => modeSummary(m)) });
    if (path === '/api/mc/leaderboard') {
      const b = url.searchParams.get('b') || 'rating';
      const modeId = url.searchParams.get('mode') || '';
      const col = { rating: 'rating', wins: 'wins', kills: 'kills', rp: 'rp' }[b] || 'rating';
      if (modeId) {
        const rows = await db.prepare("SELECT p.username, SUM(mp.points) points, SUM(mp.kills) kills, COUNT(*) games, SUM(mp.won) wins FROM mc_match_players mp JOIN mc_players p ON p.id=mp.player_id JOIN mc_matches m ON m.id=mp.match_id WHERE m.mode=? AND mp.is_bot=0 GROUP BY mp.player_id ORDER BY points DESC LIMIT 25").bind(modeId).all();
        return json({ ok: true, board: `mode:${modeId}`, rows: rows.results || [] });
      }
      const rows = await db.prepare(`SELECT username, rating, level, rp, wins, kills, deaths, games, rank_id, rank_bought FROM mc_players WHERE banned=0 ORDER BY ${col} DESC LIMIT 25`).all();
      return json({ ok: true, board: b, rows: rows.results || [] });
    }
    if (path.startsWith('/api/mc/player/')) {
      const p = await playerByName(db, decodeURIComponent(path.slice(15)));
      return p ? json({ ok: true, player: playerDto(p, listRanks()) }) : json({ ok: false, error: 'player not found' }, 404);
    }
    if (path === '/api/mc/configs') return json({ ok: true, ...(await configsPublic(db)) });
    if (path === '/mc/configs/sub.txt') {
      const s = await subscriptionText(db, { tier: 'free' });
      return text(s, 200, 'text/plain; charset=utf-8');
    }
    if (path === '/mc/configs/sub.b64') {
      const s = await subscriptionText(db, { tier: 'free' });
      return text(btoa(unescape(encodeURIComponent(s))), 200, 'text/plain; charset=utf-8');
    }
    if (path === '/mc/configs/qr.png') {
      const base = url.origin;
      const png = await makeBrandQR(`${base}/mc/configs`, cfg.name);
      return new Response(png, { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=600' } });
    }
    if (path === '/api/mc/configs/uris') {
      if (!ctx?.verified) return json({ ok: false, error: 'برای دریافت URI باید احراز هویت کنید', need_auth: true }, 401);
      const list = await listConfigs(db, { tier: 'free' });
      const uris = {};
      for (const c of list) uris[c.id] = c.uri;
      return json({ ok: true, uris, count: list.length });
    }
    if (path === '/api/mc/configs/feedback' && method === 'POST') {
      const body = await readJson(request);
      const r = await configFeedback(db, { id: body.id, ok: !!body.ok, ipk: await ipKey(ip) });
      return json(r, r.ok ? 200 : 400);
    }

    // ───────────── API احراز هویت ─────────────
    if (path === '/api/mc/auth/provider') {
      const c = await otpConfig(db);
      const label = { dev: '🧪 حالت تست (کد در همان صفحه نشان داده می‌شود)', sms: '📩 پیامک به شمارهٔ شما', telegram: '✈️ پیام تلگرام (به حساب لینک‌شده یا چت ادمین)' }[c.provider] || c.provider;
      return json({ ok: true, provider: c.provider, html: `${label}<br><span class="small">اعتبار کد: ${Math.round(c.ttl / 60)} دقیقه • حداکثر ${c.maxAttempts} تلاش • حداکثر ${c.rateLimitHour} ارسال در ساعت</span>` });
    }
    if (path === '/api/mc/auth/send' && method === 'POST') {
      const body = await readJson(request);
      const r = await requestOtp(env, db, { phone: body.phone, ip, telegramId: Number(body.telegram_id) || 0 });
      const res = json(r, r.ok ? 200 : 400);
      return res;
    }
    if (path === '/api/mc/auth/verify' && method === 'POST') {
      const body = await readJson(request);
      const r = await verifyOtp(env, db, { phone: body.phone, code: body.code, ip, agent: request.headers.get('User-Agent') || '', telegramId: Number(body.telegram_id) || 0 });
      if (!r.ok) return json(r, 400);
      const next = String(body.next || '/mc/shop').startsWith('/mc') ? String(body.next) : '/mc/shop';
      const resp = json({ ...r, redirect: next });
      resp.headers.append('Set-Cookie', adminCookieSafe(r.token));
      return resp;
    }
    if (path === '/api/mc/auth/logout' && method === 'POST') {
      const m = (request.headers.get('Cookie') || '').match(/nova_session=([a-f0-9]+)/);
      if (m) await logout(db, m[1]);
      const resp = json({ ok: true });
      resp.headers.append('Set-Cookie', 'nova_session=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax');
      return resp;
    }

    // ───────────── حساب کاربری ─────────────
    if (path === '/api/mc/account/profile') {
      if (!ctx?.verified) return json({ ok: false, error: 'auth required' }, 401);
      await attachPlayer(db, ctx);
      const p = ctx.player ? playerDto(ctx.player, listRanks()) : null;
      return json({ ok: true, phone: ctx.auth?.phone_masked || '', player: p });
    }
    if (path === '/api/mc/account/link' && method === 'POST') {
      if (!ctx?.verified) return json({ ok: false, error: 'auth required' }, 401);
      const body = await readJson(request);
      const username = String(body.username || '').trim();
      if (!/^[A-Za-z0-9_]{3,20}$/.test(username)) return json({ ok: false, error: 'نام کاربری ماینکرفت معتبر نیست (۳ تا ۲۰ حرف/عدد/_)' }, 400);
      const existing = await playerByName(db, username);
      if (existing && existing.phone_key && existing.phone_key !== ctx.phone_key) {
        await pushAlert(db, 'link_conflict', `${username} قبلاً به شمارهٔ دیگری متصل شده`, 2);
        return json({ ok: false, error: 'این نام کاربری قبلاً به شمارهٔ دیگری متصل شده است.' }, 409);
      }
      const { player } = await ensurePlayer(db, { username, platform: body.platform === 'bedrock' ? 'bedrock' : 'java', phoneKey: ctx.phone_key, ipKey: await ipKey(ip) });
      await db.prepare('UPDATE mc_players SET phone_key=? WHERE id=?').bind(ctx.phone_key, player.id).run();
      await db.prepare('UPDATE mc_auth SET player_id=? WHERE phone_key=?').bind(player.id, ctx.phone_key).run();
      // رفرال
      const refCookie = (request.headers.get('Cookie') || '').match(/nova_ref=([^;]+)/);
      const refCode = body.referral_code || (refCookie ? decodeURIComponent(refCookie[1]) : '');
      if (refCode && (await mcBool(db, 'referral_enabled', true))) {
        const ref = await db.prepare('SELECT * FROM mc_players WHERE referral_code=?').bind(String(refCode).slice(0, 24)).first();
        if (ref && ref.id !== player.id && !player.referred_by) {
          const eco = SPECS.economy;
          await db.prepare('UPDATE mc_players SET referred_by=?, coins=coins+? WHERE id=?').bind(ref.referral_code, Math.round((eco.coins.referral_reward || 250) / 2), player.id).run();
          await db.prepare('UPDATE mc_players SET referrals=referrals+1, coins=coins+? WHERE id=?').bind(eco.coins.referral_reward || 250, ref.id).run();
          await pushAlert(db, 'referral', `${ref.username} ← ${username}`, 1);
        }
      }
      // تحویل گرانت‌های در انتظار (خرید قبل از اتصال نام کاربری)
      const pend = await db.prepare("SELECT * FROM mc_grants WHERE status='pending' AND phone_key=?").bind(ctx.phone_key).all();
      for (const g of pend.results || []) {
        await db.prepare('UPDATE mc_grants SET player_key=?, username=? WHERE id=?').bind(player.id, player.username, g.id).run();
      }
      return json({ ok: true, message: `نام کاربری ${username} متصل شد ✅ ${(pend.results || []).length ? `${pend.results.length} خرید در انتظار تحویل به سرور منتقل شد.` : ''}`, player: playerDto(await db.prepare('SELECT * FROM mc_players WHERE id=?').bind(player.id).first(), listRanks()) });
    }

    // ───────────── فروشگاه API ─────────────
    if (path === '/api/mc/shop/catalog') {
      if (!ctx?.verified) return json({ ok: false, error: 'برای دیدن محصولات باید احراز هویت کنید', need_auth: true }, 401);
      await attachPlayer(db, ctx);
      const cat = await buildCatalog({ env, db, userKey: ctx.phone_key, totalSpentUsd: ctx.player?.total_paid_usd || 0 });
      return json({ ok: true, rate: cat.rate, season: cat.season, max_discount: cat.max_discount, ai: cat.ai, items: cat.items.map((i) => ({ ...itemDto(i), price_toman: i.price_toman, pct: i.pct, reasons: i.price_reasons })) });
    }
    if (path === '/api/mc/shop/view' && method === 'POST') {
      const body = await readJson(request);
      await trackBehavior(db, { userKey: ctx?.phone_key || (await ipKey(ip)), itemId: body.item_id, event: body.event === 'cart' ? 'cart' : 'view', ip });
      return json({ ok: true });
    }
    if (path === '/api/mc/shop/order' && method === 'POST') {
      if (!ctx?.verified) return json({ ok: false, error: 'auth required', need_auth: true }, 401);
      await attachPlayer(db, ctx);
      const body = await readJson(request);
      const r = await createOrder(env, db, { itemId: body.item_id, ctx: { ...ctx, total_spent_usd: ctx.player?.total_paid_usd || 0 }, username: body.username || ctx.player?.username || '', ip });
      if (!r.ok) return json(r, 400);
      return json({ ok: true, order: { ref: r.order.ref, id: r.order.id, status: r.order.status }, methods: r.methods, amount_usd: r.amount_usd, amount_toman: r.amount_toman, discount: { pct: r.item.pct || 0, reasons: r.item.price_reasons || [] }, item: itemDto(r.item) });
    }

    // ───────────── پرداخت ─────────────
    if (path === '/api/mc/pay/gateway' && method === 'POST') {
      if (!ctx?.verified) return json({ ok: false, error: 'auth required' }, 401);
      const body = await readJson(request);
      const order = await db.prepare('SELECT * FROM mc_orders WHERE ref=?').bind(String(body.ref || '')).first();
      if (!order) return json({ ok: false, error: 'سفارش پیدا نشد' }, 404);
      if (order.phone_key && order.phone_key !== ctx.phone_key) return json({ ok: false, error: 'سفارش متعلق به شما نیست' }, 403);
      const r = await startGatewayPayment(env, db, order, url.origin);
      return json(r, r.ok ? 200 : 400);
    }
    if (path === '/mc/pay/callback') {
      const r = await verifyGatewayCallback(env, db, url, url.origin);
      const cfg2 = await serverConfig(db);
      return html(page({
        title: 'نتیجهٔ پرداخت',
        nav: navHtml({ name: cfg2.name, active: '/mc/shop' }),
        footerHtml: footerHtml({ name: cfg2.name }),
        body: `<div style="max-width:620px;margin:60px auto" class="glass card"><h1>${r.ok ? '✅ پرداخت موفق' : '❌ پرداخت ناموفق'}</h1>
          <div class="mut">${esc(r.html || (r.ok ? 'آیتم شما فعال شد. در اولین اتصال به سرور، رنک/کازمتیک اعمال می‌شود.' : ''))}</div>
          <div class="row" style="margin-top:16px"><a class="btn pri" href="/mc/account">حساب من</a><a class="btn ghost" href="/mc/shop">بازگشت به فروشگاه</a><a class="btn ghost" href="/">خانه</a></div></div>`,
      }));
    }
    if (path === '/api/mc/pay/card-info' && method === 'POST') {
      if (!ctx?.verified) return json({ ok: false, error: 'auth required' }, 401);
      const c = await mcCardConfig(db);
      if (!c.enabled || !c.number) return json({ ok: false, error: 'کارت‌به‌کارت فعال نیست یا شمارهٔ کارتی در پنل ثبت نشده است' }, 400);
      return json({ ok: true, card: { number: c.number, holder: c.holder, bank: c.bank } });
    }
    if (path === '/api/mc/pay/receipt' && method === 'POST') {
      if (!ctx?.verified) return json({ ok: false, error: 'auth required' }, 401);
      const body = await readJson(request);
      const r = await submitReceipt(env, db, { orderRef: body.ref, imageB64: body.image_b64, amountClaimed: body.amount_claimed, tracking: body.tracking, ctx, ip });
      return json(r, r.ok ? 200 : 400);
    }

    // ───────────── گزارش تخلف ─────────────
    if (path === '/api/mc/report' && method === 'POST') {
      const body = await readJson(request);
      const r = await handleReport(env, db, { ...body, reporter: body.reporter || ctx?.player?.username || '' });
      return json(r, r.ok ? 200 : 400);
    }

    // ───────────── پنل ادمین API ─────────────
    if (path.startsWith('/api/mc/setup/')) {
      const action = path.slice('/api/mc/setup/'.length);
      const sess = await adminSession(db, request);
      const r = await handleSetupApi(env, db, request, action, sess);
      if (action === 'save' && r.status === 200) {
        const j = await r.clone().json();
        if (j?.session) {
          const resp = new Response(JSON.stringify(j), r);
          resp.headers.append('Set-Cookie', adminCookie(j.session));
          return resp;
        }
      }
      return r;
    }
    if (path.startsWith('/api/mc/admin/')) {
      const s = await adminSession(db, request);
      return await handleAdminApi(env, db, request, url, s);
    }

    // ───────────── پل پلاگین (v1) ─────────────
    if (path.startsWith('/api/mc/v1/')) {
      const action = path.slice('/api/mc/v1/'.length);
      const raw = method === 'POST' || method === 'PUT' ? await request.text() : '';
      const body = raw ? safeJson(raw) : {};
      const auth = await authBridge(db, request, raw);
      if (!auth.ok) return json({ ok: false, error: auth.error }, 401);
      switch (action) {
        case 'heartbeat': return json(await handleHeartbeat(db, body));
        case 'player/sync': return json(await handlePlayerSync(db, body));
        case 'match/report': return json(await handleMatchReport(env, db, body));
        case 'bot/tier': return json(await handleBotTier(db, body));
        case 'bot/escalate': return json(await handleBotEscalate(db, body));
        case 'bot/decide': return json(await handleBotDecide(env, db, body));
        case 'anticheat': return json(await handleAnticheat(env, db, body));
        case 'report': return json(await handleReport(env, db, body));
        case 'config': return json({ ok: true, config: await runtimeConfig(db) });
        case 'grants': {
          const rows = await db.prepare("SELECT * FROM mc_grants WHERE status='pending' AND (player_key=? OR lower(username)=?) LIMIT 40").bind(String(body.player_key || ''), String(body.username || '').toLowerCase()).all();
          return json({ ok: true, grants: rows.results || [] });
        }
        case 'grants/ack': {
          for (const id of (body.ids || []).slice(0, 60)) {
            await db.prepare("UPDATE mc_grants SET status='delivered', delivered_at=?, attempts=attempts+1 WHERE id=?").bind(now(), Number(id)).run();
          }
          return json({ ok: true, acked: (body.ids || []).length });
        }
        case 'player/get': {
          const p = await playerByName(db, String(body.username || ''));
          return p ? json({ ok: true, player: playerDto(p, listRanks()) }) : json({ ok: false, error: 'not_found' }, 404);
        }
        default: return json({ ok: false, error: `action ناشناخته: ${action}` }, 404);
      }
    }

    return html(page({
      title: 'یافت نشد',
      nav: navHtml({ name: cfg.name }),
      footerHtml: footerHtml({ name: cfg.name }),
      body: '<h1>۴۰۴</h1><div class="glass card"><div class="mut">این مسیر وجود ندارد.</div><div class="row" style="margin-top:12px"><a class="btn pri" href="/">خانه</a><a class="btn ghost" href="/mc/modes">گیم‌مودها</a><a class="btn ghost" href="/mc/admin">پنل ادمین</a></div></div>',
    }), 404);
  } catch (e) {
    console.error('mc route error', path, e);
    try {
      await pushAlert(db, 'route_error', `${path}: ${String(e).slice(0, 140)}`, 3);
    } catch {}
    return json({ ok: false, error: String(e).slice(0, 200) }, 500);
  }
}

const adminCookieSafe = (token) => `nova_session=${token}; Path=/; Max-Age=${30 * 86400}; HttpOnly; SameSite=Lax; Secure`;

/** وصل کردن بازیکن ماینکرفت به نشست تأییدشده */
async function attachPlayer(db, ctx) {
  if (!ctx || ctx.player !== undefined) return;
  const row = await db.prepare('SELECT * FROM mc_players WHERE phone_key=? LIMIT 1').bind(ctx.phone_key).first();
  ctx.player = row || null;
  ctx.total_spent_usd = Number(row?.total_paid_usd) || 0;
}

const readJson = async (request) => {
  try {
    return await request.json();
  } catch {
    return {};
  }
};
const safeJson = (s) => {
  try {
    return JSON.parse(s);
  } catch {
    return {};
  }
};

/** سرو فایل واقعی public/mc/img؛ اگر نبود placeholder تا UI نشکند */
async function staticImageOrPlaceholder(env, request, path) {
  if (env.ASSETS && typeof env.ASSETS.fetch === 'function') {
    try {
      const r = await env.ASSETS.fetch(request);
      if (r && r.status < 400) return r;
    } catch {}
  }
  return placeholderImage(path);
}

/** تصویر جایگزین وقتی asset وجود ندارد (تا UI هرگز نشکند) */
function placeholderImage(path) {
  const name = path.split('/').pop().replace(/\.(jpg|jpeg|png|webp)$/i, '');
  const svg = svgBrand(name, { palette: ['#22d3ee', '#0b1020', '#a855f7'] });
  return new Response(svg, { status: 200, headers: { 'Content-Type': 'image/svg+xml; charset=utf-8', 'Cache-Control': 'public, max-age=300', 'X-Nova-Asset': 'placeholder' } });
}
