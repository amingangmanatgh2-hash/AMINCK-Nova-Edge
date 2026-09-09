// ═══════════════════════════════════════════════════════════════════
//  درگاه پرداخت بانکی (بخش ۵) — ساختار کاملاً قابل تنظیم از پنل
//
//  ادمین از پنل انتخاب می‌کند:
//    • none      → فقط کارت‌به‌کارت (بدون درگاه)
//    • zarinpal  → وب‌سرویس REST v4 (request / verify)
//    • idpay     → API v1 (create payment / verify / webhook)
//    • custom    → قالب آزاد JSON (هر REST API که با آن تطبیق داده شود)
//
//  ⚠️ صادقانه: هیچ مبلغی بدون «تایید سرور‌به‌سرور» درگاه ثبت نمی‌شود.
//  بازگشت مرورگر کاربر (`?Status=OK`) به‌تنهایی اعتبار ندارد؛ ابتدا verify
//  می‌شود. مسیر بازگشت با امضای HMAC محافظت شده تا سفارش جعلی ممکن نباشد.
//  این ماژول درایور است — برای پرداخت واقعی، اکانت/مرچنت‌آیدی خودتان را
//  از درگاه بگیرید و در پنل وارد کنید.
// ═══════════════════════════════════════════════════════════════════
import { getUser, setSetting, fmtToman, faDigits } from './db.js';
import { getSettingValue, getNum } from './texts.js';
import { hmacSha256, toHex } from './util.js';
import { notifyAdmins } from './notify.js';

const now = () => Math.floor(Date.now() / 1000);

export const GATEWAY_PROVIDERS = ['none', 'zarinpal', 'idpay', 'custom'];

/** تنظیمات درگاه — همه از پنل قابل تغییر */
export async function gatewayConfig(env) {
  const db = env.DB;
  const enabled = (await getSettingValue(db, 'gateway_enabled')) === '1';
  const provider = String(await getSettingValue(db, 'gateway_provider') || 'none').toLowerCase();
  const cfg = {
    enabled: enabled && provider !== 'none',
    provider,
    base: String(await getSettingValue(db, 'gateway_api_base') || '').replace(/\/+$/, ''),
    merchantId: String(await getSettingValue(db, 'gateway_merchant_id') || '').trim(),
    apiKey: String(await getSettingValue(db, 'gateway_api_key') || '').trim(),
    currency: String(await getSettingValue(db, 'gateway_currency') || 'IRT').toUpperCase(), // IRT = ریال | ITP = تومان
    feeMode: String(await getSettingValue(db, 'gateway_fee_mode') || 'none'), // none | payer | merchant
    feePercent: await getNum(db, 'gateway_fee_percent'),
    timeoutMs: await getNum(db, 'gateway_timeout_ms') || 12000,
    invoiceUri: String(await getSettingValue(db, 'gateway_callback_path') || '/pay').replace(/^\/?/, '/'),
    templates: {
      request: parseJson(await getSettingValue(db, 'gateway_custom_request')),
      verify: parseJson(await getSettingValue(db, 'gateway_custom_verify')),
    },
  };
  return cfg;
}

function parseJson(v) {
  if (!v) return null;
  if (typeof v === 'object') return v;
  try {
    const o = JSON.parse(v);
    return o && typeof o === 'object' ? o : null;
  } catch {
    return null;
  }
}

/** تبدیل تومان مبلغ سفارش به واحد پول درگاه */
export function toProviderAmount(toman, currency) {
  const t = Math.max(0, Math.round(Number(toman) || 0));
  const cur = String(currency || 'IRT').toUpperCase();
  if (cur === 'IRR' || cur === 'IRT') return t * 10; // ریال
  return t; // ITP / Toman
}

/** کارمزد؛ در حالت «payer» به مبلغ سفارش اضافه می‌شود */
export function gatewayFee(toman, cfg) {
  const pct = Number(cfg.feePercent) || 0;
  if (!pct || cfg.feeMode === 'none') return 0;
  return Math.round(((Number(toman) || 0) * pct) / 100);
}

// ─── امضای مسیر بازگشت (ضد جعل سفارش) ───
async function sign(env, orderId, amount) {
  const key = await hmacSha256(new TextEncoder().encode('nova-gateway:' + String(env.TELEGRAM_BOT_TOKEN || '')), `${orderId}:${amount}`);
  return toHex(key).slice(0, 16);
}
export async function orderCallbackSig(env, orderId, amount) {
  return sign(env, Number(orderId), Math.round(Number(amount) || 0));
}
export async function checkCallbackSig(env, orderId, amount, sig) {
  const want = await sign(env, Number(orderId), Math.round(Number(amount) || 0));
  return String(sig || '') === want;
}

// ─── ابزار JSON path: «data.link» → obj.data.link ───
export function pickPath(obj, path) {
  if (!path) return undefined;
  let cur = obj;
  for (const part of String(path).split('.')) {
    if (cur == null) return undefined;
    cur = cur[part];
  }
  return cur;
}

const expand = (tpl, vars) =>
  typeof tpl === 'string'
    ? tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => (k in vars ? String(vars[k]) : ''))
    : Array.isArray(tpl)
    ? tpl.map((x) => expand(x, vars))
    : tpl && typeof tpl === 'object'
    ? Object.fromEntries(Object.entries(tpl).map(([k, v]) => [k, expand(v, vars)]))
    : tpl;

async function callApi(url, { method = 'POST', headers = {}, body, timeoutMs = 12000 }) {
  try {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', ...(headers || {}) },
      body: body === undefined || body === null ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const text = await res.text();
    let data = {};
    try {
      data = JSON.parse(text);
    } catch {
      return { ok: false, status: res.status, error: `پاسخ غیر JSON درگاه: ${text.slice(0, 160)}`, raw: text };
    }
    return { ok: res.ok, status: res.status, data };
  } catch (e) {
    return { ok: false, error: `ارتباط با درگاه برقرار نشد: ${String(e && e.message ? e.message : e)}` };
  }
}

/**
 * ساخت فاکتور درگاه.
 * @returns {Promise<{ok:boolean, url?:string, authority?:string, txId?:number, total?:number,
 *   fee?:number, error?:string, message?:string}>}
 */
export async function createPayment(env, order, user, opts = {}) {
  const cfg = await gatewayConfig(env);
  if (!cfg.enabled) return { ok: false, error: 'gateway_disabled', message: 'درگاه بانکی فعال نیست. از کارت‌به‌کارت استفاده کنید.' };
  if (!cfg.merchantId && cfg.provider !== 'custom') return { ok: false, error: 'no_merchant', message: 'مرچنت‌آیدی درگاه در پنل تنظیم نشده است.' };

  const base = await getSettingValue(env.DB, 'worker_origin_public') || (await env.KV.get('worker_origin')) || '';
  const amount = Math.round(Number(order.amount_toman) || 0);
  const fee = cfg.feeMode === 'payer' ? gatewayFee(amount, cfg) : 0;
  const total = amount + fee;
  const providerAmount = toProviderAmount(total, cfg.currency);
  const sig = await sign(env, order.id, amount);
  const callback = `${base}${cfg.invoiceUri}/${order.id}/${sig}`;
  const description = String(opts.description || `سفارش ${order.id} - ${order.title || 'AMINCK'}`).slice(0, 80);

  const vars = {
    base: cfg.base,
    merchant: cfg.merchantId,
    apiKey: cfg.apiKey,
    amount: String(providerAmount),
    toman: String(total),
    orderId: String(order.id),
    userId: String(user?.id || order.user_id),
    callback,
    description,
    authority: '',
  };

  let authority = '';
  let url = '';
  let raw = {};

  if (cfg.provider === 'zarinpal') {
    const r = await callApi(`${cfg.base || 'https://api.zarinpal.com'}/pg/v4/payment/request.json`, {
      timeoutMs: cfg.timeoutMs,
      body: {
        merchant_id: cfg.merchantId,
        amount: providerAmount,
        currency: cfg.currency === 'ITP' ? 'ITP' : 'IRT',
        description,
        callback_url: callback,
        additional_data: { order_id: order.id, user_id: order.user_id },
      },
    });
    raw = r.data || {};
    if (!r.ok || !pickPath(raw, 'data.authority')) {
      const msg = pickPath(raw, 'result.message') || r.error || 'ناموفق';
      await txInsert(env, { order, user, cfg, authority: '', sig, total, fee, status: 'error', raw, error: String(msg) });
      return { ok: false, error: 'gateway_request_failed', message: `درگاه پاسخ نداد: ${msg}` };
    }
    authority = String(pickPath(raw, 'data.authority'));
    url = pickPath(raw, 'data.url') || `https://www.zarinpal.com/pg/StartPay/${authority}`;
  } else if (cfg.provider === 'idpay') {
    const r = await callApi(`${cfg.base || 'https://idpay.ir/pga/api/v1'}/payments`, {
      timeoutMs: cfg.timeoutMs,
      headers: { 'X-API-KEY': cfg.merchantId },
      body: {
        order_id: String(order.id),
        amount: total, // PGA idpay با IRT یعنی تومان
        currency: 'IRT',
        description,
        callback,
        valid_duration: Number(await getSettingValue(env.DB, 'gateway_ttl_minutes')) || 30,
      },
    });
    raw = r.data || {};
    authority = String(raw.id || '');
    if (!r.ok || !authority) {
      const msg = raw?.error?.message || r.error || 'ناموفق';
      await txInsert(env, { order, user, cfg, authority: '', sig, total, fee, status: 'error', raw, error: String(msg) });
      return { ok: false, error: 'gateway_request_failed', message: `درگاه پاسخ نداد: ${msg}` };
    }
    url = raw.link || '';
  } else {
    // حالت قالب آزاد
    const tpl = cfg.templates.request;
    if (!tpl || !tpl.url) return { ok: false, error: 'no_template', message: 'قالب درخواست درگاه سفارشی در پنل تنظیم نشده است.' };
    const r = await callApi(expand(tpl.url, vars), {
      method: tpl.method || 'POST',
      headers: expand(tpl.headers || {}, vars),
      body: tpl.body ? expand(tpl.body, vars) : undefined,
      timeoutMs: cfg.timeoutMs,
    });
    raw = r.data || {};
    if (!r.ok) {
      await txInsert(env, { order, user, cfg, authority: '', sig, total, fee, status: 'error', raw, error: String(r.error || 'bad response') });
      return { ok: false, error: 'gateway_request_failed', message: String(r.error || 'پاسخ نامعتبر درگاه') };
    }
    authority = String(pickPath(raw, tpl.authority_path || 'authority') || '');
    url = String(pickPath(raw, tpl.url_path || 'url') || '');
    if (!authority && !url) {
      await txInsert(env, { order, user, cfg, authority: '', sig, total, fee, status: 'error', raw, error: 'no authority/url in response' });
      return { ok: false, error: 'gateway_bad_shape', message: 'درگاه authority/URL برنگرداند؛ قالب را در پنل اصلاح کنید.' };
    }
  }

  const txId = await txInsert(env, { order, user, cfg, authority, sig, total, fee, status: 'redirected', raw, error: '' });
  await env.DB.prepare('UPDATE orders SET ref=? WHERE id=?').bind(`gw:${authority || txId}`, order.id).run();
  return { ok: true, url, authority, txId, total, fee, amount, callback, provider: cfg.provider };
}

async function txInsert(env, { order, user, cfg, authority, sig, total, fee, status, raw, error }) {
  const res = await env.DB.prepare(
    `INSERT INTO gateway_tx (order_id, user_id, provider, authority, signature, amount_toman, fee_toman, total_toman, status, payload, error, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id`
  )
    .bind(
      order.id,
      user?.id || order.user_id || 0,
      cfg.provider,
      String(authority || ''),
      String(sig || ''),
      Math.max(0, total - fee),
      fee,
      total,
      status,
      JSON.stringify(raw || {}).slice(0, 4000),
      String(error || '').slice(0, 300),
      now()
    )
    .first();
  return Number(res?.id || 0);
}

/**
 * تایید سرور‌به‌سرور پرداخت.
 * @returns {Promise<{ok:boolean, verified?:boolean, refId?:string, cardMask?:string, message:string, tx?:object}>}
 */
export async function verifyPayment(env, txId) {
  const tx = await env.DB.prepare('SELECT * FROM gateway_tx WHERE id=?').bind(Number(txId)).first();
  if (!tx) return { ok: false, message: 'تراکنش یافت نشد.' };
  if (tx.status === 'verified') return { ok: true, verified: true, message: 'قبلاً تایید شده است.', tx };
  const cfg = await gatewayConfig(env);
  const order = await env.DB.prepare('SELECT * FROM orders WHERE id=?').bind(tx.order_id).first();
  if (!order) return { ok: false, message: 'سفارش یافت نشد.', tx };

  let verified = false;
  let refId = '';
  let cardMask = '';
  let message = '';
  let raw = {};

  if (cfg.provider === 'zarinpal') {
    const r = await callApi(`${cfg.base || 'https://api.zarinpal.com'}/pg/v4/payment/verify.json`, {
      timeoutMs: cfg.timeoutMs,
      body: { merchant_id: cfg.merchantId, authority: tx.authority, amount: toProviderAmount(tx.total_toman, cfg.currency) },
    });
    raw = r.data || {};
    const code = Number(pickPath(raw, 'result.code') || 0);
    verified = code === 101; // ۱۰۰ = هنوز وریفای نشده
    refId = String(pickPath(raw, 'data.ref_id') || '');
    cardMask = String(pickPath(raw, 'data.card_masked') || '');
    message = code === 100 ? 'درگاه هنوز این تراکنش را وریفای نکرده است؛ دوباره تلاش کنید.' : String(pickPath(raw, 'result.message') || r.error || 'ناموفق');
    if (code === 200) message = 'این تراکنش قبلاً وریفای شده است (تراکنش تکراری).';
  } else if (cfg.provider === 'idpay') {
    const r = await callApi(`${cfg.base || 'https://idpay.ir/pga/api/v1'}/payments/${tx.authority}`, {
      method: 'GET',
      timeoutMs: cfg.timeoutMs,
      headers: { 'X-API-KEY': cfg.merchantId },
    });
    raw = r.data || {};
    // idpay: status = success|failed|pending و `is_sanitize` یعنی یک‌بار وریفای شده
    const st = String(raw.status || '').toLowerCase();
    verified = st === 'success';
    refId = String(raw.ref_id || '');
    cardMask = String(raw.card_to_card || raw.for_shaba || '');
    message = raw.message || raw.status || (r.ok ? 'وضعیت نامشخص' : 'خطای ارتباط با درگاه');
  } else {
    const tpl = cfg.templates.verify;
    if (!tpl || !tpl.url) return { ok: false, message: 'قالب وریفای درگاه سفارشی تنظیم نشده است.', tx };
    const vars = {
      base: cfg.base,
      merchant: cfg.merchantId,
      apiKey: cfg.apiKey,
      amount: String(toProviderAmount(tx.total_toman, cfg.currency)),
      toman: String(tx.total_toman),
      orderId: String(tx.order_id),
      authority: String(tx.authority),
    };
    const r = await callApi(expand(tpl.url, vars), {
      method: tpl.method || 'POST',
      headers: expand(tpl.headers || {}, vars),
      body: tpl.body ? expand(tpl.body, vars) : undefined,
      timeoutMs: cfg.timeoutMs,
    });
    raw = r.data || {};
    const got = String(pickPath(raw, tpl.success_path || 'success') ?? '');
    const want = String(tpl.success_value ?? 'true');
    verified = got.toLowerCase() === want.toLowerCase();
    refId = String(pickPath(raw, tpl.ref_path || '') ?? '');
    cardMask = String(pickPath(raw, tpl.card_path || '') ?? '');
    message = String(pickPath(raw, tpl.message_path || 'message') ?? (r.ok ? (verified ? 'موفق' : 'ناموفق') : r.error));
  }

  if (!verified) {
    await env.DB.prepare("UPDATE gateway_tx SET status='failed', error=?, payload=?, verified_at=? WHERE id=?")
      .bind(String(message).slice(0, 300), JSON.stringify(raw).slice(0, 4000), now(), tx.id)
      .run();
    return { ok: false, verified: false, message: message || 'واریز ناموفق بود.', tx, raw };
  }

  await env.DB.prepare("UPDATE gateway_tx SET status='verified', ref_id=?, card_masked=?, payload=?, verified_at=? WHERE id=?")
    .bind(refId, cardMask, JSON.stringify(raw).slice(0, 4000), now(), tx.id)
    .run();
  return { ok: true, verified: true, refId, cardMask, message: 'واریز با موفقیت تایید شد.', tx: await env.DB.prepare('SELECT * FROM gateway_tx WHERE id=?').bind(tx.id).first(), raw };
}

/**
 * تسویهٔ یک تراکنشِ وریفای‌شده: CAS روی سفارش → تحویل/شارژ → اعلان.
 * @returns {Promise<{ok:boolean, already?:boolean, sub?:object, charge?:boolean, order?:object, user?:object}>}
 */
export async function settleTx(env, tx, user) {
  const { deliverOrder } = await import('./pay.js');
  const order = await env.DB.prepare('SELECT * FROM orders WHERE id=?').bind(tx.order_id).first();
  if (!order) return { ok: false, error: 'no_order' };
  const claim = `settled:gw:${tx.id}`;
  if (order.status === 'paid') return { ok: true, already: true, order, user };
  // CAS: فقط یک درخواست برندهٔ تحویل می‌شود (جلوگیری از دوباره‌تحویل)
  await env.DB.prepare("UPDATE orders SET note=?, updated_at=? WHERE id=? AND status<>'paid'").bind(claim, now(), order.id).run();
  const after = await env.DB.prepare('SELECT note FROM orders WHERE id=?').bind(order.id).first();
  if (!after || after.note !== claim) return { ok: true, already: true, order, user };

  let meta = {};
  try {
    meta = JSON.parse(order.meta || '{}') || {};
  } catch {}
  const u = user || (await getUser(env.DB, order.user_id));
  if (meta.charge === true || (order.product_id === 0 && !meta.title)) {
    // شارژ کیف پول
    await env.DB.prepare("UPDATE orders SET status='paid', paid_at=? WHERE id=?").bind(now(), order.id).run();
    await env.DB.prepare('UPDATE users SET balance = balance + ?, total_paid = total_paid + ? WHERE id=?')
      .bind(order.amount_toman, order.amount_toman, order.user_id)
      .run();
    return { ok: true, charge: true, order: { ...order, status: 'paid' }, user: u };
  }

  const product = meta.title ? meta : await env.DB.prepare('SELECT * FROM products WHERE id=?').bind(order.product_id).first();
  const sub = await deliverOrder(env, u, product || { title: order.title, protocol: 'vless', days: 30 }, order);
  return { ok: true, sub, product, order: { ...order, status: 'paid' }, user: u };
}

/** بررسی مجدد تراکنش‌های معلق (کرون) — اگر درگاه موفق بود، تسویه شود */
export async function reconcilePendingPayments(env) {
  const cfg = await gatewayConfig(env);
  if (!cfg.enabled) return { checked: 0, settled: 0 };
  const pending = (
    await env.DB.prepare("SELECT * FROM gateway_tx WHERE status='redirected' AND created_at>? ORDER BY id ASC LIMIT 20").bind(now() - 24 * 3600).all()
  ).results;
  let settled = 0;
  for (const tx of pending) {
    const v = await verifyPayment(env, tx.id);
    if (v.ok && v.verified) {
      const res = await settleTx(env, v.tx);
      if (res.ok && !res.already) {
        settled++;
        const u = res.user;
        if (u) {
          const { sendDelivery } = await import('./pay.js');
          if (res.sub) await sendDelivery(env, u, res.order.title || 'سفارش', res.sub, { protocol: res.product?.protocol });
          else {
            const { send } = await import('./tg.js');
            await send(env.TELEGRAM_BOT_TOKEN, u.id, `✅ <b>پرداخت درگاهی تایید شد</b>\n\n👛 ${fmtToman(res.order.amount_toman)} به کیف پول شما اضافه شد.`);
          }
        }
        await notifyAdmins(env, 'gateway', `🏦 ✅ پرداخت درگاهی تسویه شد\n🧾 سفارش #${faDigits(tx.order_id)} — ${fmtToman(tx.total_toman)}\n🔖 ردیف: ${tx.ref_id || '—'}`);
      }
    }
  }
  return { checked: pending.length, settled };
}

/** تست اتصال درگاه از پنل (بدون ساخت فاکتور) */
export async function testGateway(env) {
  const cfg = await gatewayConfig(env);
  if (!cfg.provider || cfg.provider === 'none') return { ok: false, message: 'درگاه انتخاب نشده است (وضعیت: کارت‌به‌کارت).' };
  if (!cfg.merchantId && cfg.provider !== 'custom') return { ok: false, message: 'مرچنت‌آیدی خالی است.' };
  if (cfg.provider === 'zarinpal') {
    const r = await callApi(`${cfg.base || 'https://api.zarinpal.com'}/pg/v4/payment/refresh-authority.json`, {
      timeoutMs: cfg.timeoutMs,
      body: { merchant_id: cfg.merchantId, amount: toProviderAmount(1, cfg.currency) },
    });
    const d = r.data || {};
    const ok = Number(pickPath(d, 'result.code')) === 100 || !!pickPath(d, 'data.authority');
    return {
      ok,
      message: ok
        ? `✅ اتصال برقرار شد — موجودی: ${faDigits(Math.round(Number(pickPath(d, 'data.balance') || 0) / 10).toLocaleString('en-US'))} تومان`
        : `⚠️ درگاه پاسخ داد اما تایید نکرد: ${pickPath(d, 'result.message') || r.error || 'نامشخص'}`,
      raw: { status: r.status },
    };
  }
  if (cfg.provider === 'idpay') {
    const r = await callApi(`${cfg.base || 'https://idpay.ir/pga/api/v1'}/verify`, { method: 'GET', timeoutMs: cfg.timeoutMs, headers: { 'X-API-KEY': cfg.merchantId } });
    return { ok: r.ok, message: r.ok ? '✅ درگاه در دسترس است.' : `⚠️ ${r.error || `خطای HTTP ${r.status}`}` };
  }
  const tpl = cfg.templates.request;
  if (!tpl || !tpl.url) return { ok: false, message: 'قالب درخواست سفارشی تنظیم نشده است.' };
  const r = await callApi(expand(tpl.url, { base: cfg.base, merchant: cfg.merchantId, apiKey: cfg.apiKey, amount: '1000', toman: '100', orderId: 'test', callback: 'https://example.invalid/cb', description: 'test', authority: '' }), {
    method: tpl.method || 'POST',
    headers: expand(tpl.headers || {}, {}),
    body: tpl.body ? expand(tpl.body, { amount: '1000', toman: '100', orderId: 'test', callback: 'https://example.invalid/cb', description: 'test' }) : undefined,
    timeoutMs: cfg.timeoutMs,
  });
  return { ok: r.ok, message: r.ok ? '✅ درگاه سفارشی پاسخ داد.' : `⚠️ ${r.error || `خطای HTTP ${r.status}`}` };
}

/** مسیر بازگشت کاربر از درگاه: GET /pay/:orderId/:sig */
export async function handleGatewayCallback(env, request, url) {
  const parts = url.pathname.split('/').filter(Boolean); // ['pay', orderId, sig]
  const orderId = Number(parts[1]);
  const sig = parts[2] || '';
  if (!orderId) return new Response('not found', { status: 404 });
  const order = await env.DB.prepare('SELECT * FROM orders WHERE id=?').bind(orderId).first();
  if (!order) return page({ ok: false, title: 'سفارش یافت نشد', text: 'شماره سفارش در سیستم ما وجود ندارد.' });
  if (!(await checkCallbackSig(env, orderId, order.amount_toman, sig))) return page({ ok: false, title: 'امضای نامعتبر', text: 'لینک بازگشت معتبر نیست.' });

  const tx = await env.DB.prepare("SELECT * FROM gateway_tx WHERE order_id=? ORDER BY id DESC LIMIT 1").bind(orderId).first();
  if (!tx) return page({ ok: false, title: 'تراکنشی ثبت نشده', text: 'برای این سفارش تراکنش درگاهی پیدا نشد.' });

  if (order.status === 'paid' || tx.status === 'verified') {
    return page({ ok: true, title: 'پرداخت انجام شده', text: 'این سفارش قبلاً تسویه شده است.', subToken: order.sub_token });
  }

  const v = await verifyPayment(env, tx.id);
  if (!v.ok || !v.verified) {
    const bot = await getSettingValue(env.DB, 'bot_username');
    return page({
      ok: false,
      title: 'پرداخت تایید نشد',
      text: (v.message || 'واریز موفق نبود.') + '\nمبلغ از حساب شما آزاد می‌شود (معمولاً تا ۷۲ ساعت کاری). اگر مبلغ کسر شده و اینجا خطا دیدید، به پشتیبانی پیام دهید.',
      retryUrl: bot ? `https://t.me/${bot}?start=pay_${orderId}` : '',
    });
  }
  const res = await settleTx(env, v.tx);
  if (!res.ok) return page({ ok: false, title: 'خطای ثبت سفارش', text: 'پرداخت تایید شد اما ثبت آن با خطا مواجه شد؛ به پشتیبانی پیام دهید.' });
  if (res.sub) {
    const { sendDelivery } = await import('./pay.js');
    if (res.user) await sendDelivery(env, res.user, res.order.title || 'سفارش', res.sub, { protocol: res.product?.protocol });
  } else if (res.user && !res.already) {
    const { send } = await import('./tg.js');
    await send(env.TELEGRAM_BOT_TOKEN, res.user.id, `✅ <b>پرداخت درگاهی موفق</b>\n\n👛 ${fmtToman(res.order.amount_toman)} به کیف پول شما اضافه شد.`);
  }
  if (!res.already) {
    await notifyAdmins(env, 'gateway', `🏦 ✅ پرداخت درگاهی\n👤 ${res.user?.id || order.user_id}\n💰 ${fmtToman(tx.total_toman)} — سفارش #${faDigits(orderId)}\n🔖 ${v.refId || '—'} | کارت ${v.cardMask || '—'}`);
  }
  return page({ ok: true, title: 'پرداخت موفق ✅', text: 'کانفیگ/اشتراک شما فعال شد و در تلگرام ارسال شد.', subToken: res.sub?.token || order.sub_token });
}

function page({ ok, title, text, subToken = '', retryUrl = '' }) {
  const html = `<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${ok ? '✅' : '⚠️'} ${title}</title>
<style>
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0d1526;color:#eaf1ff;font-family:Vazirmatn,Segoe UI,Tahoma,sans-serif}
.c{width:min(92vw,460px);background:#14213d;border:1px solid #2a3b5f;border-radius:20px;padding:26px;text-align:center;box-shadow:0 18px 60px #0006}
h1{font-size:20px;margin:0 0 10px}p{color:#9db0d2;font-size:14px;line-height:2;white-space:pre-line;margin:0 0 14px}
a{display:block;border-radius:12px;padding:12px;margin:8px 0;text-decoration:none;font-weight:800}
.p{background:linear-gradient(135deg,#f5b31e,#ff8a00);color:#171305}
.s{border:1px solid #2a3b5f;color:#9db0d2;font-weight:600}
</style></head><body><main class="c">
<h1>${ok ? '✅' : '⚠️'} ${title}</h1><p>${String(text).replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]))}</p>
${subToken ? `<a class="p" href="/sub/${encodeURIComponent(subToken)}">🔗 مشاهده اشتراک من</a>` : ''}
${retryUrl ? `<a class="s" href="${retryUrl}">🔁 تلاش دوباره در تلگرام</a>` : ''}
</main></body></html>`;
  return new Response(html, { status: ok ? 200 : 400, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

/** ذخیرهٔ تنظیمات درگاه از پنل (کلیدها allowlist شده‌اند) */
const GATEWAY_KEYS = [
  'gateway_enabled', 'gateway_provider', 'gateway_api_base', 'gateway_merchant_id', 'gateway_api_key',
  'gateway_currency', 'gateway_fee_mode', 'gateway_fee_percent', 'gateway_callback_path', 'gateway_ttl_minutes',
  'gateway_timeout_ms', 'gateway_custom_request', 'gateway_custom_verify', 'gateway_auto_reconcile',
];

export async function saveGatewaySettings(db, data = {}) {
  const saved = [];
  for (const k of GATEWAY_KEYS) {
    if (!(k in data)) continue;
    let v = data[k];
    if (k === 'gateway_provider') {
      v = String(v || 'none').toLowerCase();
      if (!GATEWAY_PROVIDERS.includes(v)) v = 'none';
    }
    if (k === 'gateway_currency') v = ['IRT', 'IRR', 'ITP'].includes(String(v).toUpperCase()) ? String(v).toUpperCase() : 'IRT';
    if (k === 'gateway_fee_mode') v = ['none', 'payer', 'merchant'].includes(String(v)) ? String(v) : 'none';
    if (k === 'gateway_enabled' || k === 'gateway_auto_reconcile') v = v === true || v === '1' || v === 1 ? '1' : '0';
    if (k === 'gateway_fee_percent' || k === 'gateway_timeout_ms' || k === 'gateway_ttl_minutes') v = String(Math.max(0, Number(v) || 0));
    if (k === 'gateway_custom_request' || k === 'gateway_custom_verify') {
      const parsed = typeof v === 'string' ? parseJson(v) : v;
      if (!parsed) return { ok: false, error: `قالب ${k} JSON معتبر نیست.` };
      v = JSON.stringify(parsed);
    }
    if (k === 'gateway_callback_path') v = String(v || '/pay').replace(/^\/?/, '/').slice(0, 24);
    await setSetting(db, k, String(v));
    saved.push(k);
  }
  return { ok: true, saved };
}

/** DTO برای فرم پنل — کلید API و مرچنت به‌صورت ماسک‌شده */
export async function gatewayDto(env) {
  const cfg = await gatewayConfig(env);
  const mask = (s) => (s ? s.slice(0, 3) + '•'.repeat(Math.max(0, s.length - 6)) + s.slice(-3) : '');
  const raw = {
    gateway_enabled: cfg.enabled && cfg.provider !== 'none' ? '1' : '0',
    gateway_provider: cfg.provider,
    gateway_api_base: cfg.base,
    gateway_currency: cfg.currency,
    gateway_fee_mode: cfg.feeMode,
    gateway_fee_percent: cfg.feePercent,
    gateway_callback_path: cfg.invoiceUri,
    gateway_timeout_ms: cfg.timeoutMs,
  };
  const db = env.DB;
  return {
    ...raw,
    merchant_masked: mask(cfg.merchantId),
    key_masked: mask(cfg.apiKey),
    has_merchant: !!cfg.merchantId,
    has_key: !!cfg.apiKey,
    custom_request: String(await getSettingValue(db, 'gateway_custom_request') || ''),
    custom_verify: String(await getSettingValue(db, 'gateway_custom_verify') || ''),
    auto_reconcile: (await getSettingValue(db, 'gateway_auto_reconcile')) === '1',
    ttl_minutes: await getSettingValue(db, 'gateway_ttl_minutes'),
    note: 'برای پرداخت واقعی، اکانت درگاه باید خودتان را داشته باشد؛ این ربات هیچ وجهی را برای شما دریافت یا نگهداری نمی‌کند.',
  };
}

/** خلاصهٔ تراکنش‌های درگاه برای پنل */
export async function gatewayTxList(env, limit = 20) {
  const rows = await env.DB.prepare('SELECT * FROM gateway_tx ORDER BY id DESC LIMIT ?').bind(Math.min(100, Math.max(1, Number(limit) || 20))).all();
  return (rows.results || []).map((t) => ({
    id: t.id,
    order: t.order_id,
    user: t.user_id,
    provider: t.provider,
    status: t.status,
    amount: t.amount_toman,
    fee: t.fee_toman,
    total: t.total_toman,
    ref: t.ref_id,
    card: t.card_masked,
    error: t.error,
    at: t.created_at,
    verified: t.verified_at,
  }));
}
