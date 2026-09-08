// ═══════════════════════════════════════════════════════════════════
//  موتور سفارش و پرداخت — کیف پول، کارت، سکه، تحویل و پاداش رفرال
// ═══════════════════════════════════════════════════════════════════
import { createSubscription, checkDeliverable, buildDirectLinks } from './subs.js';
import { addBalance, getUser, fmtToman, faDigits, fmtDate } from './db.js';
import { getNum, getSettingValue } from './texts.js';
import { send, ikb, ubtn, btn } from './tg.js';
import { deepLink, getBase } from './util.js';
import { deliveryKind, NO_REAL_SERVER_MESSAGE, NoRealServerError, serverIssues } from './proxy.js';

/**
 * پیش از هر کسر وجه بررسی می‌کند که محصول واقعاً قابل تحویل است.
 * @returns {Promise<{ok:boolean, reason?:string, message?:string}>}
 */
export async function assertDeliverable(env, product) {
  const res = await checkDeliverable(env.DB, product || {});
  if (res.ok) return { ok: true };
  return { ok: false, reason: 'no_real_server', message: NO_REAL_SERVER_MESSAGE };
}

/** ایجاد سفارش */
export async function createOrder(env, userId, product, amountToman, method, status = 'pending') {
  const now = Math.floor(Date.now() / 1000);
  const res = await env.DB.prepare(
    `INSERT INTO orders (user_id, product_id, title, amount_toman, method, status, created_at)
     VALUES (?,?,?,?,?,?,?) RETURNING *`
  )
    .bind(userId, product.id || 0, product.title || '', amountToman, method, status, now)
    .first();
  return res;
}

/** ثبت ساب برای سفارش و بستن حلقه تحویل */
export async function deliverOrder(env, user, product, order) {
  const sub = await createSubscription(env, user, product, { orderId: order?.id });
  if (order) {
    await env.DB.prepare("UPDATE orders SET status='paid', sub_token=?, expire_at=?, paid_at=? WHERE id=?")
      .bind(sub.token, sub.expire, Math.floor(Date.now() / 1000), order.id)
      .run();
    await env.DB.prepare('UPDATE subscriptions SET order_id=? WHERE token=?').bind(order.id, sub.token).run();
    await env.DB.prepare('UPDATE users SET total_paid = total_paid + ? WHERE id=?').bind(order.amount_toman || 0, user.id).run();
  }
  await afterPurchase(env, user, order);
  return sub;
}

/** پاداش رفرال بعد از اولین خرید زیرمجموعه */
async function afterPurchase(env, buyer, order) {
  const { DB } = env;
  const amount = order?.amount_toman || 0;
  const fresh = await getUser(DB, buyer.id);
  if (!fresh?.referrer_id || fresh.ref_first_paid) return;
  const percent = await getNum(DB, 'referral_percent', 10);
  const reward = Math.round((amount * percent) / 100 / 1000) * 1000;
  if (reward <= 0) return;
  await DB.prepare('UPDATE users SET ref_first_paid=1 WHERE id=?').bind(fresh.id).run();
  await addBalance(DB, fresh.referrer_id, reward);
  await DB.prepare('UPDATE users SET invited_count = invited_count + 1 WHERE id=?').bind(fresh.referrer_id).run();
  const ref = await getUser(DB, fresh.referrer_id);
  const goal = await getNum(DB, 'referral_goal', 5);
  let extra = '';
  if (ref && ref.invited_count >= goal && !ref.reward_claimed) {
    // 🎁 جایزه ۵ دعوت: یک کانفیگ رایگان از ارزان‌ترین محصول فعال
    const cheap = await DB.prepare("SELECT * FROM products WHERE enabled=1 AND category!='coin' ORDER BY price_usd ASC LIMIT 1").first();
    if (cheap) {
      try {
        await createSubscription(env, ref, cheap, {});
        await DB.prepare('UPDATE users SET reward_claimed=1 WHERE id=?').bind(ref.id).run();
        extra = `\n\n🎉 تبریک! به پاس ${faDigits(goal)} دعوت موفق، یک کانفیگ رایگان به حساب شما اضافه شد. 🎁`;
      } catch (e) {
        // بدون سرور واقعی، جایزه ساخته نمی‌شود (و claim هم مصرف نمی‌شود)
        if (!(e instanceof NoRealServerError)) throw e;
        extra = `\n\n🎁 جایزهٔ ${faDigits(goal)} دعوت شما ثبت شد؛ به‌محض آماده‌شدن سرورها فعال می‌شود.`;
      }
    }
  }
  await send(
    env.TELEGRAM_BOT_TOKEN,
    fresh.referrer_id,
    `💸 <b>پاداش زیرمجموعه واریز شد!</b>\n\nزیرمجموعه شما اولین خریدش را انجام داد و ${fmtToman(reward)} (${faDigits(percent)}٪) به کیف پول شما اضافه شد. 👛${extra}`
  );
}

/** پرداخت با کیف پول */
export async function payWithWallet(env, user, product, priceToman) {
  const fresh = await getUser(env.DB, user.id);
  // ⛔ ابتدا قابلیت تحویل، بعد کسر وجه — تا پول کاربر بی‌دلیل کم نشود
  const can = await assertDeliverable(env, product);
  if (!can.ok) return { ok: false, reason: can.reason, message: can.message };
  if (fresh.balance < priceToman) return { ok: false, reason: 'موجودی کافی نیست' };
  await addBalance(env.DB, user.id, -priceToman);
  const order = await createOrder(env, user.id, product, priceToman, 'wallet', 'paid');
  const sub = await deliverOrder(env, user, product, order);
  return { ok: true, order, sub };
}

/** پرداخت با سکه (فروشگاه مینی‌اپ) */
export async function payWithCoins(env, user, product) {
  const fresh = await getUser(env.DB, user.id);
  const can = await assertDeliverable(env, product);
  if (!can.ok) return { ok: false, reason: can.reason, message: can.message };
  if (fresh.coins < product.coin_price) return { ok: false, reason: 'سکه کافی نیست' };
  await env.DB.prepare('UPDATE users SET coins = coins - ? WHERE id=?').bind(product.coin_price, user.id).run();
  const order = await createOrder(env, user.id, product, 0, 'coins', 'paid');
  const sub = await deliverOrder(env, user, product, order);
  return { ok: true, order, sub };
}

/** تایید فیش و تحویل */
export async function approveReceipt(env, receipt) {
  const { DB } = env;
  const order = await DB.prepare('SELECT * FROM orders WHERE id=?').bind(receipt.order_id).first();
  if (!order || order.status === 'paid') return null;
  const user = await getUser(DB, order.user_id);

  // شارژ کیف پول — بدون ساخت ساب.
  // سفارش شارژ صراحتاً با meta.charge=true علامت‌گذاری می‌شود (ستون meta
  // پیش‌فرض '{}' است، پس تکیه بر خالی‌بودن آن قابل اعتماد نبود).
  let meta = {};
  try {
    meta = JSON.parse(order.meta || '{}') || {};
  } catch {}
  const isCharge = meta.charge === true || (order.product_id === 0 && !meta.title);

  let product = null;
  if (!isCharge) {
    product = meta && meta.title ? meta : null;
    if (!product) {
      product = (await DB.prepare('SELECT * FROM products WHERE id=?').bind(order.product_id).first()) || {
        title: order.title,
        protocol: 'vless',
        days: 30,
        server_count: 10,
      };
    }
    // ⛔ اگر سرور واقعی نداریم، سفارش «پرداخت‌شده» علامت نمی‌خورد و فیش در صف می‌ماند
    const can = await assertDeliverable(env, product);
    if (!can.ok) return { error: 'no_real_server', message: can.message, user, order };
  }

  await DB.prepare("UPDATE receipts SET status='approved' WHERE id=?").bind(receipt.id).run();
  await DB.prepare("UPDATE orders SET status='paid', paid_at=? WHERE id=?").bind(Math.floor(Date.now() / 1000), order.id).run();

  if (isCharge) {
    await addBalance(DB, order.user_id, order.amount_toman);
    await DB.prepare('UPDATE users SET total_paid = total_paid + ? WHERE id=?').bind(order.amount_toman, user.id).run();
    return { user, order, charge: true };
  }

  const sub = await createSubscription(env, user, product, { orderId: order.id });
  await DB.prepare('UPDATE orders SET sub_token=?, expire_at=? WHERE id=?').bind(sub.token, sub.expire, order.id).run();
  await DB.prepare('UPDATE users SET total_paid = total_paid + ? WHERE id=?').bind(order.amount_toman, user.id).run();
  await afterPurchase(env, user, order);
  return { user, order, sub, product };
}

/**
 * پیام تحویل نهایی — دقیقاً یک‌بار برای هر اشتراک ارسال می‌شود.
 *
 * • MTProto → لینک اتصال مستقیم تلگرام (دکمهٔ «🔗 اتصال مستقیم در تلگرام»)
 * • SOCKS5  → لینک مستقیم tg://socks
 * • VLESS/VMess/Trojan/SS → لینک اشتراک /sub/<token>
 *
 * ضدتکرار: با قفل اتمیک روی ستون delivery_claim، حتی اگر callback یا retry
 * چندبار اجرا شود، پیام دوباره فرستاده نمی‌شود.
 *
 * @returns {Promise<{sent:boolean, reason?:string}>}
 */
export async function sendDelivery(env, user, productTitle, sub, opts = {}) {
  const { DB } = env;

  // ── قفل ضدتکرار ──
  if (sub?.token && !opts.force) {
    const claim = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    const before = await DB.prepare('SELECT delivered_at FROM subscriptions WHERE token=?').bind(sub.token).first();
    if (before && Number(before.delivered_at || 0) > 0) return { sent: false, reason: 'already_delivered' };
    if (before) {
      await DB.prepare('UPDATE subscriptions SET delivered_at=?, delivery_claim=? WHERE token=? AND COALESCE(delivered_at,0)=0')
        .bind(Math.floor(Date.now() / 1000), claim, sub.token)
        .run();
      const after = await DB.prepare('SELECT delivery_claim FROM subscriptions WHERE token=?').bind(sub.token).first();
      if (after && after.delivery_claim && after.delivery_claim !== claim) return { sent: false, reason: 'already_delivered' };
    }
  }

  // ── سرورهای این اشتراک ──
  let servers = sub?.servers || [];
  if ((!servers || !servers.length) && sub?.token) {
    const row = await DB.prepare('SELECT server_ids FROM subscriptions WHERE token=?').bind(sub.token).first();
    const ids = JSON.parse(row?.server_ids || '[]');
    servers = ids.length
      ? (await DB.prepare(`SELECT * FROM servers WHERE id IN (${ids.map(() => '?').join(',')})`).bind(...ids).all()).results
      : [];
  }
  const usable = (servers || []).filter((s) => serverIssues(s).length === 0);
  const protocol = String(opts.protocol || usable[0]?.protocol || 'vless').toLowerCase();
  const kind = deliveryKind(protocol);

  const expireLine = `🗓 اعتبار تا: <b>${fmtDate(sub.expire)}</b>`;
  const header = `✅ <b>خرید شما تکمیل شد</b>\n\n📦 <b>${productTitle}</b>\n${expireLine}`;

  // ── تحویل مستقیم (MTProto / SOCKS5) ──
  if (kind === 'mtproto' || kind === 'socks5') {
    const links = buildDirectLinks(usable, user.username || '');
    const wanted = links.filter((l) => l.kind === kind);
    if (!wanted.length) {
      // ⛔ لینک جعلی ساخته نمی‌شود — خطای واضح به ادمین
      await notifyAdminsDeliveryFailure(env, user, productTitle, protocol, usable);
      await send(
        env.TELEGRAM_BOT_TOKEN,
        user.id,
        `⚠️ سفارش شما ثبت شد اما تحویل خودکار ممکن نشد.\n\n📦 ${productTitle}\nتیم پشتیبانی در جریان قرار گرفت و به‌زودی کانفیگ را برایتان می‌فرستد. 🙏`,
        { reply_markup: ikb([[btn('🧑‍💼 اتصال به اپراتور', 'op:connect')]]) }
      );
      return { sent: false, reason: 'incomplete_server_config' };
    }
    const label = kind === 'mtproto' ? 'پروکسی MTProto تلگرام' : 'پروکسی SOCKS5 تلگرام';
    const lines = [
      header,
      '',
      `📡 <b>${label}</b> — با یک کلیک روی دکمهٔ زیر، تلگرام باز می‌شود و پروکسی اضافه می‌گردد. 👇`,
      '',
      ...wanted.map((l) => `▪️ <b>${l.server.name || 'سرور'}</b>${l.server.country ? ' — ' + l.server.country : ''}\n<code>${l.tg}</code>`),
      '',
      '💡 اگر روی کامپیوتر هستید، لینک بالا را کپی و در تلگرام دسکتاپ باز کنید.',
    ];
    const rows = wanted
      .slice(0, 5)
      .map((l) => [ubtn(`🔗 اتصال مستقیم در تلگرام${wanted.length > 1 ? ' — ' + (l.server.name || '') : ''}`, l.https)]);
    rows.push([btn('📞 پشتیبانی', 'sup:open')]);
    await send(env.TELEGRAM_BOT_TOKEN, user.id, lines.join('\n'), { reply_markup: ikb(rows) });
    return { sent: true };
  }

  // ── تحویل اشتراکی (VLESS/VMess/Trojan/SS/…) ──
  const base = await getBase(env);
  const subUrl = base ? `${base}/sub/${sub.token}` : '';
  const lines = [
    header,
    '',
    subUrl ? `🔗 لینک اشتراک اختصاصی شما:\n<code>${subUrl}</code>` : '🔗 لینک اشتراک به‌زودی ارسال می‌شود.',
    '',
    `🖥 این اشتراک شامل ${faDigits(usable.length)} سرور است؛ اگر یکی قطع شد، بعدی را انتخاب کنید. سرورهای مرده به‌صورت خودکار جایگزین می‌شوند. 🔄`,
  ];
  const rows = [[btn('🔳 QR Code اشتراک', `qr:${sub.token}`)]];
  if (subUrl) rows.push([ubtn('🌐 صفحهٔ اشتراک', subUrl)]);
  rows.push([btn('📞 پشتیبانی', 'sup:open')]);
  await send(env.TELEGRAM_BOT_TOKEN, user.id, lines.join('\n'), { reply_markup: ikb(rows) });
  return { sent: true };
}

/** خطای واضح تحویل به ادمین‌ها (بدون هیچ داده حساس) */
async function notifyAdminsDeliveryFailure(env, user, productTitle, protocol, servers) {
  const admins = (await env.DB.prepare("SELECT id FROM users WHERE role IN ('super','admin')").all()).results || [];
  const detail = (servers || []).length
    ? servers.map((s) => `• ${s.name}: ${serverIssues(s).join(' / ') || 'نامشخص'}`).join('\n')
    : 'هیچ سرور فعال و کاملی برای این پروتکل ثبت نشده است.';
  const text =
    `⛔ <b>تحویل خودکار ناموفق</b>\n\n` +
    `👤 کاربر: <code>${user.id}</code>\n` +
    `📦 محصول: ${productTitle}\n` +
    `🔌 پروتکل: <code>${protocol}</code>\n\n` +
    `📋 دلیل:\n${detail}\n\n` +
    `👈 از «🖥 سرورها» در پنل مدیریت، host/IP، port و secret واقعی را ثبت کنید.`;
  for (const a of admins) await send(env.TELEGRAM_BOT_TOKEN, a.id, text);
}

/** ساخت لینک دیپ‌لینک محصول برای گروه‌ها */
export function productDeepLink(botUsername, productId) {
  return deepLink(botUsername, `shop_${productId}`);
}
