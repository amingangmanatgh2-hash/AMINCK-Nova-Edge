// ═══════════════════════════════════════════════════════════════════
//  Nova Edge — سفارش‌ها، درگاه پرداخت و کارت‌به‌کارت + تأیید فیش با AI
//
//  صادقانه:
//   • درگاه فقط یک «درایور» است؛ مرچنت‌آیدی/لینک را خودتان از پنل وارد کنید.
//   • هیچ پرداختی بدون verify سرور‌به‌سرور ثبت نمی‌شود.
//   • فیش کارت‌به‌کارت با Workers AI بررسی می‌شود؛ هر مورد مشکوک به صف
//     ادمین می‌رود و هرگز خودکار تأیید نمی‌شود (فیش تکراری/دستکاری/مبلغ غلط).
// ═══════════════════════════════════════════════════════════════════
import { mcGet, mcSet, mcNum, mcBool, sha256Hex, hashSecret, bridgeKey, ipKey, pushAlert, ensurePlayer } from './db.js';
import { buildCatalog, usdRate, toToman, trackBehavior, findItem } from './catalog.js';
import { analyzeReceipt } from '../verify.js';
import { notifyAdmins } from '../notify.js';
import { flagFraud, maskPhone } from './auth.js';
import { json, clamp } from '../util.js';
import { listRanks, listCosmetics, getRank } from '../../shared/engine/spec.js';

const now = () => Math.floor(Date.now() / 1000);
const randRef = () => {
  const b = new Uint8Array(6);
  crypto.getRandomValues(b);
  return `NE${Date.now().toString(36).toUpperCase()}${Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('').toUpperCase()}`;
};

// ───────────────────────── تنظیمات درگاه ─────────────────────────
export async function mcGatewayConfig(db) {
  const provider = String(await mcGet(db, 'gateway_provider', 'zarinpal')).toLowerCase();
  const enabled = await mcBool(db, 'gateway_enabled', false);
  return {
    enabled,
    provider,
    merchantId: String(await mcGet(db, 'gateway_merchant_id', '')).trim(),
    apiKey: String(await mcGet(db, 'gateway_api_key', '')).trim(),
    url: String(await mcGet(db, 'gateway_url', '')).trim(),
    currency: String(await mcGet(db, 'gateway_currency', 'IRT')).toUpperCase(),
    callbackPath: '/mc/pay/callback',
  };
}

export async function mcCardConfig(db) {
  return {
    enabled: await mcBool(db, 'card_enabled', true),
    number: String(await mcGet(db, 'card_number', '')).replace(/\D/g, ''),
    holder: String(await mcGet(db, 'card_holder', '')),
    bank: String(await mcGet(db, 'card_bank', '')),
    autoVerify: await mcBool(db, 'card_auto_verify', false),
  };
}

// ───────────────────────── ساخت سفارش ─────────────────────────
export async function createOrder(env, db, { itemId, ctx, username = '', ip = '' }) {
  const item = await findItem(env, db, itemId, { userKey: ctx?.phone_key, totalSpentUsd: ctx?.total_spent_usd || 0, ip });
  if (!item) return { ok: false, error: 'محصول پیدا نشد' };
  const rate = await usdRate(env);
  const priceUsd = Number(item.price_usd_final ?? item.price_usd) || 0;
  const amountToman = toToman(priceUsd, rate.rate);
  const gw = await mcGatewayConfig(db);
  const card = await mcCardConfig(db);
  const methods = [];
  if (gw.enabled && gw.merchantId && amountToman > 0) methods.push('gateway');
  if (card.enabled && card.number) methods.push('card');
  if (!methods.length) return { ok: false, error: 'درگاه پرداخت فعال نیست. ادمین باید لینک درگاه یا شمارهٔ کارت را در پنل وارد کند.', methods: [] };

  const ref = randRef();
  await db
    .prepare(
      `INSERT INTO mc_orders (ref, phone_key, player_id, username, item_id, item_type, item_title, list_usd, discount_pct, amount_usd, amount_toman, usd_rate, method, provider, status, ip_key, discount_json, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    )
    .bind(
      ref, ctx?.phone_key || '', ctx?.player_id || '', String(username).slice(0, 32), item.id, item.type, item.title_fa,
      item.price_usd || 0, item.pct || 0, priceUsd, amountToman, rate.rate, methods[0], gw.provider, 'pending',
      await ipKey(ip), JSON.stringify({ reasons: item.price_reasons || [], parts: item.discount?.parts || {}, ai_delta: item.ai_delta || 0 }), now()
    )
    .run();
  await trackBehavior(db, { userKey: ctx?.phone_key, itemId: item.id, event: 'cart', discountPct: item.pct || 0, amountUsd: priceUsd, ip });
  const order = await db.prepare('SELECT * FROM mc_orders WHERE ref=?').bind(ref).first();
  return { ok: true, order, methods, item, rate: rate.rate, amount_usd: priceUsd, amount_toman: amountToman };
}

// ───────────────────────── درگاه بانکی ─────────────────────────
const amountFor = (toman, currency) => (currency === 'IRT' ? toman * 10 : toman);

export async function startGatewayPayment(env, db, order, baseUrl) {
  const cfg = await mcGatewayConfig(db);
  if (!cfg.enabled) return { ok: false, error: 'درگاه غیرفعال است' };
  const amount = amountFor(order.amount_toman, cfg.currency);
  const callback = `${baseUrl}${cfg.callbackPath}?ref=${encodeURIComponent(order.ref)}&sig=${await orderSig(db, order.ref, order.amount_toman)}`;
  const p = String(cfg.provider).toLowerCase();
  try {
    if (p === 'zarinpal') {
      const api = cfg.url || 'https://api.zarinpal.com/pg/v4/payment/request.json';
      const res = await fetch(api, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ merchant_id: cfg.merchantId, amount, callback_url: callback, description: `Nova Edge — ${order.item_title}`.slice(0, 100), metadata: { ref: order.ref } }),
      });
      const j = await res.json();
      const authority = j?.data?.authority;
      if (authority && j?.data?.code === 100) {
        const payUrl = `https://www.zarinpal.com/pg/StartPay/${authority}`;
        await db.prepare('UPDATE mc_orders SET provider=?, gateway_ref=?, method=? WHERE id=?').bind('zarinpal', String(authority), 'gateway', order.id).run();
        return { ok: true, url: payUrl, authority };
      }
      return { ok: false, error: `درگاه خطا داد (${j?.errors?.code ?? res.status}): ${j?.errors?.message ?? ''}`.slice(0, 200) };
    }
    if (p === 'idpay') {
      const res = await fetch(cfg.url || 'https://api.idpay.ir/v1.1/payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-KEY': cfg.apiKey || cfg.merchantId, 'X-SANDBOX': (await mcBool(db, 'gateway_sandbox', false)) ? '1' : '0' },
        body: JSON.stringify({ order_id: order.ref, amount, callback: callback, name: order.username || 'کاربر', desc: order.item_title }),
      });
      const j = await res.json();
      if (j?.link) {
        await db.prepare('UPDATE mc_orders SET provider=?, gateway_ref=?, method=? WHERE id=?').bind('idpay', String(j.id || ''), 'gateway', order.id).run();
        return { ok: true, url: j.link, authority: j.id };
      }
      return { ok: false, error: `IDPay: ${j?.error_message || res.status}`.slice(0, 200) };
    }
    if (p === 'custom') {
      const tpl = JSON.parse((await mcGet(db, 'gateway_custom_request', '')) || '{}');
      if (!tpl.url) return { ok: false, error: 'قالب درگاه دلخواه تنظیم نشده' };
      const fill = (s) => String(s).replace(/\{amount\}/g, amount).replace(/\{callback\}/g, callback).replace(/\{ref\}/g, order.ref).replace(/\{merchant\}/g, cfg.merchantId).replace(/\{key\}/g, cfg.apiKey).replace(/\{title\}/g, order.item_title);
      const body = JSON.parse(fill(JSON.stringify(tpl.body || {})));
      const res = await fetch(fill(tpl.url), { method: tpl.method || 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const j = await res.json();
      const urlPath = String(tpl.result_url_path || 'data.url');
      const url = urlPath.split('.').reduce((o, k) => (o == null ? o : o[k]), j);
      if (url) {
        await db.prepare('UPDATE mc_orders SET provider=?, gateway_ref=?, method=? WHERE id=?').bind('custom', String(url).slice(0, 120), 'gateway', order.id).run();
        return { ok: true, url };
      }
      return { ok: false, error: `درگاه دلخواه پاسخ معتبر نداد (${res.status})` };
    }
    return { ok: false, error: `پرووایدر ناشناخته: ${cfg.provider}` };
  } catch (e) {
    return { ok: false, error: String(e).slice(0, 160) };
  }
}

export const orderSig = (db, ref, amount) => bridgeKey(db).then((k) => hashSecret(k, `order|${ref}|${amount}`));

export async function verifyGatewayCallback(env, db, url, baseUrl) {
  const ref = String(url.searchParams.get('ref') || '');
  const sig = String(url.searchParams.get('sig') || '');
  const order = await db.prepare('SELECT * FROM mc_orders WHERE ref=?').bind(ref).first();
  if (!order) return { ok: false, html: 'سفارش پیدا نشد' };
  const expect = await orderSig(db, ref, order.amount_toman);
  if (sig !== expect) return { ok: false, html: 'امضای بازگشت نامعتبر است' };
  if (order.status === 'paid') return { ok: true, already: true, order };

  const cfg = await mcGatewayConfig(db);
  const amount = amountFor(order.amount_toman, cfg.currency);
  const p = String(cfg.provider).toLowerCase();
  const authority = url.searchParams.get('Authority') || url.searchParams.get('authority') || order.gateway_ref;
  const status = url.searchParams.get('Status') || url.searchParams.get('status') || 'OK';
  try {
    if (p === 'zarinpal') {
      if (String(status).toUpperCase() !== 'OK') return await failOrder(db, order, 'کاربر پرداخت را لغو کرد');
      const res = await fetch(cfg.url ? cfg.url.replace('request.json', 'verify.json') : 'https://api.zarinpal.com/pg/v4/payment/verify.json', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ merchant_id: cfg.merchantId, amount, authority }),
      });
      const j = await res.json();
      if (j?.data?.code === 100 || j?.data?.ref_id) {
        return await fulfillOrder(env, db, order, { method: 'gateway', provider: 'zarinpal', gateway_ref: String(j?.data?.ref_id || authority) });
      }
      return await failOrder(db, order, `وریفای ناموفق (${j?.errors?.code ?? res.status})`);
    }
    if (p === 'idpay') {
      const res = await fetch('https://api.idpay.ir/v1.1/payment/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-KEY': cfg.apiKey || cfg.merchantId },
        body: JSON.stringify({ id: authority, order_id: ref }),
      });
      const j = await res.json();
      if (Number(j?.status) === 100 || Number(j?.status) === 200) return await fulfillOrder(env, db, order, { method: 'gateway', provider: 'idpay', gateway_ref: String(j?.track_id || authority) });
      return await failOrder(db, order, `IDPay verify status=${j?.status ?? res.status}`);
    }
    if (p === 'custom') {
      const tpl = JSON.parse((await mcGet(db, 'gateway_custom_verify', '')) || '{}');
      if (!tpl.url) return await failOrder(db, order, 'قالب وریفای تنظیم نشده');
      const fill = (s) => String(s).replace(/\{authority\}/g, authority).replace(/\{ref\}/g, ref).replace(/\{amount\}/g, amount).replace(/\{merchant\}/g, cfg.merchantId).replace(/\{key\}/g, cfg.apiKey).replace(/\{status\}/g, status);
      const res = await fetch(fill(tpl.url), { method: tpl.method || 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(JSON.parse(fill(JSON.stringify(tpl.body || {})))) });
      const j = await res.json();
      const okPath = String(tpl.success_path || 'data.success');
      const okVal = okPath.split('.').reduce((o, k) => (o == null ? o : o[k]), j);
      if (okVal === true || okVal === 1 || okVal === '1') return await fulfillOrder(env, db, order, { method: 'gateway', provider: 'custom', gateway_ref: String(authority) });
      return await failOrder(db, order, 'وریفای درگاه دلخواه ناموفق');
    }
    return await failOrder(db, order, 'پرووایدر ناشناخته');
  } catch (e) {
    return await failOrder(db, order, `خطای شبکه در وریفای: ${String(e).slice(0, 100)}`);
  }
}

async function failOrder(db, order, reason) {
  await db.prepare("UPDATE mc_orders SET status='rejected' WHERE id=?").bind(order.id).run();
  await pushAlert(db, 'payment_failed', `${order.ref}: ${reason}`, 2);
  return { ok: false, html: reason };
}

// ───────────────────────── کارت‌به‌کارت + فیش هوشمند ─────────────────────────
export async function submitReceipt(env, db, { orderRef, imageB64, amountClaimed = 0, tracking = '', ctx, ip = '' }) {
  const order = await db.prepare('SELECT * FROM mc_orders WHERE ref=?').bind(String(orderRef)).first();
  if (!order) return { ok: false, error: 'سفارش پیدا نشد' };
  if (ctx?.phone_key && order.phone_key && order.phone_key !== ctx.phone_key) return { ok: false, error: 'این سفارش به شمارهٔ شما تعلق ندارد' };
  if (order.status === 'paid') return { ok: false, error: 'این سفارش قبلاً پرداخت شده' };
  let bytes = null;
  try {
    const b64 = String(imageB64 || '').replace(/^data:[^;]+;base64,/, '').replace(/\s+/g, '');
    if (b64) bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  } catch {
    return { ok: false, error: 'فایل ارسالی base64 معتبر نیست. لطفاً تصویر را دوباره انتخاب کنید.' };
  }
  if (!bytes || bytes.length < 4096) return { ok: false, error: 'تصویر فیش معتبر نیست (حداقل چند کیلوبایت)' };
  if (bytes.length > 8 * 1024 * 1024) return { ok: false, error: 'حجم تصویر بیش از ۸ مگابایت است' };

  const sha = await sha256Hex(Array.from(bytes).map((b) => String.fromCharCode(b)).join(''));
  const dup = await db.prepare('SELECT id, status, order_id FROM mc_receipts WHERE sha256=?').bind(sha).first();
  const ipk = await ipKey(ip);
  const reasons = [];
  let verdict = 'manual';
  let ai = {};

  if (dup) {
    reasons.push(`این تصویر قبلاً با شناسهٔ ${dup.id} ثبت شده است (وضعیت: ${dup.status})`);
    verdict = 'reject';
    await flagFraud(env, db, 'receipt_reuse', order.ref, { receipt_id: dup.id, sha: sha.slice(0, 16), phone: maskPhone(order.phone_key) }, 3);
  } else {
    ai = await analyzeReceipt(env, bytes, order.amount_toman);
    verdict = ai.verdict || 'manual';
    reasons.push(...(ai.reasons || []));
    // بررسی مبلغ
    const claimed = Number(ai?.data?.amount_toman || amountClaimed || 0);
    if (claimed && Math.abs(claimed - order.amount_toman) > Math.max(1000, order.amount_toman * 0.02)) {
      verdict = 'reject';
      reasons.push(`مبلغ فیش (${claimed}) با مبلغ سفارش (${order.amount_toman}) نمی‌خواند`);
      await flagFraud(env, db, 'amount_mismatch', order.ref, { claimed, expected: order.amount_toman }, 3);
    }
    if (ai?.data?.tampering) {
      verdict = 'reject';
      reasons.push(`اثر دستکاری دیده شد: ${String(ai.data.tampering).slice(0, 120)}`);
      await flagFraud(env, db, 'tampered', order.ref, { detail: String(ai.data.tampering).slice(0, 200) }, 3);
    }
    // تاریخ آینده یا خیلی قدیمی
    const d = String(ai?.data?.gregorian_date || '');
    if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
      const ts = Date.parse(d);
      if (Number.isFinite(ts)) {
        const ageDays = (Date.now() - ts) / 86400000;
        if (ageDays < -1) {
          verdict = 'reject';
          reasons.push(`تاریخ فیش در آینده است (${d})`);
        } else if (ageDays > 3) {
          verdict = 'manual';
          reasons.push(`فیش ${Math.floor(ageDays)} روز پیش است — بررسی دستی`);
        }
      }
    }
    if (!ai?.data?.tracking && !tracking) {
      verdict = verdict === 'auto' ? 'manual' : verdict;
      reasons.push('کد پیگیری روی فیش خوانده نشد');
    }
  }

  const autoApprove = await mcBool(db, 'card_auto_verify', false);
  const finalStatus = verdict === 'reject' ? 'rejected' : verdict === 'auto' && autoApprove ? 'approved' : 'pending';

  await db
    .prepare('INSERT INTO mc_receipts (order_id, sha256, bytes, amount_claimed, tracking, ai_verdict, ai_json, ai_reasons, status, reused, ip_key, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)')
    .bind(order.id, sha, bytes.length, Number(amountClaimed) || 0, String(tracking).slice(0, 60), verdict, JSON.stringify(ai?.data || {}).slice(0, 2000), JSON.stringify(reasons).slice(0, 1500), finalStatus, dup ? 1 : 0, ipk, now())
    .run();
  const receiptId = (await db.prepare('SELECT id FROM mc_receipts WHERE sha256=? ORDER BY id DESC LIMIT 1').bind(sha).first())?.id;
  await db.prepare("UPDATE mc_orders SET status=?, receipt_id=?, method='card' WHERE id=?").bind(finalStatus === 'approved' ? 'paid' : finalStatus === 'rejected' ? 'rejected' : 'manual', receiptId || 0, order.id).run();

  if (finalStatus === 'approved') {
    await fulfillOrder(env, db, { ...order, status: 'manual' }, { method: 'card', receipt_id: receiptId });
    return { ok: true, status: 'approved', message: 'پرداخت تأیید شد و آیتم فعال گردید.', receipt_id: receiptId };
  }
  if (finalStatus === 'rejected') {
    try {
      await notifyAdmins(env, 'suspicious', `❌ فیش رد شد — سفارش ${order.ref}\n${reasons.slice(0, 4).join('\n')}`);
    } catch {}
    return { ok: false, status: 'rejected', message: 'فیش پذیرفته نشد.', reasons };
  }
  try {
    await notifyAdmins(env, 'receipt', `🧾 فیش جدید در صف — سفارش ${order.ref} / ${order.amount_toman} تومان\nحکم AI: ${verdict}\n${reasons.slice(0, 3).join('\n')}`);
  } catch {}
  return { ok: true, status: 'pending', message: 'فیش ثبت شد و در صف بررسی ادمین است.', reasons, verdict, receipt_id: receiptId };
}

// ───────────────────────── تحویل (fulfillment) ─────────────────────────
export async function fulfillOrder(env, db, order, extra = {}) {
  if (!order) return { ok: false, error: 'no_order' };
  const cat = await buildCatalog({ env, db, withPricing: false });
  const item = cat.items.find((i) => i.id === order.item_id);
  await db
    .prepare("UPDATE mc_orders SET status='paid', paid_at=?, provider=?, gateway_ref=?, method=? WHERE id=?")
    .bind(now(), extra.provider || order.provider || '', extra.gateway_ref || order.gateway_ref || '', extra.method || order.method || '', order.id)
    .run();

  const results = [];
  const username = order.username || '';
  const playerKey = username ? `name:${username.toLowerCase()}` : '';

  // گرانت برای پلاگین (در اولین اتصال یا poll تحویل می‌شود)
  const grant = async (type, payload, target = '') => {
    await db
      .prepare('INSERT INTO mc_grants (player_key, username, phone_key, item_id, type, payload, status, order_ref, created_at) VALUES (?,?,?,?,?,?,?,?,?)')
      .bind(target || playerKey, username, order.phone_key || '', order.item_id, type, JSON.stringify(payload || {}).slice(0, 900), 'pending', order.ref, now())
      .run();
    results.push({ type, target: target || playerKey });
  };

  const payload = item?.payload || {};
  switch (order.item_type) {
    case 'rank':
      if (playerKey) await grant('rank', { rank_id: payload.rank_id });
      if (order.phone_key) await db.prepare('UPDATE mc_players SET rank_bought=? WHERE phone_key=? AND (rank_bought=? OR rank_bought=?)').bind(payload.rank_id || '', order.phone_key, '', 'free').run();
      break;
    case 'cosmetic':
      if (playerKey) await grant('cosmetic', { cosmetic_id: payload.cosmetic_id, slot: payload.slot });
      await addCosmetic(db, order.phone_key, payload.cosmetic_id);
      break;
    case 'bundle':
      for (const cid of payload.cosmetic_ids || []) {
        if (playerKey) await grant('cosmetic', { cosmetic_id: cid });
        await addCosmetic(db, order.phone_key, cid);
      }
      break;
    case 'gems':
      if (playerKey) await grant('gems', { gems: payload.gems, bonus_pct: payload.bonus_pct });
      await db.prepare('UPDATE mc_players SET gems=gems+? WHERE phone_key=?').bind(Math.round((payload.gems || 0) * (1 + (payload.bonus_pct || 0) / 100)), order.phone_key).run();
      break;
    case 'season':
      if (playerKey) await grant('battlepass', { season_id: payload.season_id });
      await db.prepare('UPDATE mc_players SET battlepass=1 WHERE phone_key=?').bind(order.phone_key).run();
      break;
    case 'config':
      await grant('config', { tier: payload.config_tier, days: payload.days }, order.phone_key || playerKey);
      break;
    default:
      await grant('custom', payload);
  }

  // آمار کاربر
  if (order.phone_key) {
    await db.prepare('UPDATE mc_players SET total_paid_usd=total_paid_usd+? WHERE phone_key=?').bind(Number(order.amount_usd) || 0, order.phone_key).run();
    // رفرال: ۱۰٪ از اولین خرید به معرف
    const p = await db.prepare('SELECT referred_by FROM mc_players WHERE phone_key=?').bind(order.phone_key).first();
    if (p?.referred_by) {
      const reward = Math.round((Number(order.amount_usd) || 0) * 100 * 0.1); // سنت
      await db.prepare('UPDATE mc_players SET gems=gems+? WHERE id=? OR referral_code=?').bind(Math.max(1, Math.round(reward / 100)), p.referred_by, p.referred_by).run();
      await pushAlert(db, 'referral_reward', `پاداش رفرال ${p.referred_by} از سفارش ${order.ref}`, 1);
    }
  }
  await trackBehavior(db, { userKey: order.phone_key, itemId: order.item_id, event: 'purchase', discountPct: order.discount_pct, amountUsd: order.amount_usd, ip: '' });
  try {
    await notifyAdmins(env, 'purchase', `💰 خرید جدید: ${order.item_title} — ${order.amount_usd}$ (${order.amount_toman} تومان) / ${order.ref}`);
  } catch {}
  return { ok: true, delivered: results };
}

async function addCosmetic(db, phoneKey, cosmeticId) {
  if (!phoneKey || !cosmeticId) return;
  const p = await db.prepare('SELECT cosmetics FROM mc_players WHERE phone_key=?').bind(phoneKey).first();
  if (!p) return;
  let list = [];
  try {
    list = JSON.parse(p.cosmetics || '[]');
  } catch {}
  if (!list.includes(cosmeticId)) list.push(cosmeticId);
  await db.prepare('UPDATE mc_players SET cosmetics=? WHERE phone_key=?').bind(JSON.stringify(list), phoneKey).run();
}

/** صف فیش‌ها برای پنل ادمین */
export async function receiptQueue(db, status = 'pending', limit = 40) {
  const rows = await db
    .prepare('SELECT r.*, o.ref AS order_ref, o.amount_toman, o.amount_usd, o.item_title, o.username FROM mc_receipts r LEFT JOIN mc_orders o ON o.id=r.order_id WHERE r.status=? ORDER BY r.id DESC LIMIT ?')
    .bind(status, limit)
    .all();
  return rows.results || [];
}

export async function decideReceipt(env, db, receiptId, decision, reviewer = 'admin') {
  const r = await db.prepare('SELECT * FROM mc_receipts WHERE id=?').bind(Number(receiptId)).first();
  if (!r) return { ok: false, error: 'فیش پیدا نشد' };
  const st = decision === 'approve' ? 'approved' : 'rejected';
  await db.prepare('UPDATE mc_receipts SET status=?, reviewed_at=?, reviewer=? WHERE id=?').bind(st, now(), String(reviewer).slice(0, 32), r.id).run();
  const order = await db.prepare('SELECT * FROM mc_orders WHERE id=?').bind(r.order_id).first();
  if (!order) return { ok: true, status: st };
  if (st === 'approved') await fulfillOrder(env, db, order, { method: 'card', receipt_id: r.id });
  else {
    await db.prepare("UPDATE mc_orders SET status='rejected' WHERE id=?").bind(order.id).run();
    await flagFraud(env, db, 'amount_mismatch', order.ref, { rejected_by: reviewer, reasons: JSON.parse(r.ai_reasons || '[]') }, 2);
  }
  return { ok: true, status: st, order_ref: order.ref };
}
